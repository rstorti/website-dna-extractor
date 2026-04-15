// Catch startup crashes immediately
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
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
const HISTORY_FILE = path.join(__dirname, 'outputs', 'history.json');

// Mutex to prevent race conditions during concurrent local history file read/writes
let localHistoryMutex = Promise.resolve();

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      origin.startsWith('http://localhost') ||
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

// Explicitly serve local outputs folder natively to prevent 404 proxy loops
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// Health Endpoint to keep Render awake
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Proxy Download Endpoint to fix CORS extension issues
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).send('URL missing');

    const safeFilename = path.basename(filename || 'download.png').replace(/[^a-zA-Z0-9_\-\.]/g, '');

    // Handle fallback paths if Supabase Cloud Upload failed
    if (url.startsWith('/outputs/')) {
      const localPath = path.join(__dirname, url);
      try {
        await fs.access(localPath);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        return res.sendFile(localPath);
      } catch {
        return res.status(404).send('Local file not found');
      }
    }

    // FIX #10: Re-add SSRF whitelist (removed during lazy-load refactor)
    if (!url.startsWith('/outputs/')) {
      const allowedDomains = ['.supabase.co/storage/v1/object/public/', 'google.com/s2/favicons'];
      const isAllowed = allowedDomains.some(d => url.includes(d));
      if (!isAllowed) {
        return res.status(403).send('SSRF Blocked: Proxy only permits Supabase storage or Google favicon domains.');
      }
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
      const { data, error } = await supabase
        .from('extraction_history')
        .select('*')
        .order('timestamp', { ascending: false });
      if (!error && data) return data;
    }
  } catch (e) {
    console.warn('Supabase history read failed, falling back to local:', e.message);
  }
  return readLocalHistory();
}

async function appendHistory(record) {
  // Try Supabase first
  try {
    const { supabase } = getSupabase();
    if (supabase) {
      await supabase.from('extraction_history').insert(record);
    }
  } catch (e) {
    console.warn('Supabase history write failed:', e.message);
  }
  // Always write locally as backup
  localHistoryMutex = localHistoryMutex.then(async () => {
    const history = await readLocalHistory();
    history.unshift(record);
    await writeLocalHistory(history);
  });
  await localHistoryMutex;
}

// ============ API ROUTES ============

app.get('/api/history', async (req, res) => {
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

app.post('/api/extract', async (req, res) => {
  const startTime = Date.now();
  let stage = 'init';

  try {
    const { url, youtubeUrl, profileUrl } = req.body;
    console.log(`\n[EXTRACT] Starting extraction for: url=${url}, youtubeUrl=${youtubeUrl}, profileUrl=${profileUrl}`);

    if (!url && !youtubeUrl && !profileUrl) {
      return res.status(400).json({ error: 'At least one URL is required', stage });
    }

    let dnaResult = null;
    let youtubeResult = null;
    let profileResult = null;

    // 1. Website extraction
    if (url) {
      stage = 'website-extraction';
      console.log(`[EXTRACT] Stage: ${stage}`);
      const { extractDNA } = getExtractor();
      dnaResult = await extractDNA(url);
      console.log(`[EXTRACT] Website extraction complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    }

    // 2. YouTube extraction
    if (youtubeUrl) {
      stage = 'youtube-extraction';
      console.log(`[EXTRACT] Stage: ${stage}`);
      try {
        const { extractYoutubeDetails } = getYoutubeExtractor();
        youtubeResult = await extractYoutubeDetails(youtubeUrl);
      } catch (ytErr) {
        console.warn('[EXTRACT] YouTube extraction failed, trying fallback:', ytErr.message);
        const { scrapeYoutubeFallback } = getExtractor();
        youtubeResult = await scrapeYoutubeFallback(youtubeUrl);
      }
      console.log(`[EXTRACT] YouTube extraction complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    }

    // 3. Profile extraction (recursive single-URL extraction)
    if (profileUrl) {
      stage = 'profile-extraction';
      console.log(`[EXTRACT] Stage: ${stage}`);
      const { extractDNA: extractProfileDNA } = getExtractor();
      const profileDna = await extractProfileDNA(profileUrl);
      // FIX #7: profileDna returns the full extractDNA shape, not wrapping .verifiedData
      profileResult = {
        success: true,
        data: profileDna?.mappedData || {},
        ctas: profileDna?.ctas || [],
        socialMediaLinks: profileDna?.socialMediaLinks || [],
        featuredImages: profileDna?.featuredImages || [],
        screenshotUrl: profileDna?.screenshotUrl || null,
      };
      console.log(`[EXTRACT] Profile extraction complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    }

    // 4. AI verification
    stage = 'ai-verification';
    console.log(`[EXTRACT] Stage: ${stage}`);
    let verifiedData = {};
    try {
      const { verifyDNA } = getAiVerifier();
      let aiResult = await verifyDNA(
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
      verifiedData = dnaResult?.mappedData || {};
    }
    console.log(`[EXTRACT] AI verification complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

    // 5. Build response
    stage = 'building-response';
    const payload = {
      success: true,
      isVerified: true,
      // FIX #2: Forward isWaybackFallback so UI can show the archive badge
      isWaybackFallback: dnaResult?.isWaybackFallback || false,
      data: {
        ...verifiedData,
        buttonStyles: dnaResult?.buttonStyles || [],
        featuredImages: dnaResult?.featuredImages || [],
        // FIX #2: Also embed in data for App.jsx to pick up via result.data.isWaybackFallback
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
    stage = 'saving-history';
    try {
      await appendHistory({
        id: Date.now().toString(),
        url: url || profileUrl || youtubeUrl,
        target_url: url,
        youtube_url: youtubeUrl,
        profile_url: profileUrl,
        timestamp: new Date().toISOString(),
        success: true,
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
    res.status(500).json({
      error: error.message || 'Extraction failed',
      stage,
      elapsed: totalTime,
    });
  }
});

// ============ START SERVER ============

app.listen(PORT, () => {
  console.log(`[BOOT] ✅ Server listening on port ${PORT}`);
  console.log(`[BOOT] Environment: ${env.NODE_ENV}`);
  console.log(`[BOOT] GEMINI_API_KEY: ${env.GEMINI_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`[BOOT] YOUTUBE_API_KEY: ${env.YOUTUBE_API_KEY ? 'SET' : 'not set (optional)'}`);
  console.log(`[BOOT] SUPABASE_URL: ${env.SUPABASE_URL ? 'SET' : 'not set (optional)'}`);
});
