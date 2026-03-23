const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || "https://missing.supabase.co";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "missing_key";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('⚠️ WARNING: Missing Supabase credentials in .env file or Render Secrets!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
