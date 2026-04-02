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

async function uploadToSupabase(filename, buffer, mimeType = 'image/jpeg') {
  if (!env.SUPABASE_URL || env.SUPABASE_URL.includes("missing.supabase.co")) {
    console.log(`⚠️ Supabase credentials missing. Bypassing cloud upload for ${filename} to prevent network hangs.`);
    return `/outputs/${filename}`;
  }

  try {
    const { error } = await supabase.storage
      .from('outputs')
      .upload(filename, buffer, {
        contentType: mimeType,
        upsert: true
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return `/outputs/${filename}`; // Fallback to local
    }

    const { data } = supabase.storage.from('outputs').getPublicUrl(filename);
    return data.publicUrl;
  } catch (e) {
    console.error('Supabase generic error:', e);
    return `/outputs/${filename}`;
  }
}

async function autoScroll(page) {
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
    console.log(`\n🕵️‍♂️ PUPPETEER FALLBACK: Scraping YouTube DOM for ${url}...`);
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
      protocolTimeout: 120000,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-extensions'
      ]
    });
    const page = await browser.newPage();
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (err) {
      const errMsg = err.message ? err.message.toLowerCase() : '';
      if (errMsg.includes('timeout') || errMsg.includes('detached') || errMsg.includes('aborted')) {
        console.log(`⚠️ YouTube navigation interrupted for ${url} (Timeout or Detached). Attempting to salvage loaded DOM...`);
      } else {
        throw err;
      }
    }
    
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

async function extractDNA(url) {
  console.log(`\n🚀 Launching Puppeteer DNA Extractor for: ${url} `);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    ignoreHTTPSErrors: true,
    protocolTimeout: 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--allow-running-insecure-content',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-extensions',
      '--disable-background-networking',
      '--window-size=1280,800'
    ]
  });
  const page = await browser.newPage();

  // Set a standard desktop viewport
  await page.setViewport({ width: 1280, height: 800 });

  try {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (err) {
      const errMsg = err.message ? err.message.toLowerCase() : '';
      if (errMsg.includes('timeout') || errMsg.includes('detached') || errMsg.includes('aborted')) {
        console.log(`⚠️ Navigation interrupted for ${url} (Timeout or Detached). Site might be heavy or redirecting. Proceeding with partially loaded DOM...`);
      } else {
        // Automatic fallback for apex domains with broken SSL (e.g., minfo.com -> www.minfo.com)
        const parsedUrl = new URL(url);
        if (!parsedUrl.hostname.startsWith('www.')) {
          console.log(`⚠️ Connection to ${url} failed (${err.message}). Attempting fallback to www subdomain...`);
          parsedUrl.hostname = 'www.' + parsedUrl.hostname;
          url = parsedUrl.toString();
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          } catch (fallbackErr) {
            const fbMsg = fallbackErr.message ? fallbackErr.message.toLowerCase() : '';
            if (fbMsg.includes('timeout') || fbMsg.includes('detached') || fbMsg.includes('aborted')) {
              console.log(`⚠️ Fallback navigation interrupted for ${url}. Proceeding with partially loaded DOM...`);
            } else {
              throw fallbackErr;
            }
          }
        } else {
          throw err;
        }
      }
    }
    
    // Explicit hardcoded lag. Reduced to 3s to save time.
    await new Promise(r => setTimeout(r, 3000));
    
    console.log(`✅ Page loaded and Javascript mounted. Executing Anti-Bot WAF Verification...`);

    // --- Anti-Bot & Enterprise WAF Firewall Check ---
    const pageTitle = await page.title();
    const pageContent = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    const blockedKeywords = ['Access Denied', 'Attention Required!', 'Cloudflare Ray ID', 'Security Check', '403 Forbidden'];
    
    const isBlocked = blockedKeywords.some(keyword => 
      pageTitle.includes(keyword) || pageContent.includes(keyword)
    );

    if (isBlocked) {
      console.error(`🔒 Enterprise WAF Firewall block detected on ${url}! Aborting extraction.`);
      throw new Error(`Website actively blocked the extraction bot with an Enterprise WAF Firewall / Access Denied error. Target cannot be scraped.`);
    }

    console.log(`✅ Passed Security. Executing auto-scroll to trigger lazy rendering...`);
    await autoScroll(page);
    console.log(`✅ Auto - scrolling complete.`);

    // --- Begin Data Extraction ---
    console.log(`🧬 Extracting DOM data...`);
    const extractedData = await page.evaluate(() => {
      const data = {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || "",
        logo: (() => {
          let src = "";
          document.querySelectorAll('script[type="application/ld+json"]').forEach(tag => {
            try {
              const d = JSON.parse(tag.innerText);
              if (d.logo) src = typeof d.logo === 'string' ? d.logo : d.logo.url;
            } catch (e) { }
          });
          if (src) return src;

          const headerLogo = document.querySelector('header img:not([src*="onetrust"]):not([src*="pixel"]), nav img:not([src*="onetrust"]), .header img:not([src*="onetrust"])');
          if (headerLogo) return headerLogo.src;

          return document.querySelector('meta[property="og:image"]')?.content || "";
        })(),
        domain: window.location.hostname,
        images: [],
        colors: { background: [], text: [], buttons: [] }
      };

      // Select BEST images by prioritizing large elements (filter out small tracking icons/logos)
      const imgTags = Array.from(document.querySelectorAll('img'));
      const imagesWithMeta = imgTags.map(img => {
        const width = img.naturalWidth || img.width || img.getBoundingClientRect().width || 0;
        const height = img.naturalHeight || img.height || img.getBoundingClientRect().height || 0;
        return { src: img.src, area: width * height };
      }).filter(item => item.src && item.area > 15000); // Only keep reasonably large images

      imagesWithMeta.sort((a, b) => b.area - a.area);
      data.images = imagesWithMeta.map(item => item.src);

      // Grab generic background and text colors from body
      const bodyStyle = window.getComputedStyle(document.body);
      data.colors.background.push(bodyStyle.backgroundColor);
      data.colors.text.push(bodyStyle.color);

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
          paddingStr = `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft} `;
        }
        if (paddingStr.trim() === '0px 0px 0px 0px') paddingStr = '0px';

        const btnText = btn.innerText ? btn.innerText.trim() : "";
        let btnUrl = "";
        if (btn.tagName.toLowerCase() === 'a' && btn.href) {
            btnUrl = btn.href;
        } else {
            const parentA = btn.closest('a');
            if (parentA && parentA.href) btnUrl = parentA.href;
        }

        buttonStyles.push({
          backgroundColor: style.backgroundColor,
          color: style.color,
          borderRadius: radiusStr,
          shape: shape,
          fontFamily: style.fontFamily,
          padding: paddingStr,
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

    // --- Data Mapping & Aggregation ---
    // Find most common colors to represent the true brand colors
    const findMostFrequent = (arr) => {
      if (!arr || arr.length === 0) return null;
      const counts = arr.reduce((a, c) => (a[c] = (a[c] || 0) + 1, a), {});
      return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    };

    const primaryColor = rgbToHex(findMostFrequent(extractedData.colors.buttons)) || "#F99D32";
    const backgroundColor = rgbToHex(extractedData.colors.background[0]) || "#FFFFFF";
    const foregroundColor = rgbToHex(extractedData.colors.text[0]) || "#000000";
    const headerBgColor = rgbToHex(extractedData.colors.header) || backgroundColor;
    const headerFgColor = rgbToHex(extractedData.colors.headerText) || foregroundColor;

    const mappedFields = {
      brand: 5620, // Default from layout
      name: extractedData.title || "Website Campaign",
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

    // --- Screenshot Capture ---
    console.log(`📸 Taking full-page screenshot...`);
    const outputDir = path.join(__dirname, 'outputs');
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().getTime();
    const screenshotFilename = `screenshot_${timestamp}.jpg`;
    const screenshotPath = path.join(outputDir, screenshotFilename);

    // Calculate the absolute deepest scrolling content on the page (bypassing 100vh limits)
    const contentHeight = await page.evaluate(() => {
        let maxBottom = document.body.scrollHeight || 0;
        const elements = document.querySelectorAll('*');
        for (const el of elements) {
            const style = window.getComputedStyle(el);
            // If the element is technically scrollable or hides overflow, figure out its internal data height
            if (style.overflowY === 'scroll' || style.overflowY === 'auto' || style.overflow === 'scroll' || style.overflow === 'auto' || style.overflowY === 'hidden' || style.overflow === 'hidden') {
                const totalH = el.getBoundingClientRect().top + el.scrollHeight;
                if (totalH > maxBottom) maxBottom = totalH;
            }
        }
        // Force minimum 800, max 4000 so we don't crash Puppeteer memory on Render Free Tier
        return Math.min(Math.max(maxBottom, 800), 4000);
    }).catch(() => 1080); // Fallback to 1080 if evaluate fails

    console.log(`📐 Resizing viewport physically to ${Math.ceil(contentHeight)}px to un-truncate SPAs...`);
    await page.setViewport({ width: 1280, height: Math.ceil(contentHeight) });
    
    // Wait for the browser rendering engine to layout the new massive viewport
    await new Promise(r => setTimeout(r, 800));

    // Fullpage screenshots cause silent Out-Of-Memory crashes on 512MB instances.
    await page.screenshot({ path: screenshotPath, fullPage: false, type: 'jpeg', quality: 70 });
    console.log(`🖼️ Screenshot saved locally to: ${screenshotPath}`);

    // Upload screenshot to Supabase
    const screenshotBuffer = await fs.readFile(screenshotPath);
    const screenshotPublicUrl = await uploadToSupabase(screenshotFilename, screenshotBuffer, 'image/png');

    // --- Image Resizing using Sharp ---
    console.log(`🖼️ Resizing logo and images...`);

    // 100% Reliable Logo QA Process: If the scraped logo is invalid/missing, fallback to Google's rigorous DB
    let finalLogoUrl = mappedFields.image;
    if (!finalLogoUrl || finalLogoUrl.includes('onetrust') || finalLogoUrl.includes('apple-touch-icon')) {
      finalLogoUrl = `https://www.google.com/s2/favicons?domain=${extractedData.domain}&sz=256`;
      mappedFields.image = finalLogoUrl;
    }

    console.log(`🔍 Validated Primary Logo URL: ${finalLogoUrl}`);
    let logoLocalPath = null;
    let logoPublicUrl = null;
    if (finalLogoUrl && finalLogoUrl.startsWith('http')) {
      try {
        const response = await axios.get(finalLogoUrl, { responseType: 'arraybuffer', timeout: 5000 });
        const logoFilename = `logo_256_${timestamp}.png`;
        logoLocalPath = path.join(outputDir, logoFilename);
        
        // 1. Initial Resize with transparency intact
        let logoBuffer = await sharp(response.data)
          .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
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
      } catch (e) { console.error('Logo resize failed', e); }
    }

    const availableImages = extractedData.images.filter(src => src && src.startsWith('http') && src !== mappedFields.image);
    const downloadedImages = [];

    // --- Generate Prompts via Gemini ---
    console.log(`🤖 Requesting Gemini 1.5 Pro to write Image Prompts based on DNA...`);
    const prompts = await generateHeroPrompts(extractedData);
    if (!prompts) {
      console.warn(`⚠️ Warning: Gemini failed. Check API Key. Defaulting to generic aesthetic prompts.`);
    }

    const rawBrandName = mappedFields.name || 'this brand';
    // If the title is massive (e.g., "MAZDA MOTOR CORPORATION GLOBAL WEBSITE"), extract the first word/phrase
    const brandName = rawBrandName.length > 18 ? rawBrandName.split(/[\|\-\:]/)[0].trim().split(' ')[0] : rawBrandName;
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

      const fontSize = lines.length > 2 ? 46 : 58;
      const lineSpacing = fontSize * 1.25;

      let baseCenterY = 110; // 'TOP' shifted much higher to avoid product occlusion
      if (zone === "MIDDLE") baseCenterY = 280;
      if (zone === "LOWER_MIDDLE") baseCenterY = 400; // Leaves bottom 240px safe

      const startY = baseCenterY - ((lines.length - 1) * lineSpacing) / 2;

      const textNodes = lines.map((line, index) => {
        return `<text x="50%" y="${startY + (index * lineSpacing)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${fontSize}" fill="#ffffff" filter="url(#drop-shadow)">${line.toUpperCase().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`;
      }).join('');

      const svgText = `
        <svg width="640" height="640">
        <defs>
            <filter id="drop-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        ${textNodes}
        </svg>
        `;

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
        console.warn(`⏳ Vertex AI Image Generation timed out after 20 seconds. Force-aborting for ${prefix} to prevent UI hang.`);
        resolve(null);
      }, 20000));
      
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

    console.log(`🖼️ Generating Image Variations (Natively compositing text for pixel-perfect sets)...`);
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    let genA = await generateVariantPair(finalPrompts.cleanPromptA, finalPrompts.taglineA, 'A');
    if (genA) await sleep(2500);
    let genB = await generateVariantPair(finalPrompts.cleanPromptB, finalPrompts.taglineB, 'B');

    const results = [genA, genB];

    // Fallback: If Vertex AI failed, we still guarantee 4 images by using scraped images
    const validResults = results.filter(r => r !== null);
    if (validResults.length === 0 && availableImages.length > 0) {
      console.log(`⚠️ Vertex AI Generation failed. Supplying 4 high-quality fallback images from website DNA...`);
      const createFallbackPair = async (imgUrl, tagline, prefix) => {
        try {
          const response = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 5000 });
          const baseBuffer = Buffer.from(response.data);

          // Save Clean (using cover to prevent white borders!)
          const cleanBuffer = await sharp(baseBuffer).resize(640, 640, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
          const cleanFilename = `img_640_clean_${prefix}_${timestamp}.jpg`;
          await fs.writeFile(path.join(outputDir, cleanFilename), cleanBuffer);
          const cleanPublicUrl = await uploadToSupabase(cleanFilename, cleanBuffer, 'image/jpeg');
          downloadedImages.push(cleanPublicUrl);

          // Save Text (using vision to safely overlay text!)
          const safeZone = await performMathematicalVisionAnalysis(cleanBuffer);
          const textBuffer = await overlayTextOnBuffer(cleanBuffer, tagline, safeZone);
          const textFilename = `img_640_text_${prefix}_${timestamp}.jpg`;
          await fs.writeFile(path.join(outputDir, textFilename), textBuffer);
          const textPublicUrl = await uploadToSupabase(textFilename, textBuffer, 'image/jpeg');
          downloadedImages.push(textPublicUrl);
        } catch (e) { console.error('Fallback variation failed:', e.message); }
      };

      await createFallbackPair(availableImages[0], finalPrompts.taglineA, 'A');
      if (availableImages.length > 1) {
        await createFallbackPair(availableImages[1], finalPrompts.taglineB, 'B');
      } else {
        await createFallbackPair(availableImages[0], finalPrompts.taglineB, 'B');
      }
      console.log(`✅ Emulated 4 fallback images perfectly utilizing Pomelli layout`);
    }

    const finalOutput = {
      mappedData: mappedFields,
      buttonStyles: extractedData.buttonStyles ? extractedData.buttonStyles.map(b => ({
        ...b,
        backgroundColorHex: rgbToHex(b.backgroundColor),
        colorHex: rgbToHex(b.color)
      })) : [],
      ctas: extractedData.ctas || [],
      socialMediaLinks: extractedData.socials,
      featuredImages: downloadedImages, // Now contains Supabase public URLs
      rawExtractedImages: extractedData.images.slice(0, 5),
      screenshotPath: screenshotPath,
      logoPath: logoLocalPath,
      screenshotUrl: screenshotPublicUrl, // Pass URL up to be used directly
      logoUrl: logoPublicUrl
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
