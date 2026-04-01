const { createClient } = require('@supabase/supabase-js');
const env = require('./config/env');

const supabaseUrl = env.SUPABASE_URL || "https://missing.supabase.co";
const supabaseKey = env.SUPABASE_ANON_KEY || "missing_key";

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.error('⚠️ WARNING: Missing Supabase credentials in Lovable Secrets!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
