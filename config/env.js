require('dotenv').config();

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
    SUPABASE_URL: required('SUPABASE_URL'),
    SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),

    // GCP & Vertex (used for feature image emulation, etc.)
    GCP_PROJECT_ID: optional('GCP_PROJECT_ID'),
    GCP_LOCATION: optional('GCP_LOCATION', 'us-central1'),
    GOOGLE_APPLICATION_CREDENTIALS: optional('GOOGLE_APPLICATION_CREDENTIALS'),

    // Infrastructure
    PUPPETEER_EXECUTABLE_PATH: optional('PUPPETEER_EXECUTABLE_PATH'),
};

module.exports = env;
