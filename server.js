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

// Force IPv4 resolution to prevent Supabase connection timeouts on systems with broken IPv6
dns.setDefaultResultOrder('ipv4first');

// ── Lightweight profile-page scraper (no Puppeteer) ─────────────────────────
// Linktree, Beacon, Bento etc. embed all link data in a JSON blob in the HTML.
// Fetching without a browser avoids launching a second RAM-hungry Chrome instance
// when the server has already run a full website + YouTube extraction.
async function scrapeProfileLightweight(profileUrl) {
  const https = require('https');
  const http = require('http');
  return new Promise((resolve) => {
    const client = profileUrl.startsWith('https') ? https : http;
    const req = client.get(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    }, (res) => {
      // Follow redirects (max 3)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return resolve(scrapeProfileLightweight(res.headers.location));
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
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
            const anchorRegex = /<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([^<]*)</gi;
            let m;
            while ((m = anchorRegex.exec(raw)) !== null) {
              const href = m[1];
              const label = m[2].trim();
              if (href.startsWith('http') && !href.includes(new URL(profileUrl).hostname)) {
                links.push({ url: href, button_name: label || href, context: 'Profile Link' });
              }
            }
          }

          // Extract title as display name fallback
          if (!displayName) {
            const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) displayName = titleMatch[1].replace(/\s*[|\-–].*$/, '').trim();
          }

          console.log(`[Profile Lite] Scraped ${links.length} links for ${profileUrl}`);
          resolve({ success: true, links, socialLinks, displayName });
        } catch(e) {
          resolve({ success: false, error: e.message });
        }
      });
    });
    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Lightweight fetch timed out' }); });
  });
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

const app = express();
const PORT = env.PORT;
const HISTORY_FILE = path.join(__dirname, '.data', 'history.json');

// Mutex to prevent race conditions during concurrent local history file read/writes
let localHistoryMutex = Promise.resolve();

app.use(cors({
// ... (lines omitted will be fixed by just updating the app.use line instead below)
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      origin.startsWith('http://localhost') ||
      origin.includes('onrender.com') ||
      origin.includes('netlify.app') ||
      origin.includes('minfo.com') ||
      origin.includes('lovable.app') ||
      origin.includes('lovableproject.com')
    ) {
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

// Health Endpoint — shows uptime + env var status for quick diagnosis
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    env: {
      GEMINI_API_KEY: env.GEMINI_API_KEY ? 'SET' : '❌ MISSING',
      YOUTUBE_API_KEY: env.YOUTUBE_API_KEY ? 'SET' : 'not set (optional)',
      SUPABASE_URL: env.SUPABASE_URL ? 'SET' : '⚠️ not set — images will use localhost fallback',
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ? 'SET' : '⚠️ not set',
      RENDER_EXTERNAL_URL: env.RENDER_EXTERNAL_URL || '⚠️ not set — localhost fallback URLs will be used',
    }
  });
});

// Proxy Download Endpoint to fix CORS extension issues
app.get('/api/download', async (req, res) => {
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
    // The /outputs/ early-exit above already handles local paths, so every URL
    // reaching here is an http(s) remote URL that must pass this check.
    const isSupabase = url.includes('.supabase.co/storage/v1/object/public/');
    const isGoogleFavicon = /^https:\/\/www\.google\.com\/s2\/favicons\?domain=[a-zA-Z0-9._-]+(&sz=\d+)?$/.test(url);
    if (!isSupabase && !isGoogleFavicon) {
      return res.status(403).send('SSRF Blocked: Proxy only permits Supabase storage or Google favicon domains.');
    }

    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send('Upstream fetch failed');

    const buffer = Buffer.from(await response.arrayBuffer());
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
  await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
}

async function readHistory() {
  try {
    const { supabase } = getSupabase();
    if (supabase) {
      // Implement a 5-second timeout for Supabase query to prevent infinite hanging
      const queryPromise = supabase
        .from('extraction_history')
        .select('*')
        .order('timestamp', { ascending: false });
        
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase query timed out')), 5000));
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      if (!error && data) return data;
    }
  } catch (e) {
    console.warn('Supabase history read failed, falling back to local:', e.message);
  }
  return readLocalHistory();
}

async function appendHistory(record) {
  let supabaseOk = false;
  // Try Supabase first
  try {
    const { supabase } = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('extraction_history').insert(record);
      if (!error) supabaseOk = true;
      else console.warn('Supabase history write failed:', error.message);
    }
  } catch (e) {
    console.warn('Supabase history write failed:', e.message);
  }

  // Pre-production: no local file fallback
  if (!supabaseOk && env.NODE_ENV === 'production') {
    console.error('[HISTORY] ⚠️ Production history persistence failed — no local fallback in production.');
    return;
  }

  // Dev: Always write locally as backup/sync 
  localHistoryMutex = localHistoryMutex.then(async () => {
    const history = await readLocalHistory();
    history.unshift(record);
    await writeLocalHistory(history);
  });
  await localHistoryMutex;
}

// ============ API ROUTES ============

app.get('/api/history', async (req, res) => {
  // Allow all clients to fetch history for now so Netlify users can see the table without needing the VITE_ADMIN_API_KEY set


  try {
    const history = await readHistory();
    res.json(history);
  } catch (error) {
    console.error('History fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.delete('/api/history', async (req, res) => {
  try {
    const { domain, timestamp } = req.body;

    // Try Supabase deletion
    try {
      const { supabase } = getSupabase();
      if (supabase) {
        if (domain) {
          await supabase.from('extraction_history').delete().ilike('url', `%${domain}%`);
        } else if (timestamp) {
          await supabase.from('extraction_history').delete().eq('timestamp', timestamp);
        }
      }
    } catch (e) {
      console.warn('Supabase history delete failed:', e.message);
    }

    // Also clean local file
    localHistoryMutex = localHistoryMutex.then(async () => {
      let history = await readLocalHistory();
      if (domain) {
        history = history.filter(h => {
          try { return !new URL(h.url).hostname.includes(domain); } catch { return true; }
        });
      } else if (timestamp) {
        history = history.filter(h => h.timestamp !== timestamp);
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
let extractRateLimit = (req, res, next) => next();
try {
  const rateLimit = require('express-rate-limit');
  extractRateLimit = rateLimit({
    windowMs: 60_000,
    max: 5,
    standardHeaders: true,
    message: { error: 'Too many extraction requests. Please wait 1 minute before trying again.' }
  });
} catch (e) {
  console.warn('[BOOT] express-rate-limit not installed — rate limiting disabled. Run: npm install');
}

let activeExtractions = 0;
const MAX_CONCURRENCY = 4; // Prevent OOM by capping concurrent headless browsers

const extractionStatus = new Map();

app.get('/api/status', (req, res) => {
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

app.post('/api/extract', extractRateLimit, async (req, res) => {
  if (activeExtractions >= MAX_CONCURRENCY) {
    return res.status(429).json({ error: 'Server is at maximum capacity processing other extractions. Please try again in 1 minute.', stage: 'init' });
  }
  
  activeExtractions++;
  const startTime = Date.now();
  let stage = 'init';

  try {
    let { url, youtubeUrl, profileUrl } = req.body;
    console.log(`\n[EXTRACT] Starting extraction for: url=${url}, youtubeUrl=${youtubeUrl}, profileUrl=${profileUrl}. Active Jobs: ${activeExtractions}`);

    if (!url && !youtubeUrl && !profileUrl) {
      return res.status(400).json({ error: 'At least one URL is required', stage });
    }

    const { isAllowedUrl } = require('./lib/validateUrl');
    
    // Normalize and validate URLs
    const MAX_URL_LEN = 2048;
    for (const item of [{key:'url',val:url}, {key:'youtubeUrl',val:youtubeUrl}, {key:'profileUrl',val:profileUrl}]) {
      if (item.val) {
        if (typeof item.val !== 'string' || item.val.length > MAX_URL_LEN) {
          return res.status(400).json({ error: `${item.key} must be a string under ${MAX_URL_LEN} chars`, stage });
        }
        let norm = item.val.trim();
        if (!/^https?:\/\//i.test(norm)) norm = 'https://' + norm;
        const validation = await isAllowedUrl(norm);
        if (!validation.ok) {
          return res.status(403).json({ error: `Security check failed for ${item.key}: ${validation.reason}`, stage });
        }
        if (item.key === 'url') url = validation.url;
        if (item.key === 'youtubeUrl') {
          const host = new URL(validation.url).hostname.toLowerCase();
          if (!host.includes('youtube.com') && !host.includes('youtu.be')) {
            return res.status(400).json({ error: 'YouTube URL must be a valid youtube.com or youtu.be domain', stage });
          }
          youtubeUrl = validation.url;
        }
        if (item.key === 'profileUrl') {
          const host = new URL(validation.url).hostname.toLowerCase();
          if (!host.includes('linktr.ee') && !host.includes('beacon.ai') && !host.includes('bio.site') && !host.includes('bento.me') && !host.includes('lnk.bio')) {
            return res.status(400).json({ error: 'Profile URL must be a supported link-in-bio platform (e.g. linktr.ee)', stage });
          }
          profileUrl = validation.url;
        }
      }
    }

    let dnaResult = null;
    let youtubeResult = null;
    let profileResult = null;

    const targetLabel = url || profileUrl || youtubeUrl;
    extractionStatus.set(targetLabel, { stage: 'init', startTime, steps: [] });

    // stageTimings: [{stage, elapsedMs}] — recorded every time a new stage begins.
    // This powers the admin timing report in Settings > Logs.
    const stageTimings = [];
    let lastStageTime = startTime;

    const setStage = (s, isInternal = false, prefix = '') => {
      // If internal, string together the prefix e.g., 'Profile -> Booting Browser'
      const displayString = prefix ? `${prefix}: ${s}` : s;
      const now = Date.now();
      const durationMs = now - lastStageTime;
      lastStageTime = now;

      if (!isInternal) stage = displayString;
      console.log(`[EXTRACT] Stage: ${displayString} (+${durationMs}ms)`);

      // Record timing for every stage (including internal sub-stages)
      stageTimings.push({ stage: displayString, elapsedMs: now - startTime, durationMs });

      const stat = extractionStatus.get(targetLabel);
      if (stat) {
        if (!stat.steps.includes(displayString)) stat.steps.push(displayString);
        extractionStatus.set(targetLabel, { stage: displayString, startTime: stat.startTime, steps: stat.steps });
      }
    };

    // 1. Website extraction
    if (url) {
      setStage('website-extraction');
      const { extractDNA } = getExtractor();
      dnaResult = await extractDNA(url, (internalStage) => setStage(internalStage, true, 'Website'));
      if (dnaResult?.error) {
        return res.status(422).json({
          error: dnaResult.error, stage: 'website-extraction',
          hint: 'The website could not be scraped. It may be blocking bots, offline, or using an unsupported architecture.'
        });
      }
      console.log(`[EXTRACT] Website extraction complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    }

    // 2. YouTube extraction — NON-FATAL: timeouts and errors are caught and
    //    logged but do not abort the overall extraction. YouTubeResult will be
    //    null/partial if scraping fails; the rest of the data still returns.
    //    Priority: (1) YouTube Data API → (2) oEmbed (no auth) → (3) Puppeteer
    let youtubeWarning = null;
    if (youtubeUrl) {
      setStage('youtube-extraction');
      try {
        // Tier 1: YouTube Data API (fastest, richest data, but requires quota)
        const { extractYoutubeDetails } = getYoutubeExtractor();
        youtubeResult = await extractYoutubeDetails(youtubeUrl);
        if (youtubeResult?.error) throw new Error(youtubeResult.error);
        console.log('[EXTRACT] YouTube Data API succeeded');
      } catch (ytErr) {
        console.warn('[EXTRACT] YouTube API failed, trying oEmbed fallback:', ytErr.message);
        try {
          // Tier 2: oEmbed — zero-auth, no quota, works for any public video/channel URL
          // Returns: title, channel name (author_name), thumbnail_url, provider_name
          const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
          const oEmbedRes = await axios.get(oEmbedUrl, { timeout: 10_000 });
          if (oEmbedRes.data && oEmbedRes.data.title) {
            youtubeResult = {
              title: oEmbedRes.data.title,
              channel: oEmbedRes.data.author_name,
              description: `${oEmbedRes.data.author_name} — ${oEmbedRes.data.title}`,
              thumbnail: oEmbedRes.data.thumbnail_url || null,
              channelLogo: null,
            };
            console.log(`[EXTRACT] oEmbed fallback succeeded: "${youtubeResult.title}" by ${youtubeResult.channel}`);
          } else {
            throw new Error('oEmbed returned no data');
          }
        } catch (oEmbedErr) {
          console.warn('[EXTRACT] oEmbed failed, trying Puppeteer fallback:', oEmbedErr.message);
          try {
            const { scrapeYoutubeFallback } = getExtractor();
            // Tier 3: Puppeteer — 30s hard timeout (reduced from 45s)
            youtubeResult = await Promise.race([
              scrapeYoutubeFallback(youtubeUrl),
              new Promise((_, rej) => setTimeout(() => rej(new Error('YouTube Puppeteer timeout after 30s')), 30_000))
            ]);
            if (youtubeResult?.error) throw new Error(youtubeResult.error);
          } catch (fallbackErr) {
            // Non-fatal: record the warning and continue with whatever website data we have
            youtubeWarning = `YouTube extraction skipped: ${fallbackErr.message}`;
            console.warn(`[EXTRACT] ⚠️ All YouTube methods failed (non-fatal): ${fallbackErr.message}`);
            youtubeResult = null;
          }
        }
      }
      console.log(`[EXTRACT] YouTube stage complete (${((Date.now() - startTime) / 1000).toFixed(1)}s) — ${youtubeWarning ? 'SKIPPED' : 'OK'}`);
    }

    }

    // 3. Profile extraction — try lightweight HTTP scraper first to avoid
    //    launching a second Puppeteer browser on a memory-constrained Render instance.
    if (profileUrl) {
      setStage('profile-extraction');

      let profileLite = null;
      try {
        setStage('Profile: Lightweight Fetch', true);
        profileLite = await scrapeProfileLightweight(profileUrl);
      } catch(liteErr) {
        console.warn('[Profile] Lightweight scraper threw:', liteErr.message);
      }

      if (profileLite?.success && profileLite.links?.length > 0) {
        // Use lightweight result — no Puppeteer needed
        setStage('Profile: Links Extracted', true);
        console.log(`[EXTRACT] Profile lightweight scrape succeeded (${profileLite.links.length} links)`);
        profileResult = {
          success: true,
          data: { name: profileLite.displayName },
          ctas: profileLite.links,
          socialMediaLinks: profileLite.socialLinks || [],
          featuredImages: [],
          screenshotUrl: null,
        };
      } else {
        // Fallback to full Puppeteer extraction
        console.log('[Profile] Lightweight scraper got no links, falling back to Puppeteer...');
        setStage('Profile: Full Browser Fetch', true);
        const { extractDNA: extractProfileDNA } = getExtractor();
        const profileDna = await extractProfileDNA(profileUrl, (internalStage) => setStage(internalStage, true, 'Profile'));
        
        if (profileDna?.error) {
          const stat = extractionStatus.get(targetLabel);
          return res.status(422).json({
            error: profileDna.error, 
            stage: 'profile-extraction',
            steps: stat?.steps || [],
            elapsed: Math.round((Date.now() - startTime) / 1000),
            hint: 'The profile URL could not be scraped. The server may have run out of memory after processing the main website. Try submitting only the Profile URL on its own.'
          });
        }
        profileResult = {
          success: true,
          data: profileDna?.mappedData || {},
          ctas: profileDna?.ctas || [],
          socialMediaLinks: profileDna?.socialMediaLinks || [],
          featuredImages: profileDna?.featuredImages || [],
          screenshotUrl: profileDna?.screenshotUrl || null,
        };
      }
      console.log(`[EXTRACT] Profile extraction complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    }

    // 4. AI verification — only runs when there is real data to verify.
    // Skipping for YouTube-only requests (no website data) saves an unnecessary Gemini API call.
    let verifiedData = dnaResult?.mappedData || {};
    if (dnaResult || youtubeResult) {
      setStage('ai-verification');
      try {
        const { verifyDNA } = getAiVerifier();
        const aiResult = await verifyDNA(
          dnaResult?.mappedData || {},
          dnaResult?.screenshotPath,
          dnaResult?.logoPath,
          youtubeResult
        );
        verifiedData = {
          ...(dnaResult?.mappedData || {}),
          ...(aiResult?.verified_data || {})
        };
      } catch (aiErr) {
        console.warn('[EXTRACT] AI verification failed, using raw data:', aiErr.message);
      }
      console.log(`[EXTRACT] AI verification complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    }

    // 5. Build response
    setStage('building-response');
    const totalMs = Date.now() - startTime;
    const payload = {
      success: true,
      isVerified: true,
      isWaybackFallback: dnaResult?.isWaybackFallback || false,
      youtubeWarning: youtubeWarning || null,   // non-null if YouTube was skipped
      totalMs,                                   // total extraction time in ms
      stageTimings,                              // [{stage, elapsedMs, durationMs}]
      data: {
        ...verifiedData,
        buttonStyles: dnaResult?.buttonStyles || [],
        featuredImages: dnaResult?.featuredImages || [],
        isWaybackFallback: dnaResult?.isWaybackFallback || false,
      },
      mappedData: dnaResult?.mappedData,
      youtubeData: youtubeResult || null,
      screenshotUrl: dnaResult?.screenshotUrl || null,
      buttonStyles: dnaResult?.buttonStyles || [],
      ctas: dnaResult?.ctas || [],
      socialMediaLinks: dnaResult?.socialMediaLinks || [],
      featuredImages: dnaResult?.featuredImages || [],
      profilePayload: profileResult || null,
    };

    // 6. Save to history
    setStage('saving-history');
    try {
      // Store full payload so the History "Review" button can fully restore the extraction.
      // NOTE: individual records can be 50-150 KB but this is necessary for Review to work.
      await appendHistory({
        id: Date.now().toString(),
        url: url || profileUrl || youtubeUrl,
        target_url: url || '',
        youtube_url: youtubeUrl || '',
        profile_url: profileUrl || '',
        timestamp: new Date().toISOString(),
        success: true,
        name: payload.data?.name || null,
        screenshotUrl: payload.screenshotUrl || null,
        payload,
      });
    } catch (histErr) {
      console.warn('[EXTRACT] History save failed:', histErr.message);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[EXTRACT] ✅ Extraction complete in ${totalTime}s`);
    res.json(payload);

  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[EXTRACT] ❌ Failed at stage "${stage}" after ${totalTime}s:`, error);

    // Build a human-readable hint based on the stage that failed
    const stageHints = {
      'init':              'Failed during initialisation — check server logs.',
      'scraping':          'Failed while scraping the website. The site may be blocking bots, offline, or returning a 403/WAF error.',
      'screenshot':        'Failed while taking a screenshot. The page may use strict CSP or require login.',
      'logo':              'Failed while extracting the logo. This is usually non-fatal — try again.',
      'images':            'Failed while processing hero images. Check Supabase credentials and storage bucket.',
      'youtube':           'Failed while fetching YouTube data. Check your YOUTUBE_API_KEY is valid and not over quota.',
      'profile':           'Failed while scraping the profile/Linktree URL.',
      'ai-verification':   'Failed during AI verification (Gemini). Check your GEMINI_API_KEY.',
      'building-response': 'Failed while assembling the final response payload.',
      'saving-history':    'Extraction succeeded but history save failed — data may not appear in History tab.',
    };
    const hint = stageHints[stage] || "An unexpected error occurred during extraction.";
    
    const targetLabel = req.body.url || req.body.profileUrl || req.body.youtubeUrl;
    const stat = extractionStatus.get(targetLabel);
    
    // Explicitly send back detailed properties so the frontend can parse the UI
    res.status(500).json({ 
      error: error.message, 
      stage, 
      steps: stat ? stat.steps : [],
      elapsed: Math.floor((Date.now() - startTime) / 1000),
      hint,
    });
  } finally {
    const targetLabel = req.body.url || req.body.profileUrl || req.body.youtubeUrl;
    if (targetLabel) extractionStatus.delete(targetLabel);
    
    activeExtractions--;
    console.log(`[EXTRACT] Concurrency check: ${activeExtractions} active jobs remaining.`);
  }
});


// ============ START SERVER ============

app.listen(PORT, async () => {
  console.log(`[BOOT] ✅ Server listening on port ${PORT}`);
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
