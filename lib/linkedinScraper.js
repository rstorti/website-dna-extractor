'use strict';

/**
 * linkedinScraper.js
 * Extracts public profile data from a LinkedIn URL using OGP/meta tags.
 *
 * LinkedIn heavily blocks bots, but public profiles expose:
 *   - og:image  → profile/company photo
 *   - og:title  → "Name - Headline | LinkedIn"
 *   - og:description → brief description (generic but parsed)
 *   - JSON-LD structured data (when available)
 *
 * This is a best-effort, non-fatal helper. It never throws — always returns
 * a result object with success:false on any failure.
 */

const axios = require('axios');
const { isAllowedUrl, safeHttpAgent, safeHttpsAgent } = require('./validateUrl');

/** Shared realistic browser headers for LinkedIn requests */
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
};

/**
 * Parse OGP and meta tags from raw HTML string.
 * Returns a flat object of tag values.
 */
function parseMetaTags(html) {
    const tags = {};

    // og: property tags
    const ogPattern = /<meta\s+(?:[^>]*?\s+)?property=["']og:([^"']+)["'][^>]*?content=["']([^"']*?)["'][^>]*?\/?>/gi;
    let m;
    while ((m = ogPattern.exec(html)) !== null) {
        const key = m[1].toLowerCase().replace(/-/g, '_');
        if (!tags[`og_${key}`]) tags[`og_${key}`] = decodeHtmlEntities(m[2]);
    }
    // Reverse order (some pages put content before property)
    const ogPatternRev = /<meta\s+(?:[^>]*?\s+)?content=["']([^"']*?)["'][^>]*?\s+property=["']og:([^"']+)["'][^>]*?\/?>/gi;
    while ((m = ogPatternRev.exec(html)) !== null) {
        const key = m[2].toLowerCase().replace(/-/g, '_');
        if (!tags[`og_${key}`]) tags[`og_${key}`] = decodeHtmlEntities(m[1]);
    }

    // Standard meta name tags
    const namePattern = /<meta\s+(?:[^>]*?\s+)?name=["']([^"']+)["'][^>]*?content=["']([^"']*?)["'][^>]*?\/?>/gi;
    while ((m = namePattern.exec(html)) !== null) {
        const key = m[1].toLowerCase().replace(/[: ]/g, '_');
        if (!tags[key]) tags[key] = decodeHtmlEntities(m[2]);
    }

    return tags;
}

/** Basic HTML entity decode for extracted strings */
function decodeHtmlEntities(str) {
    return (str || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

/**
 * Clean the og:title from LinkedIn boilerplate.
 * "Alice Smith - CEO at Acme | LinkedIn"  →  { name: "Alice Smith", headline: "CEO at Acme" }
 */
function parseLinkedinTitle(title = '') {
    // Strip " | LinkedIn" suffix
    const cleaned = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
    // Split on " - " (first occurrence)
    const dashIdx = cleaned.indexOf(' - ');
    if (dashIdx > 0) {
        return {
            name: cleaned.slice(0, dashIdx).trim(),
            headline: cleaned.slice(dashIdx + 3).trim(),
        };
    }
    return { name: cleaned, headline: '' };
}

function isLinkedinHost(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'linkedin.com' || host.endsWith('.linkedin.com');
    } catch {
        return false;
    }
}

async function validateLinkedinRequestUrl(url) {
    if (!isLinkedinHost(url)) {
        const err = new Error('LinkedIn URL must stay on linkedin.com');
        err.securityBlock = true;
        throw err;
    }
    const validation = await isAllowedUrl(url);
    if (!validation.ok) {
        const err = new Error(`SSRF Block: ${validation.reason}`);
        err.securityBlock = true;
        throw err;
    }
    return validation.url;
}

async function fetchLinkedinHtml(linkedinUrl) {
    let currentUrl = await validateLinkedinRequestUrl(linkedinUrl);

    for (let redirects = 0; redirects <= 5; redirects++) {
        const res = await axios.get(currentUrl, {
            headers: BROWSER_HEADERS,
            timeout: 15_000,
            maxRedirects: 0,
            httpAgent: safeHttpAgent,
            httpsAgent: safeHttpsAgent,
            validateStatus: (s) => s < 500,
        });

        if (res.status >= 300 && res.status < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, currentUrl).toString();
            currentUrl = await validateLinkedinRequestUrl(nextUrl);
            continue;
        }

        return res;
    }

    throw new Error('Too many LinkedIn redirects');
}

function makeSafePuppeteerRequestHandler() {
    return async (request) => {
        const rawUrl = request.url();
        try {
            if (!/^https?:\/\//i.test(rawUrl)) return request.abort();
            const validation = await isAllowedUrl(rawUrl);
            if (!validation.ok) return request.abort();
            return request.continue();
        } catch {
            return request.abort();
        }
    };
}

/**
 * Try to extract a meaningful description from og:description.
 * LinkedIn's og:description is usually generic boilerplate — skip it.
 * Instead look for JSON-LD or page-level structured data.
 */
function extractDescription(html, ogDescription) {
    // Try JSON-LD first
    const jsonLdMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of jsonLdMatches) {
        try {
            const obj = JSON.parse(match[1]);
            const items = Array.isArray(obj) ? obj : [obj];
            for (const item of items) {
                if (item.description && item.description.length > 30 && !item.description.includes('linkedin.com')) {
                    return item.description.slice(0, 500);
                }
                if (item.alternateName) return item.alternateName.slice(0, 500);
            }
        } catch (_) { /* skip malformed JSON-LD */ }
    }

    // Try data-x attribute patterns used in LI HTML
    const aboutMatch = html.match(/class="[^"]*top-card-layout__summary[^"]*"[^>]*>\s*([^<]{30,500})/i);
    if (aboutMatch) return aboutMatch[1].trim().slice(0, 500);

    // Fall back to og:description only if it's not the generic boilerplate
    if (ogDescription &&
        ogDescription.length > 30 &&
        !ogDescription.toLowerCase().includes("world's largest professional community") &&
        !ogDescription.toLowerCase().includes('view ') &&
        !ogDescription.toLowerCase().includes("linkedin's")) {
        return ogDescription.slice(0, 500);
    }

    return null;
}

/**
 * Main scraper function.
 *
 * @param {string} linkedinUrl  - Full LinkedIn profile or company page URL.
 * @returns {Promise<{success:boolean, avatarUrl?:string, name?:string, headline?:string, description?:string, error?:string}>}
 */
async function scrapeLinkedinProfile(linkedinUrl) {
    const tag = '[LinkedIn]';
    try {
        linkedinUrl = await validateLinkedinRequestUrl(linkedinUrl);
        console.log(`${tag} Fetching OGP data from ${linkedinUrl}`);

        let html = null;

        // Tier 1: Plain HTTPS fetch (fastest, no browser overhead)
        try {
            const res = await fetchLinkedinHtml(linkedinUrl);
            if (res.status === 200 && res.data && res.data.includes('og:')) {
                html = res.data;
                console.log(`${tag} Plain fetch succeeded (${html.length} chars)`);
            } else if (res.status === 999 || res.status === 429) {
                console.warn(`${tag} LinkedIn rate-limited (${res.status}) — trying Puppeteer fallback`);
            } else if (res.status === 200) {
                // Got a page but missing OGP — might be a login redirect
                html = res.data;
            }
        } catch (fetchErr) {
            if (fetchErr.securityBlock) throw fetchErr;
            console.warn(`${tag} Plain fetch failed: ${fetchErr.message}`);
        }

        // Tier 2: Puppeteer (if plain fetch failed or was blocked)
        if (!html || !html.includes('og:image')) {
            let browser = null;
            try {
                console.log(`${tag} Trying Puppeteer fallback...`);
                const puppeteer = require('puppeteer-extra');
                const StealthPlugin = require('puppeteer-extra-plugin-stealth');
                puppeteer.use(StealthPlugin());

                const args = [
                    '--no-sandbox', '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', '--disable-gpu',
                    '--disable-blink-features=AutomationControlled',
                ];
                const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
                browser = await puppeteer.launch({ headless: 'new', args, ...(execPath ? { executablePath: execPath } : {}) });
                const page = await browser.newPage();
                await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
                await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
                await page.setRequestInterception(true);
                page.on('request', makeSafePuppeteerRequestHandler());
                await page.goto(linkedinUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
                html = await page.content();
                console.log(`${tag} Puppeteer succeeded (${html.length} chars)`);
            } catch (puppErr) {
                console.warn(`${tag} Puppeteer fallback failed: ${puppErr.message}`);
            } finally {
                if (browser) {
                    await browser.close().catch(() => {});
                }
            }
        }

        if (!html) {
            return { success: false, error: 'Could not fetch LinkedIn page — it may require login or is blocking bots.' };
        }

        // Parse meta tags
        const tags = parseMetaTags(html);
        const rawImage = tags['og_image'] || tags['og_image_secure_url'] || null;
        const rawTitle = tags['og_title'] || '';
        const rawDesc  = tags['og_description'] || tags['description'] || '';

        // Validate that we got a real profile page (not a login redirect)
        const isLoginPage = html.includes('authwall') || html.includes('login?session_redirect') || html.includes('Join LinkedIn');
        if (isLoginPage && !rawImage) {
            return { success: false, error: 'LinkedIn requires login to view this profile. Public profile data is unavailable.' };
        }

        const { name, headline } = parseLinkedinTitle(rawTitle);
        const description = extractDescription(html, rawDesc);

        // Validate avatar URL — must look like a real CDN image
        const isValidAvatarUrl = (u) => {
            if (!u) return false;
            try {
                const parsed = new URL(u);
                const host = parsed.hostname.toLowerCase();
                const isLinkedinCdn = host === 'media.licdn.com' ||
                    host === 'static.licdn.com' ||
                    host === 'dms.licdn.com' ||
                    host.endsWith('.licdn.com') ||
                    host.startsWith('media-exp');
                return parsed.protocol === 'https:' && isLinkedinCdn && /\.(jpg|jpeg|png|webp)(?:$|[?#])/i.test(parsed.href);
            } catch {
                return false;
            }
        };

        const avatarUrl = isValidAvatarUrl(rawImage) ? rawImage : null;

        if (!name && !avatarUrl) {
            return { success: false, error: 'No usable data found — LinkedIn may be showing a login wall or the profile is private.' };
        }

        console.log(`${tag} ✅ Extracted: name="${name}", headline="${headline?.slice(0,60)}", avatar=${avatarUrl ? 'YES' : 'NO'}`);
        return {
            success: true,
            avatarUrl,
            name:        name        || null,
            headline:    headline    || null,
            description: description || headline || null,
            profileUrl:  linkedinUrl,
        };

    } catch (err) {
        console.error(`${tag} Unexpected error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

module.exports = { scrapeLinkedinProfile };
