'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('./config/env');

const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || null;
const supabase = (env.SUPABASE_URL && supabaseKey)
  ? createClient(env.SUPABASE_URL, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (!env.SUPABASE_URL || !supabaseKey) {
  console.warn('[SUPABASE] Credentials missing - durable history and job persistence are disabled.');
} else if (!env.SUPABASE_SERVICE_ROLE_KEY && env.NODE_ENV === 'production') {
  console.warn('[SUPABASE] Using SUPABASE_ANON_KEY in production. Prefer SUPABASE_SERVICE_ROLE_KEY for backend writes.');
}

module.exports = { supabase };
