require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');

const asBoolean = (value, fallback = false) => {
    if (value == null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).toLowerCase());
};

const required = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`CRITICAL: Environment variable ${name} is missing or empty. Please set it in .env or deployment secrets.`);
    }
    return value;
};

const optional = (name, fallback = null) => process.env[name] || fallback;

// On file-less platforms, accept GCP credentials as base64 and materialize them
// to a temp file for the Google SDKs.
(function bootstrapGcpCredentials() {
    const b64 = process.env.GCP_CREDENTIALS_JSON;
    if (!b64) return;

    try {
        const json = Buffer.from(b64, 'base64').toString('utf8');
        const tmpPath = path.join(os.tmpdir(), 'gcp-credentials.json');
        fs.writeFileSync(tmpPath, json, { encoding: 'utf8', mode: 0o600 });
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
        console.log(`[GCP] Credentials written to ${tmpPath} from GCP_CREDENTIALS_JSON.`);
    } catch (error) {
        console.error('[GCP] Failed to bootstrap credentials from GCP_CREDENTIALS_JSON:', error.message);
    }
})();

const youtubeKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY || null;

const env = {
    PORT: optional('PORT', '3001'),
    NODE_ENV: optional('NODE_ENV', 'development'),

    // Warn loudly but do NOT crash — lets the server start so Railway health checks pass.
    // Extraction endpoints will return 503 until this key is configured.
    GEMINI_API_KEY: (() => {
        const v = process.env.GEMINI_API_KEY;
        if (!v) {
            console.error('[STARTUP] ⚠️  GEMINI_API_KEY is missing. Set it in Railway Variables → Redeploy. Extraction will be disabled until resolved.');
        }
        return v || null;
    })(),

    YOUTUBE_API_KEY: youtubeKey,
    FIRECRAWLER_API_KEY: optional('FIRECRAWLER_API_KEY'),

    SUPABASE_URL: optional('SUPABASE_URL'),
    SUPABASE_ANON_KEY: optional('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: optional('SUPABASE_SERVICE_ROLE_KEY'),

    GCP_PROJECT_ID: optional('GCP_PROJECT_ID'),
    GCP_LOCATION: optional('GCP_LOCATION', 'us-central1'),
    GOOGLE_APPLICATION_CREDENTIALS: optional('GOOGLE_APPLICATION_CREDENTIALS'),
    GCP_CREDENTIALS_JSON: optional('GCP_CREDENTIALS_JSON'),
    ENABLE_IMAGE_GENERATION: asBoolean(optional('ENABLE_IMAGE_GENERATION'), false),

    PUPPETEER_EXECUTABLE_PATH: optional('PUPPETEER_EXECUTABLE_PATH'),
    RENDER_EXTERNAL_URL: optional('RENDER_EXTERNAL_URL'),
    NETWORK_EGRESS_LOCKDOWN_ACK: optional('NETWORK_EGRESS_LOCKDOWN_ACK'),
    REQUIRE_NETWORK_EGRESS_LOCKDOWN: asBoolean(optional('REQUIRE_NETWORK_EGRESS_LOCKDOWN'), false),

    DART_API_KEY: optional('DART_API_KEY'),
    HISTORY_API_KEY: optional('HISTORY_API_KEY'),
    JOB_API_KEY: optional('JOB_API_KEY'),
};

module.exports = env;
