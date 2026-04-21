const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { generateBrandHero } = require('./vertex_imagen');
const { generateHeroPrompts, analyzeImageForTextPlacement } = require('./gemini_prompter');
const { supabase } = require('./supabaseClient');
const env = require('./config/env');
 
// FIX #3: Screenshots can be 5-8MB as base64 strings which crashes Render's 512MB RAM.
// Derive the server's public base URL for local /outputs/ file links
// On Render this is the external URL; on Railway it's RAILWAY_PUBLIC_DOMAIN; locally it's localhost
const getServerBaseUrl = () => {
  if (env.RENDER_EXTERNAL_URL) return env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${env.PORT || 3001}`;
};

// Upload a file to Supabase storage and return a public URL.
// Falls back to a proper absolute http:// URL (never a bare relative path).
async function uploadToSupabase(filename, buffer, mimeType = 'image/jpeg') {
  const localUrl = `${getServerBaseUrl()}/outputs/${filename}`;

  if (!env.SUPABASE_URL || env.SUPABASE_URL.includes('missing.supabase.co')) {
    console.log(`⚠️ Supabase not configured. Using local URL for ${filename}.`);
    return localUrl;
  }

  try {
    const { error } = await supabase.storage
      .from('outputs')
      .upload(filename, buffer, { contentType: mimeType, upsert: true });

    if (error) {
      console.error('Supabase upload error:', error);
      return localUrl;
    }

    const { data } = supabase.storage.from('outputs').getPublicUrl(filename);
    return data.publicUrl;
  } catch (e) {
    console.error('Supabase generic error:', e);
    return localUrl;
  }
}
 
// ─── Puppeteer launch configuration — single source of truth ──────────────────
// Defining args once here prevents the two launch sites (initial + recreatePage)
// from drifting out of sync when flags need updating.
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',        // Use /tmp instead of /dev/shm (too small in Docker)
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-infobars',
  '--disable-breakpad',
  '--disable-canvas-aa',
  '--disable-2d-canvas-clip-aa',
  '--disable-gl-drawing-for-tests',
  // NOTE: --single-process removed — causes page.screenshot() to hang in Docker
  // NOTE: --no-zygote removed — only safe alongside --single-process;
  //       without it, Chrome segfaults when forking renderer processes in Docker
  '--memory-pressure-off',
  '--window-size=1280,800'
];

async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    ignoreHTTPSErrors: true,
    protocolTimeout: 120_000,
    args: PUPPETEER_ARGS
  });
}
// ───────────────────────────────────────────────────────────────────────────────

// Clean output files older than 24 h on process start to prevent disk accumulation
// on persistent deployments (Render persistent disks, local dev, etc.).
(async function cleanOldOutputs() {
  try {
    const outputDir = path.join(__dirname, 'outputs');
    const files = await fs.readdir(outputDir).catch(() => []);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const f of files) {
      try {
        const stat = await fs.stat(path.join(outputDir, f));
        if (stat.mtimeMs < cutoff) { await fs.unlink(path.join(outputDir, f)); removed++; }
      } catch { /* individual file errors are safe to ignore */ }
    }
    if (removed > 0) console.log(`[CLEANUP] Removed ${removed} output file(s) older than 24h.`);
  } catch (e) {
    console.warn('[CLEANUP] Output cleanup skipped:', e.message);
  }
})();

async function autoScroll(page) {
  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 600;
        let scrolls = 0;
        
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          scrolls++;
 
          // Stop if we reach bottom OR if we scroll 15 times (max runtime ~3750ms)
          // This is crucial for infinite scroll sites like lbc.co.uk which trap the agent in loops.
          if (totalHeight >= scrollHeight - window.innerHeight || scrolls >= 15) {
            clearInterval(timer);
            resolve();
          }
        }, 250);
      });
    });
  } catch(e) {
    console.log("⚠️ autoScroll skipped around detached frame to prevent crash.");
  }
}
 
function rgbToHex(rgb) {
  if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return null;
  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return "#" + (1 << 24 | match[1] << 16 | match[2] << 8 | match[3]).toString(16).slice(1).toUpperCase();
}
 
async function scrapeYoutubeFallback(url) {
  let browser = null;
  try {
    console.log(`\n🕵️♂️ PUPPETEER FALLBACK: Scraping YouTube DOM for ${url}...`);
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
      protocolTimeout: 120000,
      args: PUPPETEER_ARGS
    });
    const page = await browser.newPage();
    // Spoof a real Chrome browser to defeat YouTube bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    // Mask navigator.webdriver to evade Puppeteer detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err) {
      const errMsg = err.message ? err.message.toLowerCase() : '';
      if (errMsg.includes('timeout') || errMsg.includes('detached') || errMsg.includes('aborted')) {
        console.log(`⚠️ YouTube navigation interrupted for ${url} (Timeout or Detached). Attempting to salvage loaded DOM...`);
      } else {
        throw err;
      }
    }
    // Extra wait: YouTube is JS-heavy, give it time to hydrate
    await new Promise(r => setTimeout(r, 3000));
    
    // Handle EU consent or 'Before you continue' dialogs
    try {
      await page.evaluate(() => {
         const buttons = Array.from(document.querySelectorAll('button'));
         const acceptBtn = buttons.find(b => b.innerText.includes('Accept all') || b.innerText.includes('I agree'));
         if (acceptBtn) acceptBtn.click();
      });
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {}
 
    await page.waitForSelector('h1.ytd-watch-metadata', { timeout: 10000 }).catch(() => null);
    
    // 🏆 FALLBACK 3: Bulletproof JSON Extraction
    // Extract the full un-truncated text directly from YouTube's pre-rendered window object
    const jsonExtraction = await page.evaluate(() => {
        try {
            if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails) {
                return {
                    title: window.ytInitialPlayerResponse.videoDetails.title || 'Unknown Title',
                    channel: window.ytInitialPlayerResponse.videoDetails.author || 'Unknown Channel',
                    description: window.ytInitialPlayerResponse.videoDetails.shortDescription || 'No description text found.'
                };
            }
        } catch (e) {}
        return null;
    });
 
    if (jsonExtraction && jsonExtraction.description !== 'No description text found.') {
        console.log(`✅ Puppeteer JSON Extraction Succeeded. Title: ${jsonExtraction.title}`);
        return { 
            title: jsonExtraction.title, 
            channel: jsonExtraction.channel, 
            description: jsonExtraction.description, 
            publishedAt: 'Agent JSON Extracted' 
        };
    }
 
    console.log(`⚠️ JSON Extraction failed, attempting DOM visual extraction...`);
 
    // Look for "more" or "Show more" button on the description and click it
    await page.evaluate(() => {
       const expandBtns = document.querySelectorAll('#expand, tp-yt-paper-button#expand, ytd-text-inline-expander');
       for (let btn of expandBtns) {
           if (btn.innerText && btn.innerText.toLowerCase().includes('more')) {
               btn.click();
           }
       }
    }).catch(() => null);
    
    await new Promise(r => setTimeout(r, 1500)); // wait for DOM update animation
 
    const title = await page.evaluate(() => {
       const el = document.querySelector('h1.ytd-watch-metadata');
       return el ? el.innerText.trim() : 'Unknown Title';
    }).catch(() => 'Unknown Title');
 
    const description = await page.evaluate(() => {
       const container = document.querySelector('#description-inline-expander');
       if (!container) return 'No description text found.';
       let text = container.innerText.trim();
       // Clean up the DOM artifact buttons
       text = text.replace(/Show less$/i, '').replace(/\.\.\.more$/i, '').trim();
       return text;
    }).catch(() => 'No description found.');
 
    const channel = await page.evaluate(() => {
       const el = document.querySelector('ytd-channel-name a');
       return el ? el.innerText.trim() : 'Unknown Channel';
    }).catch(() => 'Unknown Channel');
 
    console.log(`✅ Puppeteer YouTube Scrape Complete. Title: ${title}`);
    return { title, channel, description, publishedAt: 'Agent Extracted' };
  } catch (error) {
    console.error(`❌ Puppeteer YouTube Fallback Error: ${error.message}`);
    return { error: `Agent Fallback scraping failed: ${error.message}` };
  } finally {
    if (browser) await browser.close().catch(console.error);
  }
}
 
async function extractDNA(url, progressCb = null, presetSelectedImages = []) {
  const logStage = (msg) => { if (progressCb) progressCb(msg); };
  console.log(`\n🚀 Launching Puppeteer DNA Extractor for: ${url} `);
  logStage('Booting Headless Browser');
 
  let browser;
  try {
    browser = await Promise.race([
      launchBrowser(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Browser launch timed out after 30s. Server may be out of memory — try again in 1 minute.')), 30_000))
    ]);
  } catch (launchErr) {
    console.error(`❌ Browser Launch Failed: ${launchErr.message}`);
    return { error: launchErr.message };
  }
 
  logStage(`Configuring virtual browser for ${url}`);
  let page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(90000);
 
  // Block heavy resources (fonts, media, large images) to speed up navigation on constrained servers
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (['font', 'media'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
 
  // Override default Puppeteer timeouts to prevent the 60000ms default from hitting first
  page.setDefaultNavigationTimeout(90_000); // synchronous setter — no await needed
  page.setDefaultTimeout(90_000);           // synchronous setter — no await needed
 
  // Set a standard desktop viewport
  await page.setViewport({ width: 1280, height: 800 });       

  async function recreatePage() {
    try {
      if (page && !page.isClosed()) await page.close();
      if (browser) await browser.close();
    } catch(e) {}
    
    // Relaunch browser to guarantee clean state using the shared launchBrowser() helper
    browser = await launchBrowser();
    
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);
    await page.setViewport({ width: 1280, height: 800 });
  }
 
  try {
    let fallbackToWayback = false;
 
    // --- Tier 1: Live Fetch (with progressive timeout strategy) ---
    logStage('Attempting Live Fetch');
    try {
      let navigationSucceeded = false;
 
      // Attempt 1: Standard fetch with domcontentloaded (45s)
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        navigationSucceeded = true;
      } catch (err) {
        const errMsg = err.message ? err.message.toLowerCase() : '';
        if (errMsg.includes('timeout') || errMsg.includes('detached') || errMsg.includes('aborted')) {
          logStage('Scraping DOM Geometry & Text');
          console.log(`📡 Analyzing DOM structure for ${url} (${err.message}). Proceeding with partially loaded DOM...`);
          navigationSucceeded = true; // Partial DOM is still usable
        } else {
          // Automatic fallback for apex domains with broken SSL (e.g., minfo.com -> www.minfo.com)
          const parsedUrl = new URL(url);
          if (!parsedUrl.hostname.startsWith('www.')) {
            console.log(`⚠️ Connection to ${url} failed (${err.message}). Attempting fallback to www subdomain...`);
            parsedUrl.hostname = 'www.' + parsedUrl.hostname;
            url = parsedUrl.toString();
            try {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
              navigationSucceeded = true;
            } catch (fallbackErr) {
              const fbMsg = fallbackErr.message ? fallbackErr.message.toLowerCase() : '';
              if (fbMsg.includes('timeout') || fbMsg.includes('detached') || fbMsg.includes('aborted')) {
                console.log(`⚠️ Fallback navigation interrupted for ${url}. Proceeding with partially loaded DOM...`);
                navigationSucceeded = true;
              } else {
                throw fallbackErr;
              }
            }
          } else {
            throw err;
          }
        }
      }
 
  // Attempt 2: If still no content, try a fresh page with minimal wait strategy
      logStage('Locating High-Res Logo');
      if (navigationSucceeded) {
        let hasContent = false;
        try { hasContent = await page.evaluate(() => !!(document.body && document.body.innerHTML.length > 200)); } catch(e) {}
 
        if (!hasContent) {
          console.log(`⚠️ Page body is empty or too short. Retrying with fresh page and 'commit' waitUntil (lighter strategy)...`);
          try {
            const freshPage = await browser.newPage();
            freshPage.setDefaultNavigationTimeout(90000);
            freshPage.setDefaultTimeout(90000);
            await freshPage.setViewport({ width: 1280, height: 800 });
            await freshPage.goto(url, { waitUntil: 'commit', timeout: 90000 });
            await new Promise(r => setTimeout(r, 5000)); // Wait 5s after first byte for JS to mount
            const freshContent = await freshPage.evaluate(() => document.body && document.body.innerHTML.length > 200).catch(() => false);
            if (freshContent) {
              console.log(`✅ Fresh page strategy succeeded!`);
              await page.close().catch(() => {});
              page = freshPage;
            } else {
              await freshPage.close().catch(() => {});
            }
          } catch(retryErr) {
            console.warn(`⚠️ Fresh page retry also failed: ${retryErr.message}`);
          }
        }
      }
 
      // Reduced wait (3s) for JS frameworks to mount
      await new Promise(r => setTimeout(r, 3000));
      
      console.log(`✅ Page loaded and Javascript mounted. Executing Anti-Bot WAF Verification...`);
 
      // --- Anti-Bot & Enterprise WAF Firewall Check ---
      let pageTitle = "Unknown Domain";
      let pageContent = "";
      let frameReadSuccess = false;
      for (let attempts = 0; attempts < 3; attempts++) {
          try {
              pageTitle = await page.title();
              pageContent = await page.evaluate(() => document.body.innerText.substring(0, 1000));
              frameReadSuccess = true;
              break;
          } catch(e) {
              console.warn(`⚠️ WAF check frame detached. Waiting 3s for redirect... (Attempt ${attempts+1}/3)`);
              await new Promise(r => setTimeout(r, 3000));
          }
      }
      // Extended blocked keyword list — catches 403, Cloudflare, WAF challenges, Incapsula, etc.
      const blockedKeywords = [
        'Access Denied', 'Attention Required!', 'Cloudflare Ray ID', 'Security Check',
        '403 Forbidden', 'Error 403', '403 Error', 'Forbidden',
        'Just a moment', 'Enable JavaScript', 'DDoS protection',
        'Checking your browser', 'Please Wait', 'Verifying you are human',
        'Incapsula incident', 'Request blocked', 'This site is protected'
      ];
      
      const isBlocked = blockedKeywords.some(keyword =>
        pageTitle.toLowerCase().includes(keyword.toLowerCase()) || 
        pageContent.toLowerCase().includes(keyword.toLowerCase())
      );

      // Also check if the response is extremely short (likely a block page, not real content)
      const tooShort = pageContent.length < 150;

      if (isBlocked || tooShort || !frameReadSuccess) {
        console.warn(`🔒 Block detected (isBlocked:${isBlocked}, tooShort:${tooShort}). Falling back to Wayback Machine.`);
        fallbackToWayback = true;
      }
    } catch (liveErr) {
      console.warn(`⚠️ Live fetch failed entirely (${liveErr.message}). Falling back to Wayback Machine.`);
      fallbackToWayback = true;
    }
 
    // --- Tier 2: Wayback Machine Fetch ---
    if (fallbackToWayback) {
       logStage('Processing HTML Response (Wayback/HTTP)');
       console.log(`\n======================================================`);
       console.log(`🌐 TIER 2: FETCHING FROM WAYBACK MACHINE ARCHIVE`);
       
       // Completely recreate page to guarantee we drop any detached frame corruption
       await recreatePage();
       
       // FIX #6: Try latest snapshot first (/2/), then fallback to most-relevant (/0/) if that 404s
       let archiveUrl = `https://web.archive.org/web/2/${url}`;
       try {
          let archiveLoaded = false;
          try {
            await page.goto(archiveUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
            archiveLoaded = true;
          } catch (firstArchiveErr) {
            console.warn(`⚠️ Latest Wayback snapshot failed (${firstArchiveErr.message}). Trying timestamp-neutral URL...`);
            archiveUrl = `https://web.archive.org/web/0/${url}`;
            await page.goto(archiveUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
            archiveLoaded = true;
          }
          
          console.log(`✅ Loaded Archive URL successfully. Cleaning up Archive UI elements...`);
          // Hide the Wayback Machine's injected top banner so it doesn't mess up logo/color extraction
          await page.evaluate(() => {
             try {
                const wmBanner = document.getElementById('wm-ipp-base');
                if (wmBanner) wmBanner.style.display = 'none';
                if (document.body && document.body.style) {
                   document.body.style.paddingTop = '0px';
                   document.body.style.marginTop = '0px';
                }
             } catch(e) {}
          });
          
          let pageTitle = await page.title();

          // Check if Wayback didn't archive this site at all
          if (pageTitle.includes('Wayback Machine') && !pageTitle.includes(new URL(url).hostname)) {
            throw new Error(`Website not found in the Internet Archive.`);
          }

          // Also check if the Wayback snapshot itself returned a 403/block page
          const waybackContent = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '').catch(() => '');
          const waybackBlocked = ['403 Forbidden', 'Access Denied', 'Request blocked'].some(k => waybackContent.toLowerCase().includes(k.toLowerCase()));
          if (waybackBlocked) {
            throw new Error(`Wayback Machine snapshot also returned a blocked/403 page.`);
          }

        } catch (archiveErr) {
          console.error(`❌ Wayback Machine fallback failed: ${archiveErr.message}`);

          // --- Tier 3: Rotating User-Agent HTTP Fetch ---
          console.log(`\n======================================================`);
          console.log(`🌐 TIER 3: ROTATING USER-AGENT HTTP FALLBACK`);
          
          const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1'
          ];

          let htmlFetched = false;
          for (const ua of userAgents) {
            if (htmlFetched) break;
            try {
              console.log(`🔄 Trying HTTP fetch with: ${ua.substring(0, 40)}...`);
              const httpResponse = await axios.get(url, {
                timeout: 15000,
                headers: {
                  'User-Agent': ua,
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                  'Accept-Encoding': 'gzip, deflate, br',
                  'Cache-Control': 'no-cache',
                  'Pragma': 'no-cache',
                  'Upgrade-Insecure-Requests': '1',
                  'Sec-Fetch-Dest': 'document',
                  'Sec-Fetch-Mode': 'navigate',
                  'Sec-Fetch-Site': 'none',
                  'Sec-Fetch-User': '?1'
                },
                maxRedirects: 5,
                validateStatus: (status) => status < 500
              });
              const html = httpResponse.data;
              if (typeof html === 'string' && html.length > 500 && !html.toLowerCase().includes('403 forbidden') && !html.toLowerCase().includes('access denied')) {
                console.log(`✅ HTTP Fallback succeeded (${ua.substring(0, 30)}). Retrieved ${html.length} chars.`);
                await recreatePage();
                await page.setContent(html, { timeout: 90000 });
                htmlFetched = true;
              } else {
                console.warn(`⚠️ HTTP blocked or too short (${html?.length || 0} chars), trying next UA...`);
              }
            } catch (httpErr) {
              console.warn(`⚠️ HTTP attempt failed (${httpErr.message}), trying next UA...`);
            }
          }
          
          if (!htmlFetched) {
            console.error(`❌ All Tier 3 user-agents failed.`);
            throw new Error('All tiers failed (Live blocked, Wayback blocked, HTTP all user-agents rejected).');
          }
        }
    }
 
    console.log(`✅ Passed Security. Executing auto-scroll to trigger lazy rendering...`);
    await autoScroll(page);
    console.log(`✅ Auto - scrolling complete. Waiting for JS images to settle...`);
    // Wait for lazy-loaded JS images to paint after scroll (UKRI, React sites etc. need this)
    await new Promise(r => setTimeout(r, 3000));
    // Also try to wait for network to go quiet (max 5s) so dynamic images fully load
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
    console.log(`🖼️ Image settle wait complete. Beginning DOM extraction...`);

    // --- Begin Data Extraction ---
    console.log(`🧬 Extracting DOM data...`);
    let extractedData;
    let visualFallbackTriggered = false;
    
    for (let attempts = 0; attempts < 3; attempts++) {
      try {
        extractedData = await page.evaluate(() => {
          const data = {
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || "",
          logo: (() => {
            const BAD_PATTERNS = ['onetrust', 'pixel', 'tracking', 'analytics', 'cookie', 'favicon', 'gov.uk'];
            const isBad = (src) => !src || BAD_PATTERNS.some(p => src.toLowerCase().includes(p));

            // 1. LD+JSON schema — but only accept if it is NOT the gov.uk generic logo
            let ldSrc = "";
            document.querySelectorAll('script[type="application/ld+json"]').forEach(tag => {
              try {
                const d = JSON.parse(tag.innerText);
                let candidate = typeof d.logo === 'string' ? d.logo : (d.logo?.url || '');
                if (!candidate && d['@graph']) {
                  d['@graph'].forEach(item => {
                    if (!candidate && item.logo) candidate = typeof item.logo === 'string' ? item.logo : (item.logo?.url || '');
                  });
                }
                if (candidate && !isBad(candidate) && !candidate.includes('gov.uk')) ldSrc = candidate;
              } catch (e) { }
            });
            if (ldSrc) return ldSrc;

            // 2. Explicit logo class/id selectors — most reliable for branded sites
            const logoSelectors = [
              '[class*="logo"] img', '[id*="logo"] img',
              '[class*="brand"] img', '[id*="brand"] img',
              '[class*="site-logo"] img', '[aria-label*="logo" i] img',
              'header img', 'nav img',
              // Anchor wrappers: look inside for the real img
              'a[class*="logo"] img', 'a[class*="brand"] img',
              // SVG logos embedded directly
              'header svg', 'nav svg',
            ];
            for (const sel of logoSelectors) {
              const el = document.querySelector(sel);
              if (!el) continue;
              // Only use genuine image sources — never an anchor href
              const src = el.currentSrc || el.src || el.getAttribute('data-src') || '';
              if (src && src.startsWith('http') && !isBad(src)) return src;
            }

            // 3. Apple touch icon (high-res brand icon)
            const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')?.href;
            if (appleIcon && !isBad(appleIcon)) return appleIcon;

            // 4. OG image as last DOM resort
            return document.querySelector('meta[property="og:image"]')?.content || "";
          })(),
        domain: window.location.hostname,
        images: [],
        colors: { background: [], text: [], buttons: [] }
      };
 
      // Collect images from: <img>, srcset, data-src, <picture><source>, CSS backgrounds
      const seenUrls = new Set();
      const imagesWithMeta = [];

      const resolveUrl = (src) => {
        if (!src || !src.trim()) return null;
        src = src.trim().split(' ')[0]; // handle srcset "url 2x" format
        if (src.startsWith('//')) src = 'https:' + src;
        if (!src.startsWith('http')) return null;
        return src;
      };

      const addImage = (src, area) => {
        const url = resolveUrl(src);
        if (!url || seenUrls.has(url)) return;
        // Reject obvious non-content utility images only — do NOT reject 'logo' since many
        // sites use logo in content image paths; brightness filter will handle dark images
        const bad = ['onetrust','pixel','tracking','analytics','cookie','favicon','1x1','blank','placeholder','sprite','spacer','badge'];
        if (bad.some(p => url.toLowerCase().includes(p))) return;
        
        seenUrls.add(url);
        imagesWithMeta.push({ src: url, area: area || 0 });
      };

      // 1. Standard <img> tags with all possible src sources
      Array.from(document.querySelectorAll('img')).forEach(img => {
        // Item 13: Filter out images from header, nav, and footer contexts
        if (img.closest && img.closest('header, nav, footer, aside, [class*="nav"], [class*="menu"], [class*="header"], [class*="footer"]')) return;

        const w = img.naturalWidth || img.width || img.getBoundingClientRect().width || 0;
        const h = img.naturalHeight || img.height || img.getBoundingClientRect().height || 0;
        const area = w * h;

        // Item 14/15: Enforce size and aspect ratio if dimensions are known
        if (w > 0 && h > 0) {
            if (w < 200 || h < 200) return; // Filter tiny UI elements
            const aspect = w / h;
            if (aspect > 3 || aspect < 0.33) return; // Reject extreme banners/slivers
        }

        // currentSrc handles <picture><source> selections
        if (img.currentSrc) addImage(img.currentSrc, area);
        if (img.src) addImage(img.src, area);

        // data-src / data-lazy-src for lazy loaders
        const lazySrc = img.dataset.src || img.dataset.lazySrc || img.dataset.original || img.getAttribute('data-lazy');
        if (lazySrc) addImage(lazySrc, area || 5000); // assume non-trivial if lazy

        // srcset: pull the largest listed URL
        const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
        if (srcset) {
          const parts = srcset.split(',').map(s => s.trim().split(' '));
          // Sort by descriptor (width descriptor like 800w or resolution 2x)
          const best = parts.sort((a, b) => parseFloat(b[1]||0) - parseFloat(a[1]||0))[0];
          if (best && best[0]) addImage(best[0], area || 5000);
        }
      });

      // 2. <picture><source> elements (may not be reflected in img.currentSrc)
      Array.from(document.querySelectorAll('picture source')).forEach(src => {
        const srcset = src.getAttribute('srcset') || src.getAttribute('data-srcset');
        if (!srcset) return;
        const first = srcset.split(',')[0].trim().split(' ')[0];
        if (first) addImage(first, 10000);
      });

      // 3. CSS background-image on hero/banner/feature containers
      const bgSelectors = ['[class*="hero"]','[class*="banner"]','[class*="feature"]','[class*="cover"]','[class*="carousel"]','[class*="slide"]','[class*="masthead"]','section','main > div'];
      bgSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const bg = window.getComputedStyle(el).backgroundImage;
          if (bg && bg !== 'none') {
            const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
            if (match && match[1]) addImage(match[1], 50000); // hero BGs get priority
          }
        });
      });

      // Sort: largest area (most important images) first, filter tiny icons
      imagesWithMeta.sort((a, b) => b.area - a.area);
      // Keep images with any reasonable size — lazy-loaded ones have area=5000 placeholder
      data.images = imagesWithMeta.filter(i => i.area >= 5000).map(i => i.src);
      // Cap at 20 to avoid memory issues
      if (data.images.length > 20) data.images = data.images.slice(0, 20);
      console.log('[DNA] Images found:', data.images.length);
 
      // Grab generic background and text colors from body
      const bodyStyle = window.getComputedStyle(document.body);
      data.colors.background.push(bodyStyle.backgroundColor);
      data.colors.text.push(bodyStyle.color);
 
      // FIX #5: Hoist getActualTextColor above forEach to avoid re-declaration on every button iteration
      function getActualTextColor(element) {
        const children = Array.from(element.children);
        if (children.length === 0) return window.getComputedStyle(element).color;
        for (let i = 0; i < children.length; i++) {
          if (children[i].innerText && children[i].innerText.trim() === element.innerText.trim()) {
            return getActualTextColor(children[i]);
          }
        }
        return window.getComputedStyle(element).color;
      }

      // Grab button colors to represent "brand" or "accent" colors
      const buttons = document.querySelectorAll('button, a.btn, a.button, a[class*="btn"], a[class*="button"], [role="button"], input[type="submit"], input[type="button"]');
      const buttonStyles = [];
 
      buttons.forEach(btn => {
        const style = window.getComputedStyle(btn);
 
        // Skip invisible or transparent structural buttons
        if (style.display === 'none' || style.visibility === 'hidden' || style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') {
          return;
        }
 
        const radiusStr = style.borderRadius || '0px';
        const radPixelMatch = radiusStr.match(/(\d+)px/);
        let radiusVal = radPixelMatch ? parseInt(radPixelMatch[1]) : 0;
        if (radiusStr.includes('%') && parseInt(radiusStr) >= 50) radiusVal = 50;
 
        let shape = "Square";
        if (radiusVal > 0 && radiusVal < 15) shape = "Curved";
        if (radiusVal >= 15) shape = "Pill";
 
        // Some browsers return empty string for shorthand padding if individual sides differ
        let paddingStr = style.padding;
        if (!paddingStr || paddingStr === '0px' || paddingStr === '') {
          // FIX #12: Removed trailing space in template literal
          paddingStr = `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`.trim();
        }
        if (paddingStr === '0px 0px 0px 0px') paddingStr = '0px';
 
        const btnText = btn.innerText ? btn.innerText.trim() : "";
        let btnUrl = "";
        // FIX #5: getActualTextColor hoisted above forEach loop (was redefined on every iteration)
        const textColor = getActualTextColor(btn);

        if (btn.tagName.toLowerCase() === 'a' && btn.href) {
            btnUrl = btn.href;
        } else {
            const parentA = btn.closest('a');
            if (parentA && parentA.href) btnUrl = parentA.href;
        }
 
        buttonStyles.push({
          backgroundColor: style.backgroundColor,
          color: textColor,
          borderRadius: radiusStr,
          shape: shape,
          fontFamily: style.fontFamily,
          padding: paddingStr,
          textAlign: style.textAlign,
          text: btnText,
          url: btnUrl
        });
 
        if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          data.colors.buttons.push(style.backgroundColor);
        }
        if (style.color && style.color !== 'rgba(0, 0, 0, 0)') {
          data.colors.text.push(style.color);
        }
      });
      // Try to find primary buttons (with text)
      const validButtons = buttonStyles.filter(b => b.text && b.text.length > 2);
 
      const uniqueButtonsMap = new Map();
      validButtons.forEach(b => {
        if (!uniqueButtonsMap.has(b.backgroundColor)) {
          uniqueButtonsMap.set(b.backgroundColor, b);
        }
      });
      data.buttonStyles = Array.from(uniqueButtonsMap.values()).slice(0, 5);
      if (data.buttonStyles.length === 0 && buttonStyles.length > 0) {
        data.buttonStyles = [buttonStyles[0]];
      }
 
      const uniqueCtasMap = new Map();
      validButtons.forEach(b => {
        if (!/facebook|twitter|instagram|tiktok|linkedin|youtube|\bx\b/i.test(b.text)) {
            if (b.url && b.url.startsWith('http')) {
                const key = b.url.toLowerCase();
                if (!uniqueCtasMap.has(key)) {
                    uniqueCtasMap.set(key, {
                        button_name: b.text,
                        url: b.url,
                        context: "Website Main Button"
                    });
                }
            }
        }
      });
 
      // Also grab regular contextual links that aren't styled as buttons but might be CTAs
      document.querySelectorAll('a').forEach(a => {
          const text = a.innerText ? a.innerText.trim() : "";
          if (text && text.length > 2 && text.length < 30 && a.href && a.href.startsWith('http')) {
              if (/^(shop|learning|read|experience|buy|get|start|join|sign|subscribe|book|register|view|explore|discover|our)\b/i.test(text)) {
                   const key = a.href.toLowerCase();
                   if (!uniqueCtasMap.has(key)) {
                       uniqueCtasMap.set(key, {
                           button_name: text,
                           url: a.href,
                           context: "Website Text LinkCTA"
                       });
                   }
              }
          }
      });
 
      data.ctas = Array.from(uniqueCtasMap.values()).slice(0, 15);
 
      // Scrape explicitly applied background-images (like the NAB Hero Banners)
      document.querySelectorAll('div, section, header, figure').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.backgroundImage && style.backgroundImage !== 'none') {
          const match = style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
          if (match && match[1] && match[1].startsWith('http') && !match[1].includes('data:')) {
            data.images.unshift(match[1]); // Push hero banners to the front
          }
        }
      });
 
      const socials = [];
      const uniqueUrls = new Set();
      document.querySelectorAll('a[href*="facebook.com"], a[href*="twitter.com"], a[href*="x.com"], a[href*="instagram.com"], a[href*="linkedin.com"], a[href*="youtube.com"], a[href*="tiktok.com"]').forEach(a => {
        try {
          let urlObj = new URL(a.href.trim());
          urlObj.search = ''; // Strip query parameters like ?hl=en
          urlObj.hash = '';   // Strip anchor tags
 
          let normalizedUrl = urlObj.toString().toLowerCase();
          if (normalizedUrl.endsWith('/')) normalizedUrl = normalizedUrl.slice(0, -1);
          normalizedUrl = normalizedUrl.replace('://www.', '://');
 
          // Ignore generic sharing links
          if (normalizedUrl.includes('/share') || normalizedUrl.includes('/intent/')) return;
 
          if (!uniqueUrls.has(normalizedUrl)) {
            uniqueUrls.add(normalizedUrl);
            socials.push(normalizedUrl);
          }
        } catch (e) { }
      });
      data.socials = socials;
 
      // Grab Header background for app bar color
      const header = document.querySelector('header, nav, .header, .nav, .app-bar');
      if (header) {
        const headerStyle = window.getComputedStyle(header);
        data.colors.header = headerStyle.backgroundColor;
        data.colors.headerText = headerStyle.color;
      }
 
      return data;
    });
        break; // Break if successful
      } catch(e) {
          console.error(`❌ Complete DOM Extraction Failure! Fallback to 100% Visual Analysis Agent triggered. Cause: ${e.message}`);
          visualFallbackTriggered = true;
          let domainStr = "";
          try { domainStr = new URL(url).hostname; } catch(x) {}
 
          extractedData = {
             title: "Auto-Extracted Title",
             description: "",
             logo: "",
             domain: domainStr,
             images: [],
             colors: { background: ['#ffffff'], text: ['#000000'], buttons: [] },
             buttonStyles: [],
             ctas: [],
             socials: [],
             header: null,
             headerText: null
          };
          
          if (attempts === 2) {
             console.log(`⚠️ All retries failed. Using blank DOM object.`);
          } else {
             console.log(`⚠️ Retrying extracting DOM...`);
             await new Promise(r => setTimeout(r, 2000));
          }
      }
    }
 
    // --- Server-side debug: log what DOM extraction actually found ---
    console.log(`🧬 DOM result: logo='${extractedData.logo?.substring(0,80)}' images=${extractedData.images.length} socials=${extractedData.socials?.length}`);

    // SUPPLEMENTAL: If DOM image extraction found nothing, scrape raw HTML for img URLs
    if (extractedData.images.length === 0) {
      console.log(`🔎 DOM found 0 images. Attempting raw HTML image scrape...`);
      try {
        const rawHtml = await page.content().catch(() => '');
        if (rawHtml && rawHtml.length > 500) {
          const srcMatches = [];
          const srcRegexes = [
            /src=["']([^"']*?\.(?:jpg|jpeg|png|webp|gif)[^"']*?)["']/gi,
            /srcset=["']([^"']+)["']/gi,
            /data-src=["']([^"']*?\.(?:jpg|jpeg|png|webp|gif)[^"']*?)["']/gi,
          ];
          srcRegexes.forEach(rx => {
            let m;
            while ((m = rx.exec(rawHtml)) !== null) {
              const src = m[1].trim().split(' ')[0]; // handle srcset descriptor
              if (src.startsWith('http') || src.startsWith('//')) {
                const resolved = src.startsWith('//') ? 'https:' + src : src;
                const bad = ['onetrust','pixel','tracking','1x1','favicon','blank','placeholder'];
                if (!bad.some(p => resolved.toLowerCase().includes(p))) {
                  srcMatches.push(resolved);
                }
              }
            }
          });
          // Deduplicate and take the first 10
          const unique = [...new Set(srcMatches)].slice(0, 10);
          console.log(`🔎 Raw HTML scrape found ${unique.length} image URLs`);
          extractedData.images = unique;
        }
      } catch(e) {
        console.warn(`⚠️ Raw HTML image scrape failed: ${e.message}`);
      }
    }

    // --- Data Mapping & Aggregation ---
    // Find most common colors to represent the true brand colors
    const findMostFrequent = (arr) => {
      if (!arr || arr.length === 0) return null;
      const counts = arr.reduce((a, c) => (a[c] = (a[c] || 0) + 1, a), {});
      return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    };
 
    const primaryColor = rgbToHex(findMostFrequent(extractedData.colors.buttons)) || "#F99D32";
    const backgroundColor = rgbToHex(findMostFrequent(extractedData.colors.background)) || "#FFFFFF";
    const foregroundColor = rgbToHex(extractedData.colors.text[0]) || "#000000";
    const headerBgColor = rgbToHex(extractedData.colors.header) || backgroundColor;
    const headerFgColor = rgbToHex(extractedData.colors.headerText) || foregroundColor;
 
    // Guard against block/error pages polluting the campaign name
    const ERROR_TITLE_PATTERNS = /^(403|404|error|forbidden|access denied|blocked|just a moment|cloudflare|ddos|security check|verifying)/i;
    const rawExtractedTitle = extractedData.title || '';
    const sanitizedTitle = ERROR_TITLE_PATTERNS.test(rawExtractedTitle.trim())
      ? (new URL(url).hostname.replace('www.', '').split('.')[0].charAt(0).toUpperCase() + new URL(url).hostname.replace('www.', '').split('.')[0].slice(1))
      : rawExtractedTitle;

    const mappedFields = {
      brand: 5620,
      name: sanitizedTitle || "Website Campaign",
      department: "Marketing",
      campaign_type: 1,
      is_selling_item: false,
      background_type: "bgColor",
      background_color: backgroundColor,
      foreground_color: foregroundColor,
      icon_foreground_color_left: backgroundColor, // Usually buttons have inverted text color
      icon_background_color_left: primaryColor,
      icon_foreground_color_right: backgroundColor,
      icon_background_color_right: primaryColor,
      background_app_bar_color: headerBgColor,
      foreground_app_bar_color: headerFgColor,
      campaignTimeZone: "Africa/Porto-Novo",
      campaign_time_zone: "Africa/Porto-Novo",
      start_time: new Date().toISOString(),
      end_time: null,
      hashtags: "",
      add_discusion_group: true,
      contact_user_by_chat: true,
      display_as_list: true,
      display_in_search: false,
      qr_code_color: foregroundColor,
      campaign_description: `<h2 id="titleObj"><strong><span>${extractedData.title}</span></strong></h2><p>${extractedData.description}</p>`,
      multipleItems: false,
      image: extractedData.logo || (extractedData.images.length > 0 ? extractedData.images[0] : null),
      background_image: null,
      currency: 23,
      item_setup: {
        item_list_background_color: backgroundColor,
        item_list_font_color: foregroundColor,
        currency: 23,
        load_grid: false,
        allow_favourite_item: true
      },
      background_selected_color: "#000000",
      selling_item_details: {
        sales_orders: false,
        allow_comments_on_order: false,
        price_name_background_color: backgroundColor,
        price_name_font_color: foregroundColor,
        qty_font_color: foregroundColor,
        qty_price_background_color: backgroundColor,
        emails_on_order: "",
        review_order: false,
        inventory: false,
        emails_on_invoice_creation: "",
        export_to_system: "",
        hide_price: false,
        pos: "",
        payment_gateway: "",
        purchase_orders: false,
        mobile_app_purchase_creator: [],
        dine_in: true,
        table_service: false,
        counter_collection: true,
        pickup_take_away: false,
        delivery: true,
        order_number_prefix: "ORD",
        symphony_url: null
      },
      campaign_security_data: {
        password_protected: false,
        password: "",
        specific_user: false,
        admin_users: [],
        welcome_message: ""
      },
      is_country_region: false,
      countries_regions: {
        countries: [],
        regions: []
      },
      enable_ab_testing: false,
      direct_chat_campaign: false,
      ai_auto_response_enabled: false,
      user_can_edit: [],
      additional_creators: [],
      context_files: []
    };
 
    logStage('Capturing Hero Screenshot');
    // --- Screenshot Capture ---
    console.log(`📸 Taking full-page screenshot...`);
    const outputDir = path.join(__dirname, 'outputs');
    await fs.mkdir(outputDir, { recursive: true });
 
    const timestamp = new Date().getTime();
    const screenshotFilename = `screenshot_${timestamp}.jpg`;
    const screenshotPath = path.join(outputDir, screenshotFilename);
 
    // Calculate the absolute deepest scrolling content on the page (bypassing 100vh limits)
    // ⚠️ OOM GUARD: Render free tier has only 512MB RAM. fullPage screenshots of tall pages
    // (>1600px) render the entire page into a single in-memory buffer and will SIGKILL the process.
    // On production we cap height at 1600px and use a fixed-viewport screenshot (no fullPage:true).
    const IS_PRODUCTION = env.NODE_ENV === 'production' || !!env.RENDER_EXTERNAL_URL || !!process.env.RAILWAY_PUBLIC_DOMAIN;
    const MAX_SCREENSHOT_HEIGHT = IS_PRODUCTION ? 1600 : 3000;

    // Use a simple, fast height check — the full *-selector loop was hanging on complex sites
    const contentHeight = await Promise.race([
      page.evaluate(() => Math.min(Math.max(document.body.scrollHeight || 0, 800), 99999)),
      new Promise(resolve => setTimeout(() => resolve(1080), 5000)) // 5s max, fallback to 1080
    ]).catch(() => 1080);

    const cappedHeight = Math.min(contentHeight, MAX_SCREENSHOT_HEIGHT);
    console.log(`📐 Content height: ${Math.ceil(contentHeight)}px → capped to ${cappedHeight}px (production: ${IS_PRODUCTION})`);

 
    let screenshotSuccess = false;
    try {
      // Hard 30s timeout on the entire screenshot block — page.setViewport/page.screenshot
      // can stall indefinitely on complex or JS-heavy pages. Non-fatal: falls back to blank canvas.
      await Promise.race([
        (async () => {
          for (let attempts = 0; attempts < 2; attempts++) {
            try {
                await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
                await new Promise(r => setTimeout(r, 600));
                if (IS_PRODUCTION) {
                    await page.setViewport({ width: 1280, height: Math.min(Math.ceil(cappedHeight), 1600) });
                    await new Promise(r => setTimeout(r, 800));
                    await page.screenshot({ path: screenshotPath, fullPage: false, type: 'jpeg', quality: 75 });
                } else {
                    await page.setViewport({ width: 1280, height: 900 });
                    await new Promise(r => setTimeout(r, 800));
                    await page.screenshot({ path: screenshotPath, fullPage: true, type: 'jpeg', quality: 70 });
                }
                console.log(`🖼️ Screenshot saved locally to: ${screenshotPath}`);
                screenshotSuccess = true;
                break;
            } catch(err) {
                console.warn(`⚠️ Screenshot attempt ${attempts + 1} failed (${err.message}). Retrying...`);
                await new Promise(r => setTimeout(r, 2000));
            }
          }
        })(),
        new Promise(resolve => setTimeout(() => {
          console.warn('⏱️ Screenshot hard timeout (30s) — using blank canvas fallback');
          resolve();
        }, 30000))
      ]);
    } catch(screenshotErr) {
      console.warn(`⚠️ Screenshot block error: ${screenshotErr.message}`);
    }
 
    if (!screenshotSuccess) {
        console.error(`❌ Screenshot sequence completely failed after retries. Generating dummy blank canvas to prevent downstream crash.`);
        await require('sharp')({
          create: { width: 1280, height: 800, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
        }).jpeg().toFile(screenshotPath);
    }
 
    // Upload screenshot to Supabase (gets a public URL); falls back to absolute http:// URL
    const screenshotBuffer = await fs.readFile(screenshotPath);
    const screenshotPublicUrl = await uploadToSupabase(screenshotFilename, screenshotBuffer, 'image/jpeg');
 
    // --- Image Resizing using Sharp ---
    console.log(`🖼️ Resizing logo and images...`);
 
    // 100% Reliable Logo QA Process with cascading fallbacks
    // Use the actual page domain from the URL, not extractedData.domain (which can be a CDN/parent domain)
    const pageDomain = (() => { try { return new URL(url).hostname; } catch(e) { return extractedData.domain; } })();
    const BAD_LOGO_PATTERNS = ['onetrust', 'apple-touch-icon', 'pixel', 'gov.uk', 'tracking', 'analytics'];
    let finalLogoUrl = mappedFields.image;
    if (!finalLogoUrl || BAD_LOGO_PATTERNS.some(p => finalLogoUrl.includes(p))) {
      finalLogoUrl = `https://www.google.com/s2/favicons?domain=${pageDomain}&sz=256`;
      mappedFields.image = finalLogoUrl;
    }

    console.log(`🔍 Validated Primary Logo URL: ${finalLogoUrl} (pageDomain: ${pageDomain})`);
    let logoLocalPath = null;
    let logoPublicUrl = null;

    // Build prioritized list of logo sources to try (all using pageDomain not extractedData.domain)
    const logoSources = [finalLogoUrl];
    if (!finalLogoUrl.includes('google.com/s2/favicons')) {
      logoSources.push(`https://www.google.com/s2/favicons?domain=${pageDomain}&sz=256`);
    }
    logoSources.push(`https://logo.clearbit.com/${pageDomain}`);
    if (!pageDomain.startsWith('www.')) {
      logoSources.push(`https://www.google.com/s2/favicons?domain=www.${pageDomain}&sz=256`);
    }
 
    let logoFetched = false;
    for (const logoUrl of logoSources) {
      if (logoFetched) break;
      if (!logoUrl || !logoUrl.startsWith('http')) continue;
 
      try {
        console.log(`🔍 Trying logo source: ${logoUrl}`);
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 8000 });
 
        // Validate it's actually an image and not a tiny placeholder
        if (!response.data || response.data.length < 100) {
          console.log(`⚠️ Logo response too small (${response.data?.length || 0} bytes), trying next source...`);
          continue;
        }
 
        finalLogoUrl = logoUrl;
        mappedFields.image = finalLogoUrl;
        const logoFilename = `logo_256_${timestamp}.png`;
        logoLocalPath = path.join(outputDir, logoFilename);
        
        // 1. Initial Resize with transparency intact — resize to 232×232 to leave
        //    12px padding on each side, keeping the final output at 256×256
        let logoBuffer = await sharp(response.data)
          .resize(232, 232, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .extend({ top: 12, bottom: 12, left: 12, right: 12, background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .png()
          .toBuffer();
 
        // 2. Perform Mathematical Pixel Luminance Analysis
        const { data: rawPixels, info } = await sharp(logoBuffer).raw().toBuffer({ resolveWithObject: true });
        
        let totalLuminance = 0;
        let visiblePixels = 0;
 
        for (let i = 0; i < rawPixels.length; i += info.channels) {
            const r = rawPixels[i];
            const g = rawPixels[i+1];
            const b = rawPixels[i+2];
            const a = info.channels === 4 ? rawPixels[i+3] : 255;
 
            // Only measure pixels that are visible (opacity > ~10%)
            if (a > 25) { 
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                totalLuminance += luminance;
                visiblePixels++;
            }
        }
 
        const avgLuminance = visiblePixels > 0 ? (totalLuminance / visiblePixels) : 255;
        
        // 3. Fallback to White Canvas if Average Luminance drops below contrast threshold
        if (avgLuminance < 80) {
            console.log(`🌑 Dark Logo Detected (Luminance: ${Math.round(avgLuminance)}). Injecting White Backdrop.`);
            logoBuffer = await sharp(logoBuffer)
                .flatten({ background: { r: 255, g: 255, b: 255 } })
                .png()
                .toBuffer();
        } else {
            console.log(`☀️ Bright Logo Detected (Luminance: ${Math.round(avgLuminance)}). Preserving Transparency.`);
        }
 
        await fs.writeFile(logoLocalPath, logoBuffer);
        logoPublicUrl = await uploadToSupabase(logoFilename, logoBuffer, 'image/png');
        mappedFields.image = logoPublicUrl;
        logoFetched = true;
      } catch (e) {
        console.warn(`⚠️ Logo source failed (${logoUrl}): ${e.message}. Trying next...`);
      }
    }
    if (!logoFetched) {
      console.warn(`⚠️ All logo sources exhausted. Using Google favicon as final fallback.`);
      mappedFields.image = `https://www.google.com/s2/favicons?domain=${extractedData.domain}&sz=256`;
    }
 
    // FIX #8: Also filter out Wayback Machine archive proxy URLs from the image pool
    const availableImages = presetSelectedImages && presetSelectedImages.length > 0 
      ? presetSelectedImages.slice(0, 20) // prioritize user selections directly
      : extractedData.images.filter(src =>
          src &&
          src.startsWith('http') &&
          src !== mappedFields.image &&
          !src.includes('web.archive.org')
        );
    const downloadedImages = [];
 
    // --- Generate Prompts via Gemini ---
    console.log(`🤖 Requesting Gemini 1.5 Pro to write Image Prompts based on DNA...`);
    const prompts = await generateHeroPrompts(extractedData);
    if (!prompts) {
      console.warn(`⚠️ Warning: Gemini failed. Check API Key. Defaulting to generic aesthetic prompts.`);
    }
 
    const rawBrandName = mappedFields.name || 'this brand';
    // Double-guard: if name still looks like an error, fall back to domain name
    const cleanBrandName = ERROR_TITLE_PATTERNS.test(rawBrandName)
      ? (new URL(url).hostname.replace('www.', '').split('.')[0])
      : rawBrandName;
    const rawFirstWord = cleanBrandName.length > 18 ? cleanBrandName.split(/[\|\-\:]/)[0].trim().split(' ')[0] : cleanBrandName;
    const brandName = rawFirstWord.length >= 3 ? rawFirstWord : cleanBrandName.split(/[\|\-\:]/)[0].trim().split(' ').slice(0, 2).join(' ');
    console.log(`🏷️ Brand name resolved to: '${brandName}'`);
    const genericPremiumInstruction = "bright, inviting, premium commercial photography, cinematic lighting, 8k resolution, lifestyle product shot, NOT sci-fi, NOT moody.";
 
    const defaultPrompts = {
      cleanPromptA: `A pristine, breathtaking ${genericPremiumInstruction} ad background for ${brandName}. Bright and sunny. Elegant scene, no text natively.`,
      taglineA: `Discover ${brandName}`,
      cleanPromptB: `A bright, creative, energetic ${genericPremiumInstruction} hero image capturing the modern essence of ${brandName}. Purely visual, modern lifestyle.`,
      taglineB: `Experience ${brandName}`
    };
 
    const finalPrompts = prompts || defaultPrompts;
 
    const performMathematicalVisionAnalysis = async (buffer) => {
      // Because Vertex AI Gemini Vision is throwing 404 restricted access errors in this GCP project,
      // we implement mathematical "AI Thinking" using Sharp to analyze image entropy (contrast/detail).
      // We scan the TOP vs MIDDLE zones, calculating pixel variance to perfectly detect where the "product" isn't.
      try {
        const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
        const width = info.width;
 
        let topVariance = 0, midVariance = 0;
        // Analyze Top Zone (y: 50-180) using much larger strides for low-CPU environments
        for (let y = 50; y < 180; y += 10) {
          for (let x = 0; x < width; x += 20) {
            const idx = (y * width + x) * info.channels;
            topVariance += Math.abs(data[idx] - data[idx + info.channels]);
          }
        }
        // Analyze Middle Zone (y: 230-380)
        for (let y = 230; y < 380; y += 10) {
          for (let x = 0; x < width; x += 20) {
            const idx = (y * width + x) * info.channels;
            midVariance += Math.abs(data[idx] - data[idx + info.channels]);
          }
        }
 
        if (topVariance < midVariance * 0.8) return "TOP";
        if (midVariance < topVariance * 0.8) return "MIDDLE";
        return "TOP"; // Default to top if entropy is balanced
      } catch (e) {
        return "TOP";
      }
    };
 
    const overlayTextOnBuffer = async (buffer, tagline, zone = "TOP") => {
      if (!buffer || !tagline) return buffer;

      // --- Text fitting: enforce 620px max width (10px padding each side on 640px canvas) ---
      // Approximate character width for bold Arial at a given font size = fontSize * 0.6
      // We start at the desired size and scale DOWN until the longest line fits within 620px.
      const MAX_TEXT_WIDTH = 620;
      const CANVAS_W = 640;

      const words = tagline.split(' ');
      let lines = [];
      let curLine = words[0];
      for (let i = 1; i < words.length; i++) {
        if (curLine.length + words[i].length < 18) {
          curLine += " " + words[i];
        } else {
          lines.push(curLine);
          curLine = words[i];
        }
      }
      lines.push(curLine);

      // Start at desired font size, reduce until longest line fits within MAX_TEXT_WIDTH
      let fontSize = lines.length > 2 ? 46 : 58;
      const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), '');
      const charWidthRatio = 0.62; // empirical for bold Arial uppercase
      while (fontSize > 18 && longestLine.length * fontSize * charWidthRatio > MAX_TEXT_WIDTH) {
        fontSize -= 2;
      }
      const lineSpacing = fontSize * 1.25;

      let baseCenterY = 110; // 'TOP' shifted much higher to avoid product occlusion
      if (zone === "MIDDLE") baseCenterY = 280;
      if (zone === "LOWER_MIDDLE") baseCenterY = 400; // Leaves bottom 240px safe

      const startY = baseCenterY - ((lines.length - 1) * lineSpacing) / 2;

      // textLength clamps SVG rendering to MAX_TEXT_WIDTH so glyphs never bleed outside padding
      const textNodes = lines.map((line, index) => {
        const escapedLine = line.toUpperCase()
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const estimatedW = Math.min(line.length * fontSize * charWidthRatio, MAX_TEXT_WIDTH);
        return `<text x="${CANVAS_W / 2}" y="${startY + (index * lineSpacing)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${fontSize}" textLength="${estimatedW.toFixed(0)}" lengthAdjust="spacingAndGlyphs" fill="#ffffff" filter="url(#drop-shadow)">${escapedLine}</text>`;
      }).join('');

      const svgText = `<svg width="${CANVAS_W}" height="640" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="drop-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/>
          </filter>
        </defs>
        ${textNodes}
      </svg>`;

      try {
        return await sharp(buffer)
          .composite([{ input: Buffer.from(svgText), top: 0, left: 0 }])
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch (e) {
        console.error("Text composite failed", e);
        return buffer;
      }
    };
 
    const generateVariantPair = async (prompt, tagline, prefix) => {
      if (!prompt) return null;
      console.log(`🎨 Generating Base Image ${prefix}...`);
      
      const heroTimeout = new Promise((resolve) => setTimeout(() => {
        console.warn(`⏳ Vertex AI Image Generation timed out after 50 seconds. Force-aborting for ${prefix} to prevent UI hang.`);
        resolve(null);
      }, 50000));
      
      const rawBuffer = await Promise.race([
          generateBrandHero(prompt),
          heroTimeout
      ]);
      
      if (!rawBuffer) return null;
 
      // Save Clean
      const cleanBuffer = await sharp(rawBuffer).resize(640, 640, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
      const cleanFilename = `img_640_clean_${prefix}_${timestamp}.jpg`;
      await fs.writeFile(path.join(outputDir, cleanFilename), cleanBuffer);
      const cleanPublicUrl = await uploadToSupabase(cleanFilename, cleanBuffer, 'image/jpeg');
      downloadedImages.push(cleanPublicUrl);
      console.log(`✅ Saved clean_${prefix} to Supabase`);
 
      // Perform Vision Analysis to find safest text placement
      console.log(`👁️ Performing Mathematical 'AI' Vision Analysis to dodge products...`);
      const safeZone = await performMathematicalVisionAnalysis(cleanBuffer);
      console.log(`🎯 Vision recommended safest placement zone: ${safeZone}`);
 
      // Overlay Text and Save
      console.log(`✍️ Overlaying text '${tagline}'...`);
      const textBuffer = await overlayTextOnBuffer(cleanBuffer, tagline, safeZone);
      const textFilename = `img_640_text_${prefix}_${timestamp}.jpg`;
      await fs.writeFile(path.join(outputDir, textFilename), textBuffer);
      const textPublicUrl = await uploadToSupabase(textFilename, textBuffer, 'image/jpeg');
      downloadedImages.push(textPublicUrl);
      console.log(`✅ Saved text_${prefix} to Supabase`);
      return true;
    };
 
    // PRIMARY IMAGE STRATEGY: Always prefer scraped website images (real, relevant, reliable)
    // Vertex AI images are strictly a fallback when no usable site images exist
    
    // We first declare the fallback function in case the scraped image creation fails
    const createScrapedPair = async (imgUrl, tagline, prefix) => {
      try {
        let baseBuffer = null;
        let fetchError = null;

        try {
          const response = await axios.get(imgUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            maxContentLength: 15 * 1024 * 1024,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          if (response.data && response.data.length >= 1000) {
            baseBuffer = Buffer.from(response.data);
          }
        } catch(e) { fetchError = e.message; }

        if (!baseBuffer && page) {
           console.log(`⚠️ Axios failed for image (${fetchError}), trying "right-click save" via browser fetch...`);
           const base64Data = await page.evaluate(async (url) => {
              try {
                  const resp = await fetch(url);
                  const blob = await resp.blob();
                  return await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result.split(',')[1]);
                      reader.readAsDataURL(blob);
                  });
              } catch(e) { return null; }
           }, imgUrl).catch(() => null);

           if (base64Data) {
               baseBuffer = Buffer.from(base64Data, 'base64');
           } else {
               console.log(`⚠️ In-browser fetch failed, attempting to screen capture the specific image element directly...`);
               const elHandle = await page.evaluateHandle((url) => {
                   return Array.from(document.querySelectorAll('img, picture, div, section')).find(el => {
                       if (el.tagName.toLowerCase() === 'img' && el.src === url) return true;
                       if (el.tagName.toLowerCase() === 'img' && el.src && el.src.includes(url.split('/').pop())) return true;
                       if (el.style && el.style.backgroundImage && el.style.backgroundImage.includes(url)) return true;
                       const computed = window.getComputedStyle(el);
                       if (computed.backgroundImage && computed.backgroundImage.includes(url)) return true;
                       return false;
                   });
               }, imgUrl).catch(() => null);

               if (elHandle && elHandle.asElement()) {
                   try {
                       await page.evaluate(el => el.scrollIntoView({block: 'center', inline: 'center'}), elHandle);
                       await new Promise(r => setTimeout(r, 500));
                       baseBuffer = await elHandle.asElement().screenshot();
                       console.log(`✅ Individual screen capture of image element successful.`);
                   } catch(e) { console.warn(`Element screenshot failed: ${e.message}`); }
               }
           }
        }

        if (!baseBuffer) {
           throw new Error("Could not download or screen-capture image");
        }

        // Validate it's a real image (not HTML error page)
        const magic = baseBuffer.slice(0, 4);
        const isJpeg = magic[0] === 0xFF && magic[1] === 0xD8;
        const isPng  = magic[0] === 0x89 && magic[1] === 0x50;
        const isWebp = magic.toString('ascii', 0, 4) === 'RIFF';
        const isGif  = magic.toString('ascii', 0, 3) === 'GIF';
        if (!isJpeg && !isPng && !isWebp && !isGif) {
          console.warn(`⚠️ Not a valid image format: ${imgUrl}`);
          return false;
        }

        // Brightness check: reject near-black images (dark hero sections, etc.)
        // Sharp stats() calculates mean channel value 0-255; below 40 = too dark to use
        try {
          const stats = await sharp(baseBuffer).resize(64, 64).raw().toBuffer({ resolveWithObject: true });
          const pixelCount = stats.info.width * stats.info.height * stats.info.channels;
          const totalBrightness = stats.data.reduce((sum, val) => sum + val, 0);
          const avgBrightness = totalBrightness / pixelCount;
          const isPresetSelection = presetSelectedImages && presetSelectedImages.length > 0;
          if (avgBrightness < 40 && !isPresetSelection) {
            console.warn(`⚠️ Rejecting dark image (brightness=${avgBrightness.toFixed(1)}/255): ${imgUrl}`);
            return false;
          }
          console.log(`✅ Brightness OK (${avgBrightness.toFixed(1)}/255): ${imgUrl.split('/').pop()}`);
        } catch (brightnessErr) {
          console.warn(`⚠️ Brightness check failed, accepting image anyway:`, brightnessErr.message);
        }

        // Save Clean: crop to perfect 640x640 square (cover = no white bars)
        const cleanBuffer = await sharp(baseBuffer).resize(640, 640, { fit: 'cover', position: 'top' }).jpeg({ quality: 88 }).toBuffer();
        const cleanFilename = `img_640_clean_${prefix}_${timestamp}.jpg`;
        await fs.writeFile(path.join(outputDir, cleanFilename), cleanBuffer);
        const cleanPublicUrl = await uploadToSupabase(cleanFilename, cleanBuffer, 'image/jpeg');
        downloadedImages.push(cleanPublicUrl);
        console.log(`✅ Saved scraped clean_${prefix} (${Math.round(cleanBuffer.length / 1024)}KB)`);

        // Save Text version with vision-safe overlay
        const safeZone = await performMathematicalVisionAnalysis(cleanBuffer);
        const textBuffer = await overlayTextOnBuffer(cleanBuffer, tagline, safeZone);
        const textFilename = `img_640_text_${prefix}_${timestamp}.jpg`;
        await fs.writeFile(path.join(outputDir, textFilename), textBuffer);
        const textPublicUrl = await uploadToSupabase(textFilename, textBuffer, 'image/jpeg');
        downloadedImages.push(textPublicUrl);
        console.log(`✅ Saved scraped text_${prefix}`);
        return true;
      } catch (e) {
        console.warn(`⚠️ Scraped image pair failed (${prefix}): ${e.message}`);
        return false;
      }
    };

    logStage('Extracting Image Assets');
    console.log(`📥 Processing extracted images for ${url}`);
    let scrapedSuccessA = false;
    let scrapedSuccessB = false;

    if (availableImages.length > 0) {
      console.log(`🖼️ Building featured images from scraped website images (${availableImages.length} candidates)...`);

      // Probe ALL available candidates IN PARALLEL — much faster than sequential
      // (previously 5 sequential 8s-timeout probes = up to 40s; now all run simultaneously)
      const candidatePool = availableImages.slice(0, 20); // try up to 20 candidates
      console.log(`🔍 Running parallel brightness pre-screen on ${candidatePool.length} candidates...`);

      const probeResults = await Promise.allSettled(
        candidatePool.map(async (src) => {
          const probe = await axios.get(src, { responseType: 'arraybuffer', timeout: 8000, maxContentLength: 5 * 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0' } });
          const probeBuf = Buffer.from(probe.data);
          const stats = await sharp(probeBuf).resize(32, 32).raw().toBuffer({ resolveWithObject: true });
          const avg = stats.data.reduce((s, v) => s + v, 0) / (stats.info.width * stats.info.height * stats.info.channels);
          return { src, avg };
        })
      );

      // Collect all passing results, sorted by brightness (brightest first)
      // If the user manually selected preset images, skip the brightness filter!
      const isPreset = presetSelectedImages && presetSelectedImages.length > 0;
      const brightImages = probeResults
        .filter(r => r.status === 'fulfilled' && (isPreset || r.value.avg >= 40))
        .map(r => { console.log(`✅ Pre-screen passed (brightness=${r.value.avg.toFixed(0)}): ${r.value.src.split('/').pop()}`); return r.value.src; })
        .slice(0, 8); // keep up to 8 images (4 originals × 2 = 8 total outputs)

      probeResults.filter(r => r.status === 'rejected').forEach(r => console.warn(`⚠️ Pre-screen fetch failed: ${r.reason?.message}`));
      probeResults.filter(r => r.status === 'fulfilled' && r.value.avg < 40).forEach(r => console.warn(`⚠️ Pre-screen rejected dark image (brightness=${r.value.avg.toFixed(0)}): ${r.value.src.split('/').pop()}`));

      console.log(`🔍 Pre-screen complete: ${brightImages.length} bright images found from ${candidatePool.length} candidates`);
      if (brightImages.length === 0) console.log('⚠️ No bright scraped images found — falling back to gradient placeholder.');

      // Support up to 4 originals → 4 clean + 4 tagged = 8 total images
      const slotLabels = ['A', 'B', 'C', 'D'];
      const taglines   = [finalPrompts.taglineA, finalPrompts.taglineB, finalPrompts.taglineA, finalPrompts.taglineB];
      const scrapedTasks = brightImages.slice(0, 4).map((imgSrc, i) =>
        imgSrc ? createScrapedPair(imgSrc, taglines[i], slotLabels[i]) : Promise.resolve(false)
      );

      const scrapedResults = await Promise.allSettled(scrapedTasks);

      scrapedSuccessA = scrapedResults[0]?.status === 'fulfilled' && scrapedResults[0]?.value;
      scrapedSuccessB = scrapedResults[1]?.status === 'fulfilled' && scrapedResults[1]?.value;
      console.log(`🖼️ Scraped images: A=${scrapedSuccessA?'✅':'❌'} B=${scrapedSuccessB?'✅':'❌'} C=${scrapedResults[2]?.value?'✅':'❌'} D=${scrapedResults[3]?.value?'✅':'❌'}`);

    }

    // ----------------------------------------------------
    // VERTEX AI FALLBACK (Only run if scraped images failed)
    // ----------------------------------------------------
    if (!scrapedSuccessA || !scrapedSuccessB) {
      console.log(`🖼️ Generating missing variations via Vertex AI (A=${scrapedSuccessA ? 'SKIP' : 'RUN'}, B=${scrapedSuccessB ? 'SKIP' : 'RUN'})...`);

      const genTasks = [];
      if (!scrapedSuccessA) genTasks.push(generateVariantPair(finalPrompts.cleanPromptA, finalPrompts.taglineA, 'A'));
      if (!scrapedSuccessB) genTasks.push(generateVariantPair(finalPrompts.cleanPromptB, finalPrompts.taglineB, 'B'));
      
      const vertexResults = await Promise.allSettled(genTasks);

      // Per-slot gradient placeholder: if Vertex AI also failed for a slot,
      // generate a branded gradient so we always have a minimum of 2 image pairs.
      const vertexAFailed = !scrapedSuccessA && (vertexResults[0]?.status !== 'fulfilled' || !vertexResults[0]?.value);
      const vertexBFailed = !scrapedSuccessB && (!genTasks[!scrapedSuccessA ? 1 : 0] || vertexResults[!scrapedSuccessA && !scrapedSuccessB ? 1 : 0]?.status !== 'fulfilled');

      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 249, g: 157, b: 50 };
      };
      const rawBrandRgb = hexToRgb(primaryColor);
      const brandRgb = (rawBrandRgb.r + rawBrandRgb.g + rawBrandRgb.b < 60) ? { r: 30, g: 30, b: 60 } : rawBrandRgb;
      const darkerR = Math.max(0, brandRgb.r - 60);
      const darkerG = Math.max(0, brandRgb.g - 60);
      const darkerB = Math.max(0, brandRgb.b - 60);
      const gradientSvg = `<svg width="640" height="640" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgb(${brandRgb.r},${brandRgb.g},${brandRgb.b})"/><stop offset="100%" stop-color="rgb(${darkerR},${darkerG},${darkerB})"/></linearGradient></defs><rect width="640" height="640" fill="url(#bg)"/><rect width="640" height="640" fill="rgba(0,0,0,0.15)"/></svg>`;

      for (const [prefix, tagline, shouldGen] of [['A', finalPrompts.taglineA, vertexAFailed], ['B', finalPrompts.taglineB, vertexBFailed]]) {
        if (!shouldGen) continue;
        try {
          console.log(`⚠️ Vertex AI failed for ${prefix} — generating gradient placeholder...`);
          const cleanBuffer = await sharp(Buffer.from(gradientSvg)).resize(640, 640).jpeg({ quality: 85 }).toBuffer();
          const cleanFilename = `img_640_clean_${prefix}_${timestamp}.jpg`;
          await fs.writeFile(path.join(outputDir, cleanFilename), cleanBuffer);
          downloadedImages.push(await uploadToSupabase(cleanFilename, cleanBuffer, 'image/jpeg'));
          const textBuffer = await overlayTextOnBuffer(cleanBuffer, tagline, 'MIDDLE');
          const textFilename = `img_640_text_${prefix}_${timestamp}.jpg`;
          await fs.writeFile(path.join(outputDir, textFilename), textBuffer);
          downloadedImages.push(await uploadToSupabase(textFilename, textBuffer, 'image/jpeg'));
          console.log(`✅ Gradient placeholder generated for slot ${prefix}`);
        } catch(e) { console.error(`Gradient placeholder failed for ${prefix}:`, e.message); }
      }
    }

    // --- FINAL SAFETY NET: If we still have 0 images, generate branded gradient placeholders ---
    if (downloadedImages.length === 0) {
      console.log(`⚠️ ZERO images available after all fallbacks. Generating branded gradient placeholders...`);
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 249, g: 157, b: 50 };
      };
      // Ensure we always have a visible (non-black) base color
      const rawBrandRgb = hexToRgb(primaryColor);
      const brandRgb = (rawBrandRgb.r + rawBrandRgb.g + rawBrandRgb.b < 60)
        ? { r: 30, g: 30, b: 60 }   // near-black brand? use dark navy instead
        : rawBrandRgb;

      for (const [idx, tagline] of [finalPrompts.taglineA, finalPrompts.taglineB].entries()) {
        try {
          const prefix = idx === 0 ? 'A' : 'B';
          // Create a gradient placeholder via SVG composite so it's never a flat black square
          const darkerR = Math.max(0, brandRgb.r - 60);
          const darkerG = Math.max(0, brandRgb.g - 60);
          const darkerB = Math.max(0, brandRgb.b - 60);
          const gradientSvg = `<svg width="640" height="640" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="rgb(${brandRgb.r},${brandRgb.g},${brandRgb.b})"/>
                <stop offset="100%" stop-color="rgb(${darkerR},${darkerG},${darkerB})"/>
              </linearGradient>
            </defs>
            <rect width="640" height="640" fill="url(#bg)"/>
            <rect width="640" height="640" fill="rgba(0,0,0,0.15)"/>
          </svg>`;
          const cleanBuffer = await sharp(Buffer.from(gradientSvg))
            .resize(640, 640)
            .jpeg({ quality: 85 })
            .toBuffer();
          const cleanFilename = `img_640_clean_${prefix}_${timestamp}.jpg`;
          await fs.writeFile(path.join(outputDir, cleanFilename), cleanBuffer);
          const cleanPublicUrl = await uploadToSupabase(cleanFilename, cleanBuffer, 'image/jpeg');
          downloadedImages.push(cleanPublicUrl);

          // Overlay text
          const textBuffer = await overlayTextOnBuffer(cleanBuffer, tagline, 'MIDDLE');
          const textFilename = `img_640_text_${prefix}_${timestamp}.jpg`;
          await fs.writeFile(path.join(outputDir, textFilename), textBuffer);
          const textPublicUrl = await uploadToSupabase(textFilename, textBuffer, 'image/jpeg');
          downloadedImages.push(textPublicUrl);
        } catch(e) { console.error(`Placeholder generation failed for set ${idx}:`, e.message); }
      }
      console.log(`✅ Generated ${downloadedImages.length} branded gradient placeholder images.`);
    }
 
    // Deduplicate featuredImages by URL before returning (prevents duplicate cards in UI
    // when a fallback reused the same source image for both A and B variants)
    const uniqueFeaturedImages = [...new Set(downloadedImages.filter(Boolean))];

    const finalOutput = {
      mappedData: mappedFields,
      buttonStyles: extractedData.buttonStyles ? extractedData.buttonStyles.map(b => ({
        ...b,
        backgroundColorHex: rgbToHex(b.backgroundColor),
        colorHex: rgbToHex(b.color)
      })) : [],
      ctas: extractedData.ctas || [],
      socialMediaLinks: extractedData.socials,
      featuredImages: uniqueFeaturedImages,
      // Expose up to 7 raw website images so the user can pick from real site imagery
      rawExtractedImages: extractedData.images.slice(0, 40), // all scraped images for the Image Picker UI
      screenshotPath: screenshotPath,
      logoPath: logoLocalPath,
      screenshotUrl: screenshotPublicUrl,
      logoUrl: logoPublicUrl,
      isWaybackFallback: fallbackToWayback
    };
 
    return finalOutput;
 
  } catch (error) {
    console.error(`❌ Puppeteer Error: ${error.message}`);
    return { error: error.message };
  } finally {
    try {
      if (browser) {
        console.log("🔒 Closing browser...");
        await Promise.race([
          browser.close(),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        console.log("🔒 Browser closed.");
      }
    } catch (e) {
      console.error("Warning: Failed to gracefully close browser", e);
    }
  }
}
 
// Check if running directly via CLI
if (require.main === module) {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error("❌ Please provide a URL to extract. Example: node extractor.js https://minfo.com");
    process.exit(1);
  }
 
  extractDNA(targetUrl).then(data => {
    if (!data) {
      console.error("❌ Extraction failed.");
      process.exit(1);
    }
    console.log("\n✅ Extraction Complete - Mapped JSON Data:");
    console.log(JSON.stringify(data.mappedData, null, 2));
  });
}
 
module.exports = { extractDNA, scrapeYoutubeFallback };
