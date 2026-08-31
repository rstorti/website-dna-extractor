// Catch startup crashes immediately
const _processStartTime = Date.now();
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  // Only exit during the first 15 s (startup phase). After that, log only.
  // Calling process.exit in production would kill the server for ALL users
  // because of a single rejected promise from one request.
  if (Date.now() - _processStartTime < 15_000) process.exit(1);
});

// Load and validate environment variables immediately
const env = require('./config/env');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const dns = require('dns');
const crypto = require('crypto');
const axios = require('axios');
const multer = require('multer');
const { JobStore } = require('./lib/jobStore');
const { assertRuntimeReadiness } = require('./lib/runtimeGuards');
const { scrapeLinkedinProfile } = require('./lib/linkedinScraper');
const { extractTextFromDocument, extractEntitiesWithAI } = require('./lib/documentExtractor');

// Shared extraction counter. Routes reserve capacity after validation, before
// accepting a job, so malformed requests cannot consume slots.
let activeExtractions = 0;

// Force IPv4 resolution to prevent Supabase connection timeouts on systems with broken IPv6
dns.setDefaultResultOrder('ipv4first');

// ── Lightweight profile-page scraper (no Puppeteer) ─────────────────────────
// Linktree, Beacon, Bento etc. embed all link data in a JSON blob in the HTML.
// Using axios instead of native http.get means gzip/brotli responses are
// decompressed automatically, and redirect-following is built-in (maxRedirects).
async function scrapeProfileLightweight(profileUrl) {
  try {
    const { isAllowedUrl, safeHttpAgent, safeHttpsAgent } = require('./lib/validateUrl.js');
    let currentUrl = profileUrl;
    let response;
    let redirects = 0;
    while (redirects < 5) {
      const { ok, reason } = await isAllowedUrl(currentUrl);
      if (!ok) throw new Error(`SSRF Block: ${reason}`);

      response = await axios.get(currentUrl, {
        httpAgent: safeHttpAgent,
        httpsAgent: safeHttpsAgent,
        timeout: 10000,
        maxRedirects: 0,           // Handle manually to block SSRF on redirects
        decompress: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        let loc = response.headers.location;
        if (!loc.startsWith('http')) loc = new URL(loc, currentUrl).toString();
        currentUrl = loc;
        redirects++;
      } else if (response.status >= 200 && response.status < 300) {
        break;
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
    }
    
    if (!response || response.status >= 300) throw new Error('Too many redirects');

    // axios returns response.data as a string when content-type is text/html
    const raw = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data);

    const links = [];
    const socialLinks = [];
    let displayName = '';

    // Try Linktree's __NEXT_DATA__ JSON blob first (most reliable)
    const nextDataMatch = raw.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const account = nextData?.props?.pageProps?.account || nextData?.props?.pageProps?.profile || {};
        displayName = account.name || account.username || '';
        const linktreeLinks = account.links || account.content_nodes || [];
        linktreeLinks.forEach(l => {
          const href = l.url || l.href || l.value;
          const title = l.title || l.label || l.text;
          if (href) links.push({ url: href, button_name: title || href, context: 'Profile Link' });
        });
      } catch(e) {}
    }

    // Fallback: scan all <a> tags for outbound links
    if (links.length === 0) {
      let profileHost = '';
      try { profileHost = new URL(profileUrl).hostname; } catch(e) {}
      const anchorRegex = /<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([^<]*)</gi;
      let m;
      while ((m = anchorRegex.exec(raw)) !== null) {
        const href = m[1];
        const label = m[2].trim();
        if (href.startsWith('http') && profileHost && !href.includes(profileHost)) {
          links.push({ url: href, button_name: label || href, context: 'Profile Link' });
        }
      }
    }

    // Extract title as display name fallback
    if (!displayName) {
      const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) displayName = titleMatch[1].replace(/\s*[|\-\u2013].*$/, '').trim();
    }

    console.log(`[Profile Lite] Scraped ${links.length} links for ${profileUrl}`);
    return { success: true, links, socialLinks, displayName };

  } catch (e) {
    const msg = e.code === 'ECONNABORTED' ? 'Lightweight fetch timed out' : e.message;
    console.warn(`[Profile Lite] Failed for ${profileUrl}: ${msg}`);
    return { success: false, error: msg };
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// LAZY LOAD heavy modules -- defer until first extraction request
let _extractor = null;
let _aiVerifier = null;
let _youtubeExtractor = null;
let _supabase = null;

function getExtractor() {
  if (!_extractor) {
    console.log('[BOOT] Loading extractor module...');
    _extractor = require('./extractor.js');
  }
  return _extractor;
}
function getAiVerifier() {
  if (!_aiVerifier) {
    console.log('[BOOT] Loading AI verifier module...');
    _aiVerifier = require('./ai_verifier.js');
  }
  return _aiVerifier;
}
function getYoutubeExtractor() {
  if (!_youtubeExtractor) {
    console.log('[BOOT] Loading YouTube extractor module...');
    _youtubeExtractor = require('./youtube_extractor.js');
  }
  return _youtubeExtractor;
}
function getSupabase() {
  if (!_supabase) {
    console.log('[BOOT] Loading Supabase client...');
    _supabase = require('./supabaseClient');
  }
  return _supabase;
}

const jobStore = new JobStore({ getSupabase });

const app = express();
app.set('trust proxy', 1);
const PORT = env.PORT;
const HISTORY_FILE = path.join(__dirname, '.data', 'history.json');

// Mutex to prevent race conditions during concurrent local history file read/writes
let localHistoryMutex = Promise.resolve();

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    let hostname;
    try {
      hostname = new URL(origin).hostname.toLowerCase();
    } catch {
      return callback(null, false);
    }
    
    // Exact domain matching to prevent substring bypasses
    const allowedExact = ['localhost', '127.0.0.1'];
    const allowedSuffixes = [
      '.railway.app', 
      '.netlify.app', 
      '.minfo.com', 
      'minfo.com', 
      '.lovable.app', 
      'lovable.app', 
      '.lovableproject.com', 
      'lovableproject.com'
    ];

    if (allowedExact.includes(hostname) || allowedSuffixes.some(suffix => hostname === suffix || hostname.endsWith(suffix))) {
      return callback(null, true);
    }
    return callback(null, false);
  }
}));
app.use(express.json());

// Explicitly serve local outputs folder natively (dev only) to prevent 404 proxy loops
if (env.NODE_ENV !== 'production') {
  app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
}

// Root route — Railway (and other PaaS) health checks hit GET / and expect a 200.
// Without this, the server returns Express's default "Cannot GET /" 404 and
// Railway interprets it as a crash, sending deploy-failed emails.
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'website-dna-extractor', health: '/api/health' });
});

// Health Endpoint — shows uptime + env var status for quick diagnosis
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    platform: process.env.RAILWAY_PUBLIC_DOMAIN ? 'railway' : (env.RENDER_EXTERNAL_URL ? 'render' : 'local'),
    env: {
      GEMINI_API_KEY: env.GEMINI_API_KEY ? 'SET' : '❌ MISSING',
      YOUTUBE_API_KEY: env.YOUTUBE_API_KEY ? 'SET' : 'not set (optional)',
      SUPABASE_URL: env.SUPABASE_URL ? 'SET' : '⚠️ not set — images will use localhost fallback',
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ? 'SET' : '⚠️ not set',
      GCP_CREDENTIALS: process.env.GCP_CREDENTIALS_JSON ? 'SET' : '⚠️ not set — Vertex AI image gen disabled',
      SERVER_URL: process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : (env.RENDER_EXTERNAL_URL || '⚠️ localhost fallback'),
    }
  });
});

// Proxy Download Endpoint to fix CORS extension issues
app.get('/api/download', requireAuthSession, async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).send('URL missing');

    const safeFilename = path.basename(filename || 'download.png').replace(/[^a-zA-Z0-9_\-\.]/g, '');

    // Handle fallback paths if Supabase Cloud Upload failed
    if (url.startsWith('/outputs/')) {
      if (env.NODE_ENV === 'production') return res.status(404).send('Local outputs not served in production');
      
      const outputsDir = path.resolve(__dirname, 'outputs');
      const localPath = path.resolve(__dirname, url.slice(1)); // slice off leading '/'
      
      // Ensure resolved path is still within the outputs directory (traversal prevention)
      if (!localPath.startsWith(outputsDir + path.sep)) {
        return res.status(403).send('Path traversal blocked');
      }

      try {
        await fs.access(localPath);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        return res.sendFile(localPath);
      } catch {
        return res.status(404).send('Local file not found');
      }
    }

    // SSRF whitelist: only permit Supabase storage or exact-pattern Google favicon URLs.
    // Parse the URL to compare hostname and path — substring matching is bypassable via
    // query params or crafted paths (e.g. evil.com/path?ref=supabase.co/storage/...).
    let parsedDownloadUrl;
    try { parsedDownloadUrl = new URL(url); } catch { return res.status(400).send('Invalid download URL'); }
    const isSupabase = (
      parsedDownloadUrl.protocol === 'https:' &&
      parsedDownloadUrl.hostname.endsWith('.supabase.co') &&
      parsedDownloadUrl.pathname.startsWith('/storage/v1/object/public/')
    );
    const isGoogleFavicon = (
      parsedDownloadUrl.protocol === 'https:' &&
      parsedDownloadUrl.hostname === 'www.google.com' &&
      parsedDownloadUrl.pathname === '/s2/favicons' &&
      /^[a-zA-Z0-9._-]+$/.test(parsedDownloadUrl.searchParams.get('domain') || '')
    );
    if (!isSupabase && !isGoogleFavicon) {
      return res.status(403).send('SSRF Blocked: Proxy only permits Supabase storage or Google favicon domains.');
    }

    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send('Upstream fetch failed');

    // Hard memory cap: 20 MB. Prevents a large Supabase object from
    // being buffered entirely into RAM and crashing the server.
    const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      return res.status(413).send(`File too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB exceeds the 20 MB proxy limit.`);
    }

    // Stream the response body with a running byte counter
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_DOWNLOAD_BYTES) {
        return res.status(413).send('File too large: exceeded 20 MB proxy limit during transfer.');
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Download proxy failed:', error);
    res.status(500).send('Download failed');
  }
});

// ============ HISTORY HELPERS ============

async function readLocalHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeLocalHistory(data) {
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  // Write to a temp file first then rename — this is an atomic operation on most
  // filesystems, preventing a corrupt HISTORY_FILE if the server crashes mid-write.
  const tmpPath = HISTORY_FILE + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fs.rename(tmpPath, HISTORY_FILE);
}

async function readHistory(tenantId = 'default') {
  let supabaseError = null;
  try {
    const { supabase } = getSupabase();
    if (supabase) {
      const queryPromise = supabase
        .from('extraction_history')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: false })
        .limit(100);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase query timed out')), 5000));
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      if (error) {
        supabaseError = new Error(`Supabase history read error: ${error.message}`);
        console.warn(supabaseError.message);
      }
      if (!error && data) return data;
    }
  } catch (e) {
    supabaseError = e;
    console.warn('Supabase history read failed:', e.message);
  }

  if (env.NODE_ENV === 'production') {
    throw supabaseError || new Error('Database history read failed — Supabase is unavailable in production.');
  }

  const localHistory = await readLocalHistory();
  return localHistory.filter((item) => (item.tenantId || item.tenant_id || 'default') === tenantId);
}

async function appendHistory(record, tenantId = 'default') {
  // Map to exact DB column names (snake_case) — no camelCase fields that don't exist in Supabase
  const dbRecord = {
    id:             record.id,
    tenant_id:      tenantId,
    url:            record.url            || null,
    target_url:     record.target_url     || null,
    youtube_url:    record.youtube_url    || null,
    profile_url:    record.profile_url    || null,
    timestamp:      record.timestamp      || new Date().toISOString(),
    success:        record.success        ?? true,
    name:           record.name           || null,
    screenshotUrl:  record.screenshotUrl  || null,
    payload:        record.payload        || null,
  };

  let supabaseOk = false;
  let supabaseError = null;
  try {
    const { supabase } = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('extraction_history').insert(dbRecord);
      if (!error) {
        supabaseOk = true;
        console.log('[HISTORY] ✅ Saved to Supabase:', dbRecord.target_url || dbRecord.url);
      } else {
        supabaseError = new Error(`Supabase write failed: ${error.message}`);
        console.warn('[HISTORY] ⚠️ Supabase write failed:', error.message, '| code:', error.code);
      }
    }
  } catch (e) {
    supabaseError = e;
    console.warn('[HISTORY] ⚠️ Supabase write exception:', e.message);
  }

  if (env.NODE_ENV === 'production') {
    if (!supabaseOk) {
      console.error('[HISTORY] ❌ Production history persistence failed — no local fallback in production.');
      throw supabaseError || new Error('Durable history persistence failed in production.');
    }
    return;
  }

  // Dev: local file fallback
  localHistoryMutex = localHistoryMutex.then(async () => {
    const history = await readLocalHistory();
    history.unshift(dbRecord);
    await writeLocalHistory(history);
  });
  await localHistoryMutex;
}

// ============ API ROUTES ============

let authRateLimit = (req, res, next) => next();
let extractRateLimit = (req, res, next) => next();
let scanRateLimit = (req, res, next) => next();
let dartExtractRateLimit = (req, res, next) => next();
try {
  const rateLimit = require('express-rate-limit');
  authRateLimit = rateLimit({
    windowMs: 15 * 60_000,
    max: 5,
    skipSuccessfulRequests: true,
    skip: () => env.NODE_ENV === 'test' && process.env.TEST_AUTH_RATE_LIMITS !== '1',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please wait 15 minutes before trying again.' }
  });
  extractRateLimit = rateLimit({
    windowMs: 60_000,
    max: 5,
    skip: () => env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many extraction requests. Please wait 1 minute before trying again.' }
  });
  dartExtractRateLimit = rateLimit({
    windowMs: 60_000,
    max: 10,
    skip: () => env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['authorization'] || req.ip,
    message: { error: 'Too many Dart extraction requests. Please wait 1 minute.' }
  });
  scanRateLimit = rateLimit({
    windowMs: 60_000,
    max: 30,
    skip: () => env.NODE_ENV === 'test',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many scan requests. Please wait 1 minute.' }
  });
} catch (e) {
  console.warn('[BOOT] express-rate-limit not installed - rate limiting disabled. Run: npm install');
}

function timingSafeStringEqual(providedValue, expectedValue) {
  if (typeof providedValue !== 'string' || typeof expectedValue !== 'string') return false;
  const provided = Buffer.from(providedValue);
  const expected = Buffer.from(expectedValue);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function configuredAdminLoginKeys() {
  if (process.env.ADMIN_LOGIN_KEY) return [process.env.ADMIN_LOGIN_KEY];
  return process.env.JOB_API_KEY ? [process.env.JOB_API_KEY] : [];
}


/**
 * Job API authentication middleware.
 * Accepts either JOB_API_KEY or CODEX_JOB_API_KEY as Bearer tokens.
 * If no job key matches, falls back to the regular authenticated session path.
 * In production, at least one job key must be configured.
 */
function requireJobsToken(req, res, next) {
  const keys = [
    { key: process.env.JOB_API_KEY, tenantId: 'default' },
    { key: process.env.CODEX_JOB_API_KEY, tenantId: 'codex' },
  ].filter(item => item.key);

  if (process.env.NODE_ENV === 'production' && keys.length === 0) {
    return res.status(503).json({ error: 'Job endpoint is disabled: no job API key configured.' });
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const matchedKey = keys.find(({ key }) => timingSafeStringEqual(token, key));
    if (matchedKey) {
      req.auth = { role: 'api', tenantId: matchedKey.tenantId };
      return next();
    }
  }

  return requireAuthSession(req, res, next);
}

// ─── AUTHENTICATION (Session Tokens) ──────────────────────────────────────────
app.post('/api/auth/login', authRateLimit, (req, res) => {
  const { password, tenantId } = req.body;

  if (typeof password !== 'string' || !password.trim()) {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    return res.status(400).json({ error: 'Tenant ID is required' });
  }

  const isProd = env.NODE_ENV === 'production';

  if (isProd && tenantId.toLowerCase() === 'default') {
    return res.status(400).json({ error: 'Default tenant is not permitted in production mode' });
  }

  const configuredKeys = configuredAdminLoginKeys();
  const expectedKeys = configuredKeys.length > 0 ? configuredKeys : (isProd ? [] : ['minfo-secure-dev-key']);

  if (isProd && expectedKeys.length === 0) {
    return res.status(503).json({ error: 'Auth disabled: ADMIN_LOGIN_KEY or JOB_API_KEY not configured.' });
  }

  if (expectedKeys.length > 0 && !expectedKeys.some((key) => timingSafeStringEqual(password, key))) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Issue a short-lived token (12 hours) signed via HMAC
  if (isProd && !process.env.HISTORY_API_KEY) {
    return res.status(503).json({ error: 'Auth disabled: HISTORY_API_KEY not configured.' });
  }
  const secret = process.env.HISTORY_API_KEY || 'dev-history-secret';
  const expiresAt = Date.now() + (12 * 3600_000); // 12 hours
  const payload = JSON.stringify({ exp: expiresAt, role: 'admin', tenantId });
  const payloadB64 = Buffer.from(payload).toString('base64');
  
  const signature = crypto.createHmac('sha256', secret)
    .update(payloadB64)
    .digest('hex');

  const token = `${payloadB64}.${signature}`;
  res.json({ token, expiresAt });
});

// ============ ADMIN SECRETS ENDPOINTS ============

app.get('/api/admin/secrets', requireAuthSession, (req, res) => {
  if (req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }

  const secretKeys = [
    'GEMINI_API_KEY',
    'YOUTUBE_API_KEY',
    'FIRECRAWLER_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GCP_PROJECT_ID',
    'GCP_LOCATION',
    'GCP_CREDENTIALS_JSON',
    'MUAPIAPP_API_KEY',
    'POMELLI_API_KEY',
    'MINFO_API_URL',
    'MINFO_API_KEY',
    'DART_API_KEY',
    'HISTORY_API_KEY',
    'ADMIN_LOGIN_KEY',
    'JOB_API_KEY',
  ];

  const results = {};
  const isProd = env.NODE_ENV === 'production';

  for (const key of secretKeys) {
    const val = process.env[key] || env[key] || '';
    if (!val) {
      results[key] = { status: 'MISSING', value: '' };
    } else {
      results[key] = {
        status: 'SET',
        value: isProd
          ? `***${val.slice(-4)}`
          : val
      };
    }
  }

  res.json({ secrets: results });
});

app.post('/api/admin/secrets', requireAuthSession, async (req, res) => {
  if (req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }

  if (env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Modifying production secrets via UI is disabled. Please use Railway / Render dashboard.' });
  }

  const { secrets } = req.body;
  if (!secrets || typeof secrets !== 'object') {
    return res.status(400).json({ error: 'secrets object is required' });
  }

  try {
    const secretsPath = path.resolve(__dirname, './.data/secrets.json');
    await fs.mkdir(path.dirname(secretsPath), { recursive: true });

    let existing = {};
    try {
      const data = await fs.readFile(secretsPath, 'utf8');
      existing = JSON.parse(data);
    } catch { /* file doesn't exist yet */ }

    const merged = { ...existing, ...secrets };
    await fs.writeFile(secretsPath, JSON.stringify(merged, null, 2), 'utf8');

    // Update runtime env
    for (const [k, v] of Object.entries(secrets)) {
      if (v != null && v !== '') {
        process.env[k] = v;
        env[k] = v;
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save secrets:', error);
    res.status(500).json({ error: 'Failed to save secrets' });
  }
});

app.delete('/api/admin/secrets', requireAuthSession, async (req, res) => {
  if (req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }

  if (env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Deleting production secrets via UI is disabled.' });
  }

  const { keys } = req.body;
  if (!Array.isArray(keys)) {
    return res.status(400).json({ error: 'keys array is required' });
  }

  try {
    const secretsPath = path.resolve(__dirname, './.data/secrets.json');
    let existing = {};
    try {
      const data = await fs.readFile(secretsPath, 'utf8');
      existing = JSON.parse(data);
    } catch { /* file doesn't exist */ }

    for (const key of keys) {
      delete existing[key];
      delete process.env[key];
      delete env[key];
    }

    await fs.writeFile(secretsPath, JSON.stringify(existing, null, 2), 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete secrets:', error);
    res.status(500).json({ error: 'Failed to delete secrets' });
  }
});

// ============ SECURE IMAGE PROXY ENDPOINT ============

app.get('/api/proxy-image', requireAuthSession, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL missing');

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).send('Invalid image URL');
    }

    // Run SSRF safety check on the image URL
    const { isAllowedUrl } = require('./lib/validateUrl.js');
    const validation = await isAllowedUrl(url);
    if (!validation.ok) {
      return res.status(403).send(`SSRF Blocked: ${validation.reason}`);
    }

    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send('Upstream image fetch failed');

    const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_IMAGE_BYTES) {
      return res.status(413).send('Image exceeds 20 MB proxy limit');
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      return res.status(400).send('URL does not point to a valid image');
    }

    // Stream the body with byte counting to enforce hard cap
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_IMAGE_BYTES) {
        return res.status(413).send('Image size exceeded 20 MB during transfer');
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24h
    res.send(buffer);
  } catch (error) {
    console.error('Image proxy failed:', error);
    res.status(500).send('Image proxy failed');
  }
});

// Middleware to protect internal endpoints
function requireAuthSession(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing session token' });
  }
  
  const token = authHeader.split(' ')[1];
  if (process.env.NODE_ENV === 'production' && !process.env.HISTORY_API_KEY) {
    return res.status(503).json({ error: 'Auth disabled: HISTORY_API_KEY not configured.' });
  }
  const secret = process.env.HISTORY_API_KEY || 'dev-history-secret';
  const parts = token.split('.');
  
  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Malformed token' });
  }
  
  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', secret)
    .update(payloadB64)
    .digest('hex');

  const provided = Buffer.from(signature, 'hex');
  const expected = Buffer.from(expectedSig, 'hex');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Invalid token signature' });
  }
  
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
    if (Date.now() > payload.exp) {
      return res.status(401).json({ error: 'Token expired' });
    }
    req.auth = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }
}

/**
 * History token authentication.
 */
function requireHistoryToken(req, res, next) {
  const expectedKey = process.env.HISTORY_API_KEY;
  if (!expectedKey) {
    if (process.env.NODE_ENV === 'production') {
      // Should not be reachable because env.js would have exited, but belt-and-braces:
      return res.status(503).json({ error: 'History endpoint is disabled: HISTORY_API_KEY not configured.' });
    }
    // Dev — warn but allow
    console.warn('[HISTORY] ⚠️  HISTORY_API_KEY not set — history is open (dev mode only)');
    return next();
  }
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const queryToken = req.query.history_token || null;
  if ((bearerToken && bearerToken === expectedKey) || (queryToken && queryToken === expectedKey)) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: valid HISTORY_API_KEY required' });
}


app.get('/api/history', requireAuthSession, async (req, res) => {
  try {
    const history = await readHistory(req.auth.tenantId);
    res.json(history);
  } catch (error) {
    console.error('History fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.delete('/api/history', requireAuthSession, async (req, res) => {
  try {
    const { domain, timestamp } = req.body;

    // Try Supabase deletion
    try {
      const { supabase } = getSupabase();
      if (supabase) {
        let baseQuery = supabase
          .from('extraction_history')
          .delete()
          .eq('tenant_id', req.auth.tenantId);
        if (domain) {
          baseQuery = baseQuery.ilike('url', '%' + domain + '%');
        } else if (timestamp) {
          baseQuery = baseQuery.eq('timestamp', timestamp);
        }
        await baseQuery;
      }
    } catch (e) {
      console.warn('Supabase history delete failed:', e.message);
    }

    // Local fallback/sync deletion
    localHistoryMutex = localHistoryMutex.then(async () => {
      let history = await readLocalHistory();
      if (domain) {
        history = history.filter(h => !(((h.tenantId || h.tenant_id || 'default') === req.auth.tenantId) && h.url && h.url.includes(domain)));
      } else if (timestamp) {
        history = history.filter(h => !(((h.tenantId || h.tenant_id || 'default') === req.auth.tenantId) && h.timestamp === timestamp));
      }
      await writeLocalHistory(history);
    });
    await localHistoryMutex;

    res.json({ success: true });
  } catch (error) {
    console.error('History delete failed:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

// ============ MAIN EXTRACTION ============

// Rate-limit extraction to 5 requests/minute per IP to prevent Puppeteer DoS on
// constrained free-tier servers. Gracefully degrades if package is not yet installed.
const MAX_CONCURRENCY = 4;
const extractionStatus = new Map();

app.get('/api/status', requireAuthSession, (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !extractionStatus.has(targetUrl)) {
    return res.json({ status: 'not_found' });
  }
  const stat = extractionStatus.get(targetUrl);
  res.json({
    stage: stat.stage,
    steps: stat.steps,
    elapsed: Math.floor((Date.now() - stat.startTime) / 1000)
  });
});


// ── /api/scan-images ─────────────────────────────────────────────────────────
// Lightweight Imageye-style image scanner. Given any URL, fetches the HTML and
// extracts every image reference it can find — img src, srcset, picture source,
// OG/Twitter meta, inline background-image, lazy-load data-src, link[rel=icon].
// No Puppeteer → typical response time 1-3 seconds.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/scan-images', requireAuthSession, scanRateLimit, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const { isAllowedUrl, safeHttpAgent, safeHttpsAgent } = require('./lib/validateUrl.js');
  let targetUrl;
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const validation = await isAllowedUrl(normalized);
    if (!validation.ok) {
      return res.status(403).json({ error: `Security check failed: ${validation.reason}` });
    }
    targetUrl = new URL(validation.url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const html = await (async () => {
      // Try with a realistic browser UA — many sites reject bot UAs
      let currentUrl = targetUrl.href;
      let redirects = 0;
      while (redirects < 5) {
        const r = await axios.get(currentUrl, {
          httpAgent: safeHttpAgent,
          httpsAgent: safeHttpsAgent,
          timeout: 12_000,
          maxRedirects: 0,
          maxContentLength: 5 * 1024 * 1024,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          validateStatus: (status) => status >= 200 && status < 400,
        });
        if (r.status >= 300 && r.status < 400 && r.headers.location) {
          let redirectUrl = r.headers.location;
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = new URL(redirectUrl, currentUrl).toString();
          }
          const redirectValidation = await isAllowedUrl(redirectUrl);
          if (!redirectValidation.ok) {
            throw new Error(`Redirect blocked: ${redirectValidation.reason}`);
          }
          currentUrl = redirectValidation.url;
          redirects++;
          continue;
        }
        targetUrl = new URL(currentUrl);
        return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      }
      throw new Error('Too many redirects');
    })();

    const base = targetUrl.origin;
    const seen = new Set();
    const images = [];

    // Resolve a possibly-relative URL against the page base
    const resolve = (src) => {
      if (!src || src.startsWith('data:')) return null;
      try {
        return new URL(src, base).href;
      } catch { return null; }
    };

    const add = (src, context) => {
      const u = resolve(src);
      if (!u || seen.has(u)) return;
      seen.add(u);
      images.push({ url: u, context });
    };

    // 1. <img src> and data-src (lazy-load)
    for (const m of html.matchAll(/\bdata-src\s*=\s*["']([^"']+)["']/gi))  add(m[1], 'img-lazy');
    for (const m of html.matchAll(/<img[^>]+\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'img');
    // 2. srcset — multiple sizes, take the last (highest res)
    for (const m of html.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
      const last = m[1].trim().split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean).slice(-1)[0];
      if (last) add(last, 'srcset');
    }
    // 3. <source src> (picture/video)
    for (const m of html.matchAll(/<source[^>]+\bsrc(?:set)?\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'source');
    // 4. OG / Twitter meta
    for (const m of html.matchAll(/<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'og');
    for (const m of html.matchAll(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["']/gi)) add(m[1], 'og');
    for (const m of html.matchAll(/<meta[^>]+name\s*=\s*["']twitter:image["'][^>]+content\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'twitter');
    for (const m of html.matchAll(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']twitter:image["']/gi)) add(m[1], 'twitter');
    // 5. Inline background-image: url(...)
    for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(['"]?([^'")\s]+)['"]?\)/gi)) add(m[1], 'css-bg');
    // 6. <link rel="icon|apple-touch-icon">
    for (const m of html.matchAll(/<link[^>]+rel\s*=\s*["'][^"']*(icon|apple-touch)[^"']*["'][^>]+href\s*=\s*["']([^"']+)["']/gi)) add(m[2], 'icon');
    // 7. JSON-LD / Next.js __NEXT_DATA__ image URLs
    for (const m of html.matchAll(/"(?:image|src|url|thumbnail|photo|cover|hero|banner)"\s*:\s*"(https?:\/\/[^"]+\.(jpe?g|png|webp|gif|svg|avif)[^"]*)"/gi)) add(m[1], 'json');

    // Dedupe, cap at 200
    const result = images.slice(0, 200);
    console.log(`[SCAN] ${targetUrl.host} → ${result.length} images found`);
    res.json({ success: true, images: result, total: result.length, host: targetUrl.host });
  } catch (err) {
    console.error('[SCAN] Error:', err.message);
    res.status(500).json({ error: `Scan failed: ${err.message}` });
  }
});

// ─── /api/extract-document ───────────────────────────────────────────────────
// Accepts uploaded PDFs/text files, extracts text, then uses Gemini to identify
// all entities (people, places, products) and organize them into groups.
// Returns a structured JSON payload for the frontend to display.
// ─────────────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Supported: ${allowedTypes.join(', ')}`));
    }
  },
});

app.post('/api/extract-document', requireAuthSession, extractRateLimit, upload.array('documents', 5), async (req, res) => {
  const TAG = '[DOC-EXTRACT]';
  const startTime = Date.now();

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded. Please attach at least one PDF or text file.' });
    }

    const brandWebsiteUrl = req.body.brandWebsiteUrl || null;
    console.log(`${TAG} Received ${req.files.length} file(s). Brand URL: ${brandWebsiteUrl || 'none'}`);

    // Extract text from all uploaded files
    const allTexts = [];
    const fileNames = [];
    for (const file of req.files) {
      console.log(`${TAG} Processing: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`);
      try {
        const text = await extractTextFromDocument(file.buffer, file.originalname);
        allTexts.push(`\n--- FILE: ${file.originalname} ---\n${text}`);
        fileNames.push(file.originalname);
      } catch (fileErr) {
        console.warn(`${TAG} Failed to extract text from ${file.originalname}: ${fileErr.message}`);
        allTexts.push(`\n--- FILE: ${file.originalname} (EXTRACTION FAILED: ${fileErr.message}) ---\n`);
        fileNames.push(file.originalname);
      }
    }

    const combinedText = allTexts.join('\n');
    if (combinedText.replace(/[^a-zA-Z0-9]/g, '').length < 50) {
      return res.status(422).json({
        error: 'Could not extract sufficient text from the uploaded files. They may be image-only PDFs or empty.',
      });
    }

    console.log(`${TAG} Combined text length: ${combinedText.length} chars. Sending to AI...`);

    // Send to Gemini for entity extraction
    const extractionResult = await extractEntitiesWithAI(combinedText, brandWebsiteUrl);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`${TAG} ✅ AI extraction complete in ${elapsed}s. Found ${extractionResult.entities?.length || 0} entities in ${extractionResult.suggestedGroups?.length || 0} groups.`);

    res.json({
      success: true,
      totalMs: Date.now() - startTime,
      sourceFiles: fileNames,
      brandWebsiteUrl,
      documentTitle: extractionResult.documentTitle || 'Untitled Document',
      documentType: extractionResult.documentType || 'generic',
      entities: extractionResult.entities || [],
      suggestedGroups: extractionResult.suggestedGroups || [],
      extractedTextLength: combinedText.length,
    });

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`${TAG} ❌ Failed after ${elapsed}s:`, err.message);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 25 MB per file.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 5 files per upload.' });
    }

    res.status(500).json({ error: `Document extraction failed: ${err.message}` });
  }
});

// ============ CAMPAIGN GENERATION & SESSIONS ============
const { validateMinfoCampaign, parseStyleGuide, generateCampaignFromDna } = require('./lib/campaignGenerator');
const { v4: uuidv4 } = require('uuid');

// Local memory fallback for development/test modes
let localCampaignSessions = new Map();

async function createCampaignSession(tenantId, brandDna, styleGuideRules = [], campaignOutput = null) {
  const record = {
    session_id: uuidv4(),
    tenant_id: tenantId,
    brand_dna: brandDna,
    style_guide_rules: styleGuideRules,
    campaign_output: campaignOutput,
    status: 'draft',
    idempotency_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { supabase } = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('campaign_sessions')
      .insert(record)
      .select()
      .single();
    if (error) throw new Error(`Failed to save campaign session to database: ${error.message}`);
    return data;
  }

  localCampaignSessions.set(record.session_id, record);
  return record;
}

async function updateCampaignSession(sessionId, tenantId, patch) {
  const { supabase } = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('campaign_sessions')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update campaign session: ${error.message}`);
    return data;
  }

  const existing = localCampaignSessions.get(sessionId);
  if (!existing || existing.tenant_id !== tenantId) return null;
  const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
  localCampaignSessions.set(sessionId, updated);
  return updated;
}

async function listCampaignSessions(tenantId) {
  const { supabase } = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('campaign_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Failed to list campaign sessions: ${error.message}`);
    return data;
  }

  return Array.from(localCampaignSessions.values())
    .filter(s => s.tenant_id === tenantId)
    .sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
}

async function getCampaignSession(sessionId, tenantId) {
  const { supabase } = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('campaign_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new Error(`Failed to get campaign session: ${error.message}`);
    return data;
  }

  const session = localCampaignSessions.get(sessionId);
  if (!session || session.tenant_id !== tenantId) return null;
  return session;
}

async function deleteCampaignSession(sessionId, tenantId) {
  const { supabase } = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from('campaign_sessions')
      .delete()
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId);
    if (error) throw new Error(`Failed to delete campaign session: ${error.message}`);
    return true;
  }

  const existing = localCampaignSessions.get(sessionId);
  if (!existing || existing.tenant_id !== tenantId) return false;
  localCampaignSessions.delete(sessionId);
  return true;
}

app.post('/api/campaign/generate', requireAuthSession, upload.array('documents', 5), async (req, res) => {
  const tenantId = req.auth.tenantId;
  let { brandDna, styleGuideRules } = req.body;

  if (typeof brandDna === 'string') {
    try { brandDna = JSON.parse(brandDna); } catch {}
  }
  if (typeof styleGuideRules === 'string') {
    try { styleGuideRules = JSON.parse(styleGuideRules); } catch {}
  }

  if (!brandDna) {
    return res.status(400).json({ error: 'brandDna payload is required' });
  }

  try {
    let parsedRules = Array.isArray(styleGuideRules) ? styleGuideRules : (styleGuideRules ? [styleGuideRules] : []);
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const text = await extractTextFromDocument(file.buffer, file.originalname);
        const rules = await parseStyleGuide(text, file.originalname);
        parsedRules.push(rules);
      }
    }

    const campaignOutput = await generateCampaignFromDna(brandDna, parsedRules);
    const session = await createCampaignSession(tenantId, brandDna, parsedRules, campaignOutput);

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[CAMPAIGN/GENERATE] Failed:', error);
    res.status(500).json({ error: `Campaign generation failed: ${error.message}` });
  }
});

app.get('/api/campaign/sessions', requireAuthSession, async (req, res) => {
  try {
    const sessions = await listCampaignSessions(req.auth.tenantId);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/campaign/sessions/:sessionId', requireAuthSession, async (req, res) => {
  try {
    const session = await getCampaignSession(req.params.sessionId, req.auth.tenantId);
    if (!session) return res.status(404).json({ error: 'Campaign session not found' });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/campaign/sessions/:sessionId', requireAuthSession, async (req, res) => {
  try {
    const ok = await deleteCampaignSession(req.params.sessionId, req.auth.tenantId);
    if (!ok) return res.status(404).json({ error: 'Campaign session not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/minfo/import', requireAuthSession, async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  try {
    const session = await getCampaignSession(sessionId, req.auth.tenantId);
    if (!session) return res.status(404).json({ error: 'Campaign session not found' });

    if (session.status === 'imported') {
      return res.status(409).json({ error: 'Campaign has already been imported' });
    }

    const campaignPayload = session.campaign_output;
    if (!campaignPayload) {
      return res.status(422).json({ error: 'No campaign output found in session' });
    }

    const validation = validateMinfoCampaign(campaignPayload);
    if (!validation.valid) {
      return res.status(422).json({ error: 'Minfo campaign schema validation failed', details: validation.errors });
    }

    const isProd = env.NODE_ENV === 'production';
    const minfoApiKey = env.MINFO_API_KEY;
    const minfoApiUrl = env.MINFO_API_URL || 'https://api.minfo.com/v1/campaigns/import';

    if (isProd && (!minfoApiKey || minfoApiKey === 'open_pomelli_secret_key')) {
      return res.status(503).json({ error: 'Minfo import integrations not configured in production environment' });
    }

    const idempotencyKey = session.idempotency_key || uuidv4();
    
    // Attempt key reservation in DB
    await updateCampaignSession(sessionId, req.auth.tenantId, {
      idempotency_key: idempotencyKey
    });

    if (!isProd && !minfoApiKey) {
      // Dev simulation success
      console.log(`[MINFO-IMPORT] Simulating campaign import to ${minfoApiUrl} for tenant ${req.auth.tenantId}`);
      await updateCampaignSession(sessionId, req.auth.tenantId, {
        status: 'imported'
      });
      return res.json({ success: true, sessionId, status: 'imported', idempotencyKey });
    }

    // Call upstream API
    const response = await fetch(minfoApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${minfoApiKey}`,
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(campaignPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upstream Minfo CRM rejected payload: [${response.status}] ${errText}`);
    }

    await updateCampaignSession(sessionId, req.auth.tenantId, {
      status: 'imported'
    });

    res.json({ success: true, sessionId, status: 'imported', idempotencyKey });

  } catch (error) {
    console.error('[MINFO-IMPORT] Import failed:', error);
    res.status(500).json({ error: `Campaign import failed: ${error.message}` });
  }
});

// ─── Shared extraction engine ────────────────────────────────────────────────
// Called by BOTH the web UI route (POST /api/extract) and the Dart API.
// Returns the raw payload object on success, or throws an Error on failure.
// caller = 'web' | 'dart'  (used only for log prefixing)
async function runExtraction({
  url,
  youtubeUrl,
  profileUrl,
  linkedinUrl = null,
  website2Url = null,
  selectedImages = [],
  tenantId = 'default',
  caller = 'web',
  abortSignal = null,
  onStage = null,
} = {}) {
  const startTime = Date.now();
  let stage = 'init';
  const stageTimings = [];
  let lastStageTime = startTime;
  const TAG = `[EXTRACT/${caller.toUpperCase()}]`;

  const checkAbort = () => {
    if (abortSignal && abortSignal.aborted) {
      throw new Error('Extraction cancelled by user');
    }
  };

  const targetLabel = url || profileUrl || youtubeUrl;
  extractionStatus.set(targetLabel, { stage: 'init', startTime, steps: [] });

  const setStage = (s, isInternal = false, prefix = '') => {
    checkAbort();
    const displayString = prefix ? `${prefix}: ${s}` : s;
    const now = Date.now();
    const durationMs = now - lastStageTime;
    lastStageTime = now;
    if (!isInternal) stage = displayString;
    console.log(`${TAG} Stage: ${displayString} (+${durationMs}ms)`);
    stageTimings.push({ stage: displayString, elapsedMs: now - startTime, durationMs });
    const stat = extractionStatus.get(targetLabel);
    if (stat) {
      if (!stat.steps.includes(displayString)) stat.steps.push(displayString);
      extractionStatus.set(targetLabel, { stage: displayString, startTime: stat.startTime, steps: stat.steps });
      if (onStage) {
        Promise.resolve(onStage({
          stage: displayString,
          steps: stat.steps,
          elapsed: Math.floor((Date.now() - startTime) / 1000),
        })).catch((error) => {
          console.warn(`${TAG} stage persistence failed: ${error.message}`);
        });
      }
    }
  };

  try {
    let dnaResult = null;
    let youtubeResult = null;
    let profileResult = null;

    // 1. Website extraction
    if (url) {
      setStage('website-extraction');
      const { extractDNA } = getExtractor();
      dnaResult = await extractDNA(url, (s) => setStage(s, true, 'Website'), selectedImages, abortSignal);
      if (dnaResult?.error) {
        const err = new Error(dnaResult.error);
        err.stage = 'website-extraction';
        err.hint = 'The website could not be scraped. It may be blocking bots, offline, or using an unsupported architecture. Connectors tried: Puppeteer/Chromium → Wayback Machine → Axios HTTP.';
        err.statusCode = 422;
        throw err;
      }
      console.log(`${TAG} Website extraction complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    }

    // 1.5 Website 2 extraction (non-fatal)
    let website2DnaResult = null;
    if (website2Url) {
      setStage('website2-extraction');
      const { extractDNA } = getExtractor();
      try {
        website2DnaResult = await extractDNA(website2Url, (s) => setStage(s, true, 'Website 2'), selectedImages, abortSignal);
        if (website2DnaResult?.error) {
          console.warn(`${TAG} Website 2 extraction failed (non-fatal): ${website2DnaResult.error}`);
          website2DnaResult = null;
        } else {
          console.log(`${TAG} Website 2 extraction complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
        }
      } catch (err) {
        console.warn(`${TAG} Website 2 extraction failed (non-fatal): ${err.message}`);
      }
    }



    // 2. YouTube extraction (non-fatal)
    let youtubeWarning = null;
    if (youtubeUrl) {
      setStage('youtube-extraction');
      const ytStageStart = Date.now();
      try {
        const { extractYoutubeDetails } = getYoutubeExtractor();
        youtubeResult = await extractYoutubeDetails(youtubeUrl);
        if (youtubeResult?.error) throw new Error(youtubeResult.error);
        console.log(`${TAG} YouTube API succeeded (${((Date.now() - ytStageStart)/1000).toFixed(1)}s)`);
      } catch (ytErr) {
        console.warn(`${TAG} YouTube API failed, trying oEmbed: ${ytErr.message}`);
        try {
          const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
          const oEmbedRes = await axios.get(oEmbedUrl, { timeout: 10_000 }); // youtube.com is trusted — no SSRF risk, skip safeAgent
          if (oEmbedRes.data?.title) {
            youtubeResult = { title: oEmbedRes.data.title, channel: oEmbedRes.data.author_name, description: '', thumbnail: oEmbedRes.data.thumbnail_url || null, channelLogo: null };
            // Tier 2.5: HTML scrape for description
            try {
              const pageRes = await axios.get(youtubeUrl, { timeout: 12_000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' } }); // trusted domain
              const html = pageRes.data || '';
              const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.{0,5000}?\});/s);
              if (playerMatch) { try { const d = JSON.parse(playerMatch[1]); const desc = d?.videoDetails?.shortDescription; if (desc?.length > 20) youtubeResult.description = desc; } catch(e){} }
              if (!youtubeResult.description) { const m = html.match(/"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/); if (m) { const desc = m[1].replace(/\\n/g,'\n').replace(/\\"/g,'"'); if (desc?.length > 20) youtubeResult.description = desc; } }
              if (!youtubeResult.description) throw new Error('No description in HTML', { cause: ytErr });
            } catch(htmlErr) {
              try {
                const { scrapeYoutubeFallback } = getExtractor();
                const r = await Promise.race([scrapeYoutubeFallback(youtubeUrl), new Promise((_,rej) => setTimeout(() => rej(new Error('YT Puppeteer timeout')), 30_000))]);
                if (r?.description?.length > 20) youtubeResult.description = r.description;
                else youtubeResult.description = `${youtubeResult.channel} — ${youtubeResult.title}`;
              } catch(puppErr) { youtubeResult.description = `${youtubeResult.channel} — ${youtubeResult.title}`; }
            }
          } else throw new Error('oEmbed returned no data', { cause: ytErr });
        } catch(oEmbedErr) {
          try {
            const { scrapeYoutubeFallback } = getExtractor();
            youtubeResult = await Promise.race([scrapeYoutubeFallback(youtubeUrl), new Promise((_,rej) => setTimeout(() => rej(new Error('YT Puppeteer timeout')), 30_000))]);
            checkAbort();
            if (youtubeResult?.error) throw new Error(youtubeResult.error, { cause: oEmbedErr });
          } catch(fallbackErr) {
            youtubeWarning = `YouTube extraction skipped: ${fallbackErr.message}`;
            console.warn(`${TAG} ⚠️ All YouTube methods failed (non-fatal): ${fallbackErr.message}`);
            youtubeResult = null;
          }
        }
      }
      console.log(`${TAG} YouTube stage complete (${((Date.now() - startTime) / 1000).toFixed(1)}s) — ${youtubeWarning ? 'SKIPPED' : 'OK'}`);
    }

    // 3. Profile extraction
    if (profileUrl) {
      setStage('profile-extraction');
      let profileLite = null;
      try { setStage('Profile: Lightweight Fetch', true); profileLite = await scrapeProfileLightweight(profileUrl); } catch(e) { console.warn('[Profile] Lightweight threw:', e.message); }
      checkAbort();
      if (profileLite?.success && profileLite.links?.length > 0) {
        setStage('Profile: Links Extracted', true);
        profileResult = { success: true, data: { name: profileLite.displayName }, ctas: profileLite.links, socialMediaLinks: profileLite.socialLinks || [], featuredImages: [], screenshotUrl: null };
      } else {
        setStage('Profile: Full Browser Fetch', true);
        const { extractDNA: extractProfileDNA } = getExtractor();
        const profileDna = await extractProfileDNA(profileUrl, (s) => setStage(s, true, 'Profile'), [], abortSignal);
        checkAbort();
        if (profileDna?.error) {
          const err = new Error(profileDna.error);
          err.stage = 'profile-extraction'; err.statusCode = 422;
          err.hint = 'The profile URL could not be scraped. Try submitting only the Profile URL on its own.';
          throw err;
        }
        profileResult = { success: true, data: profileDna?.mappedData || {}, ctas: profileDna?.ctas || [], socialMediaLinks: profileDna?.socialMediaLinks || [], featuredImages: profileDna?.featuredImages || [], screenshotUrl: profileDna?.screenshotUrl || null };
      }
      console.log(`${TAG} Profile extraction complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    }

    // 3.5. LinkedIn extraction (non-fatal)
    let linkedinData = null;
    if (linkedinUrl) {
      setStage('linkedin-extraction');
      try {
        const liResult = await scrapeLinkedinProfile(linkedinUrl);
        if (liResult.success) {
          // Try to upload avatar to Supabase so it's a stable public URL
          let storedAvatarUrl = liResult.avatarUrl;
          if (liResult.avatarUrl) {
            try {
              const { supabase } = getSupabase();
              if (supabase) {
                const { safeHttpAgent, safeHttpsAgent } = require('./lib/validateUrl.js');
                const avatarRes = await axios.get(liResult.avatarUrl, {
                  responseType: 'arraybuffer',
                  timeout: 12_000,
                  httpAgent: safeHttpAgent,
                  httpsAgent: safeHttpsAgent,
                  maxContentLength: 5 * 1024 * 1024,
                  headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.linkedin.com/' },
                });
                const ext = liResult.avatarUrl.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg';
                const filename = `li_avatar_${Date.now()}.${ext}`;
                const { data: uploadData, error: uploadErr } = await supabase.storage
                  .from('outputs')
                  .upload(filename, Buffer.from(avatarRes.data), {
                    contentType: avatarRes.headers['content-type'] || `image/${ext}`,
                    upsert: false,
                  });
                if (!uploadErr && uploadData?.path) {
                  const { data: { publicUrl } } = supabase.storage.from('outputs').getPublicUrl(uploadData.path);
                  storedAvatarUrl = publicUrl;
                  console.log(`${TAG} LinkedIn avatar uploaded: ${storedAvatarUrl}`);
                } else {
                  console.warn(`${TAG} LinkedIn avatar upload failed, using original URL: ${uploadErr?.message}`);
                }
              }
            } catch (uploadErr) {
              console.warn(`${TAG} LinkedIn avatar upload error (non-fatal): ${uploadErr.message}`);
            }
          }
          linkedinData = {
            avatarUrl:   storedAvatarUrl   || null,
            name:        liResult.name        || null,
            headline:    liResult.headline    || null,
            description: liResult.description || null,
            profileUrl:  linkedinUrl,
          };
          console.log(`${TAG} LinkedIn data extracted: ${JSON.stringify({ name: linkedinData.name, headline: linkedinData.headline?.slice(0,50) })}`);
        } else {
          console.warn(`${TAG} LinkedIn extraction returned no data: ${liResult.error}`);
        }
      } catch (liErr) {
        console.warn(`${TAG} LinkedIn extraction failed (non-fatal): ${liErr.message}`);
      }
    }

    let combinedMappedData = {
        ...(website2DnaResult?.mappedData || {}),
        ...(dnaResult?.mappedData || {})
    };
    for (const key in website2DnaResult?.mappedData) {
        if (!combinedMappedData[key] && website2DnaResult.mappedData[key]) {
            combinedMappedData[key] = website2DnaResult.mappedData[key];
        }
    }

    let verifiedData = combinedMappedData;
    if (dnaResult || website2DnaResult || youtubeResult) {
      setStage('ai-verification');
      try {
        const { verifyDNA } = getAiVerifier();
        checkAbort();
        const primaryScreenshot = dnaResult?.screenshotPath || website2DnaResult?.screenshotPath;
        const primaryLogo = dnaResult?.logoPath || website2DnaResult?.logoPath;
        const aiResult = await verifyDNA(combinedMappedData, primaryScreenshot, primaryLogo, youtubeResult);
        verifiedData = { ...combinedMappedData, ...(aiResult?.verified_data || {}) };
      } catch (aiErr) {
        console.warn(`${TAG} AI verification failed (non-fatal): ${aiErr.message}`);
      }
    }

    // 5. Build payload
    setStage('building-response');
    const totalMs = Date.now() - startTime;

    const mergedButtonStyles = [...(dnaResult?.buttonStyles || []), ...(website2DnaResult?.buttonStyles || [])];
    const mergedFeaturedImages = [...(dnaResult?.featuredImages || []), ...(website2DnaResult?.featuredImages || []), ...(linkedinData?.avatarUrl ? [linkedinData.avatarUrl] : [])];
    const mergedCtas = [...(dnaResult?.ctas || []), ...(website2DnaResult?.ctas || [])];

    const payload = {
      success: true, isVerified: true,
      isWaybackFallback: dnaResult?.isWaybackFallback || website2DnaResult?.isWaybackFallback || false,
      youtubeWarning: youtubeWarning || null,
      totalMs, stageTimings,
      data: { ...verifiedData, buttonStyles: mergedButtonStyles, featuredImages: mergedFeaturedImages, isWaybackFallback: dnaResult?.isWaybackFallback || website2DnaResult?.isWaybackFallback || false },
      mappedData: combinedMappedData,
      youtubeData: youtubeResult || null,
      screenshotUrl: dnaResult?.screenshotUrl || website2DnaResult?.screenshotUrl || null,
      buttonStyles: mergedButtonStyles,
      ctas: mergedCtas,
      socialMediaLinks: [...new Set([
        ...(dnaResult?.socialMediaLinks || []),
        ...(website2DnaResult?.socialMediaLinks || []),
        ...(linkedinUrl ? [linkedinUrl] : []),
        ...(url ? [url] : []),
        ...(website2Url ? [website2Url] : [])
      ])].filter(link => link !== profileUrl),
      featuredImages: mergedFeaturedImages,
      profilePayload: profileResult || null,
      linkedinData:   linkedinData  || null,
    };

    const { enforcePayloadSchema } = require('./lib/schemaValidator');
    const schemaResult = enforcePayloadSchema(payload);
    if (!schemaResult.valid) {
      // Schema validation is blocking — reject payloads that don't meet the contract.
      const schemaErr = new Error('Extraction payload failed schema validation');
      schemaErr.stage = 'schema-validation';
      schemaErr.hint = 'The extraction completed but the output did not match the expected structure. ' +
                       'Check server logs for schema error details.';
      throw schemaErr;
    }

    // 6. Save history
    setStage('saving-history');
    try {
      const payloadWithInputs = { ...payload, _inputs: { url: url||'', youtubeUrl: youtubeUrl||'', profileUrl: profileUrl||'', linkedinUrl: linkedinUrl||'', website2Url: website2Url||'' } };
      await appendHistory({ id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, url: url||profileUrl||youtubeUrl, target_url: url||'', youtube_url: youtubeUrl||'', profile_url: profileUrl||'', timestamp: new Date().toISOString(), success: true, name: payloadWithInputs.data?.name||null, screenshotUrl: payloadWithInputs.screenshotUrl||null, payload: payloadWithInputs }, tenantId);
    } catch(histErr) {
      console.warn(`${TAG} History save failed:`, histErr.message);
      if (env.NODE_ENV === 'production') {
        histErr.stage = 'saving-history';
        throw histErr;
      }
    }

    console.log(`${TAG} ✅ Extraction complete in ${((Date.now() - startTime)/1000).toFixed(1)}s`);
    return payload;

  } finally {
    extractionStatus.delete(targetLabel);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/jobs', requireJobsToken, extractRateLimit, async (req, res) => {
  let { url, youtubeUrl, profileUrl, linkedinUrl, website2Url, selectedImages } = req.body;

  if (!url && !youtubeUrl && !profileUrl && !linkedinUrl && !website2Url) {
    return res.status(400).json({ error: 'At least one URL is required', stage: 'init' });
  }

  // ── URL validation (security gate — stays in route layer) ──────────────────
  const { isAllowedUrl } = require('./lib/validateUrl');
  const MAX_URL_LEN = 2048;
  const ALLOWED_BIO_DOMAINS = ['linktr.ee','beacon.ai','bio.site','bento.me','lnk.bio','bit.ly','solo.to','tap.bio','milkshake.app','hoo.be','campsite.bio','later.com','linkin.bio'];

  for (const item of [{key:'url',val:url}, {key:'youtubeUrl',val:youtubeUrl}, {key:'profileUrl',val:profileUrl}, {key:'linkedinUrl',val:linkedinUrl}, {key:'website2Url',val:website2Url}]) {
    if (!item.val) continue;
    if (typeof item.val !== 'string' || item.val.length > MAX_URL_LEN) {
      return res.status(400).json({ error: `${item.key} must be a string under ${MAX_URL_LEN} chars`, stage: 'init' });
    }
    let norm = item.val.trim();
    if (!/^https?:\/\//i.test(norm)) norm = 'https://' + norm;
    const validation = await isAllowedUrl(norm);
    if (!validation.ok) return res.status(403).json({ error: `Security check failed for ${item.key}: ${validation.reason}`, stage: 'init' });
    
    const parsedUrl = new URL(validation.url);
    const host = parsedUrl.hostname.toLowerCase();

    if (item.key === 'url') url = validation.url;
    if (item.key === 'linkedinUrl') {
      if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) {
         return res.status(400).json({ error: 'LinkedIn URL must be a valid linkedin.com domain', stage: 'init' });
      }
      linkedinUrl = validation.url;
    }
    if (item.key === 'website2Url') website2Url = validation.url;
    if (item.key === 'youtubeUrl') {
      if (host !== 'youtu.be' && !host.endsWith('.youtu.be') && host !== 'youtube.com' && !host.endsWith('.youtube.com')) {
         return res.status(400).json({ error: 'YouTube URL must be a valid youtube.com or youtu.be domain', stage: 'init' });
      }
      youtubeUrl = validation.url;
    }
    if (item.key === 'profileUrl') {
      const isBioDomain = ALLOWED_BIO_DOMAINS.some(d => host === d || host.endsWith('.' + d));
      const isLater = (host === 'later.com' || host.endsWith('.later.com')) && parsedUrl.pathname.startsWith('/p/');
      if (!isBioDomain && !isLater) return res.status(400).json({ error: 'Profile URL must be a supported bio link service', stage: 'init' });
      profileUrl = validation.url;
    }
  }

  // Reserve capacity only after validation passes. Otherwise malformed requests
  // can leak slots and lock the service at MAX_CONCURRENCY.
  if (activeExtractions >= MAX_CONCURRENCY) {
    return res.status(429).json({ error: 'Server is at maximum capacity. Please try again in 1 minute.', stage: 'init' });
  }
  activeExtractions++;

  const abortController = new AbortController();
  let job;
  try {
    job = await jobStore.createJob({
      jobType: 'web',
      tenantId: req.auth.tenantId || 'default',
      status: 'running',
      stage: 'init',
      steps: [],
    });
  } catch (error) {
    activeExtractions--;
    console.error('[EXTRACT/WEB-ASYNC] Failed to create job:', error);
    return res.status(500).json({ error: 'Failed to create extraction job', stage: 'init' });
  }
  const jobId = job.jobId;
  jobStore.registerAbortController(jobId, abortController);

  res.status(202).json({ jobId, status: 'running' });

  // ── Delegate to shared engine asynchronously ──────────────────────────────
  (async () => {
    console.log(`\n[EXTRACT/WEB-ASYNC] Starting Job ${jobId}: url=${url}, yt=${youtubeUrl}, profile=${profileUrl}, linkedin=${linkedinUrl}, website2=${website2Url}. Active: ${activeExtractions}`);

    try {
      const payload = await runExtraction({
        url,
        youtubeUrl,
        profileUrl,
        linkedinUrl,
        website2Url,
        selectedImages: selectedImages || [],
        tenantId: req.auth.tenantId || 'default',
        caller: 'web',
        abortSignal: abortController.signal,
        onStage: ({ stage, steps, elapsed }) => jobStore.updateJob(jobId, { stage, steps, elapsed }),
      });
      await jobStore.updateJob(jobId, {
        status: 'complete',
        result: payload,
        error: null,
        hint: null,
      });
    } catch (error) {
      const stageHints = {
        'website-extraction': 'The website could not be scraped. It may be blocking bots, offline, or using an unsupported architecture.',
        'profile-extraction': 'The profile URL could not be scraped. Try submitting only the Profile URL on its own.',
        'ai-verification':    'AI verification failed. Check your GEMINI_API_KEY.',
        'building-response':  'Failed while assembling the response payload.',
        'saving-history':     'Failed to save extraction history to production database.',
      };
      const hint = error.hint || stageHints[error.stage] || 'An unexpected error occurred during extraction.';
      const stat = extractionStatus.get(url || profileUrl || youtubeUrl);
      await jobStore.updateJob(jobId, {
        status: error.message === 'Extraction cancelled by user' ? 'cancelled' : 'failed',
        error: error.message,
        stage: error.stage || 'unknown',
        steps: stat?.steps || [],
        elapsed: Math.floor((Date.now()) / 1000),
        hint,
        cancel_requested: error.message === 'Extraction cancelled by user',
      });
    } finally {
      activeExtractions--;
      jobStore.unregisterAbortController(jobId);
      console.log(`[EXTRACT/WEB-ASYNC] Job ${jobId} finished. Concurrency: ${activeExtractions} active jobs remaining.`);
    }
  })();
});

// ── DELETE /api/jobs/:jobId ── Cancel a running job ──────────────────────────
app.delete('/api/jobs/:jobId', requireJobsToken, async (req, res) => {
  const job = await jobStore.getJob(req.params.jobId, { tenantId: req.auth.tenantId });
  if (!job) return res.status(404).json({ error: 'Job not found or already expired' });
  if (!['pending', 'running', 'cancelling'].includes(job.status)) {
    return res.status(409).json({ error: `Job is not running (status: ${job.status})` });
  }
  const abortController = jobStore.getAbortController(req.params.jobId);
  if (abortController) {
    abortController.abort();
  }
  await jobStore.requestCancel(req.params.jobId);
  console.log(`[EXTRACT/WEB-ASYNC] Job ${req.params.jobId} cancelled by client request.`);
  return res.json({ success: true, jobId: req.params.jobId, status: 'cancelling' });
});

app.get('/api/jobs/:jobId', requireJobsToken, async (req, res) => {
  const job = await jobStore.getJob(req.params.jobId, { tenantId: req.auth.tenantId });
  if (!job) return res.status(404).json({ error: 'Job not found or expired' });
  
  if (['pending', 'running', 'cancelling'].includes(job.status)) {
    return res.status(202).json({
      status: job.status,
      stage: job.stage,
      steps: job.steps,
      elapsed: job.elapsed,
    });
  }
  if (job.status === 'failed' || job.status === 'cancelled') {
    return res.status(422).json({
      status: job.status,
      error: job.error,
      stage: job.stage,
      steps: job.steps,
      elapsed: job.elapsed,
      hint: job.hint
    });
  }
  return res.status(200).json({ status: 'complete', data: job.result });
});




// ============ DART API ============
// Mount the lightweight Dart-facing API (/api/dart/extract, /api/dart/result/:id)
// Pass the shared runExtraction function and dartExtractRateLimit so dart_api.js
// calls the extraction engine directly — no loopback HTTP, separate rate limit bucket.
require('./dart_api')(app, {
  runExtraction,
  dartExtractRateLimit,
  activeExtractions: () => activeExtractions,
  incrementActive: () => activeExtractions++,
  decrementActive: () => activeExtractions--,
  MAX_CONCURRENCY,
  jobStore,
});

// ============ START SERVER ============

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`[BOOT] Server listening on port ${PORT}`);
    console.log(`[BOOT] Environment: ${env.NODE_ENV}`);
    console.log(`[BOOT] GEMINI_API_KEY: ${env.GEMINI_API_KEY ? 'SET' : 'MISSING'}`);
    console.log(`[BOOT] YOUTUBE_API_KEY: ${env.YOUTUBE_API_KEY ? 'SET' : 'not set (optional)'}`);
    console.log(`[BOOT] SUPABASE_URL: ${env.SUPABASE_URL ? 'SET' : 'not set (optional)'}`);

    // Probe Supabase Database Health
    if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
       try {
         const { supabase } = getSupabase();
         const { error } = await supabase.from('extraction_history').select('id').limit(1);
         if (error) {
           console.error(`[BOOT] ❌ Supabase schema probe failed: ${error.message}. Is 'extraction_history' table missing or has RLS blocking it?`);
         } else {
           console.log(`[BOOT] ✅ Supabase database responding and schema verified.`);
         }
       } catch(e) {
         console.error(`[BOOT] ❌ Supabase connection failed: ${e.message}`);
       }
    } else {
       console.warn(`[BOOT] ⚠️ Supabase not configured.`);
    }
  });
}

module.exports = { app, runExtraction, jobStore };
