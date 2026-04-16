const { createClient } = require('@supabase/supabase-js');
const env = require('./config/env');

// Return null when credentials are absent rather than creating a broken client
// that throws cryptic network errors at runtime. All call-sites already guard
// on `if (supabase)`, so this is a safe, consistent change.
const supabase = (env.SUPABASE_URL && env.SUPABASE_ANON_KEY)
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.warn('⚠️ WARNING: Supabase credentials missing — extraction will use local file fallbacks only.');
}

module.exports = { supabase };
