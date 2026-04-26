/**
 * diag.js — Run locally to test Railway/Supabase connectivity
 * Usage: node diag.js
 * 
 * Tests:
 * 1. Railway health endpoint
 * 2. Supabase extraction_history table probe
 * 3. Supabase extraction_jobs table probe
 * 4. Login endpoint with JOB_API_KEY from .env
 */

'use strict';

require('dotenv').config();
const https = require('https');

const RAILWAY_URL = 'https://website-dna-extractor-production.up.railway.app';

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function probeSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { error: 'SUPABASE_URL or key not set in .env' };

  const results = {};
  for (const table of ['extraction_history', 'extraction_jobs']) {
    await new Promise((resolve, reject) => {
      const u = new URL(`${url}/rest/v1/${table}?select=*&limit=1`);
      const opts = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'count=exact',
        }
      };
      https.get(opts, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            results[table] = { status: res.statusCode, body: parsed };
          } catch {
            results[table] = { status: res.statusCode, body };
          }
          resolve();
        });
      }).on('error', (e) => { results[table] = { error: e.message }; resolve(); });
    });
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('WEBSITE DNA EXTRACTOR — BOOT DIAGNOSTICS');
  console.log('='.repeat(60));

  // 1. Railway health
  console.log('\n[1] Railway health check...');
  try {
    const r = await httpGet(`${RAILWAY_URL}/api/health`);
    console.log(`  Status: HTTP ${r.status}`);
    console.log(`  Body:`, JSON.stringify(r.body, null, 2));
  } catch (e) {
    console.log(`  ❌ Network error: ${e.message}`);
  }

  // 2. Supabase direct REST probe
  console.log('\n[2] Supabase direct REST probe (bypasses Railway)...');
  const sbResult = await probeSupabase();
  console.log('  extraction_history:', JSON.stringify(sbResult.extraction_history, null, 4));
  console.log('  extraction_jobs:   ', JSON.stringify(sbResult.extraction_jobs, null, 4));

  // 3. Login test
  console.log('\n[3] Login endpoint test...');
  const key = process.env.JOB_API_KEY;
  if (!key) {
    console.log('  ⚠️  JOB_API_KEY not in .env — skipping login test');
  } else {
    try {
      const r = await httpPost(`${RAILWAY_URL}/api/auth/login`, { password: key, tenantId: 'default' });
      console.log(`  Status: HTTP ${r.status}`);
      console.log(`  Body:`, JSON.stringify(r.body, null, 2));
    } catch (e) {
      console.log(`  ❌ Network error: ${e.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
}

main().catch(console.error);
