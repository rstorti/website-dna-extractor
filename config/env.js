require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');

const required = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`CRITICAL: Environment variable ${name} is missing or empty. Please set it in .env or Lovable Secrets.`);
    }
    return value;
};

const optional = (name, fallback = null) => {
    return process.env[name] || fallback;
};

// ─── GCP Credentials Bootstrap ────────────────────────────────────────────────
// On Render (and similar PaaS), there is no filesystem to store the service
// account JSON. Instead we store the file contents as a Base64 env var called
// GCP_CREDENTIALS_JSON and decode it to /tmp at startup.
// This is the standard deployment pattern for GCP on file-less platforms.
(function bootstrapGcpCredentials() {
    const b64 = process.env.GCP_CREDENTIALS_JSON;
    if (!b64) return; // local dev: rely on the file path in GOOGLE_APPLICATION_CREDENTIALS

    try {
        const json = Buffer.from(b64, 'base64').toString('utf8');
        const tmpPath = path.join(os.tmpdir(), 'gcp-credentials.json');
        fs.writeFileSync(tmpPath, json, { encoding: 'utf8' });
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
        console.log(`[GCP] Credentials written to ${tmpPath} from GCP_CREDENTIALS_JSON env var.`);
    } catch (e) {
        console.error('[GCP] Failed to bootstrap credentials from GCP_CREDENTIALS_JSON:', e.message);
    }
})();
// ──────────────────────────────────────────────────────────────────────────────

// Check for YouTube API Keys specifically to support legacy mapping (VITE_)
const youtubeKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY || null;

const env = {
    // Port Selection
    PORT: optional('PORT', '3001'),
    NODE_ENV: optional('NODE_ENV', 'development'),

    // AI Providers
    GEMINI_API_KEY: required('GEMINI_API_KEY'),
    
    // External APIs
    YOUTUBE_API_KEY: youtubeKey,
    FIRECRAWLER_API_KEY: optional('FIRECRAWLER_API_KEY'),

    // Supabase
    SUPABASE_URL: optional('SUPABASE_URL'),
    SUPABASE_ANON_KEY: optional('SUPABASE_ANON_KEY'),

    // GCP & Vertex (used for Imagen 3 image generation)
    GCP_PROJECT_ID: optional('GCP_PROJECT_ID'),
    GCP_LOCATION: optional('GCP_LOCATION', 'us-central1'),
    GOOGLE_APPLICATION_CREDENTIALS: optional('GOOGLE_APPLICATION_CREDENTIALS'),

    // Infrastructure
    PUPPETEER_EXECUTABLE_PATH: optional('PUPPETEER_EXECUTABLE_PATH'),

    // Render.com deployment — used by extractor.js to build absolute public URLs
    RENDER_EXTERNAL_URL: optional('RENDER_EXTERNAL_URL'),
};

module.exports = env;

