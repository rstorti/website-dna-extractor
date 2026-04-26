'use strict';

/**
 * tests/smoke.js — Backend Import Smoke Test
 * ============================================
 * Verifies that all critical backend modules can be required without throwing.
 * This catches missing files, broken require() paths, and syntax errors
 * that would cause the server to crash at startup.
 *
 * Designed to run in CI with a stub GEMINI_API_KEY (no real credentials needed).
 * Does NOT start the server or make any network calls.
 *
 * Usage:
 *   node tests/smoke.js
 * Exit code 0 = all imports OK, 1 = one or more imports failed.
 */

const path = require('path');

// All modules that the production server imports at startup or on first request.
// If any of these files are missing or have a syntax error the test will fail.
const CRITICAL_MODULES = [
  '../server.js',            // Entry point — must load without executing (see guard below)
  '../extractor.js',
  '../dart_api.js',
  '../youtube_extractor.js',
  '../ai_verifier.js',
  '../gemini_prompter.js',
  '../supabaseClient.js',
  '../vertex_imagen.js',     // Previously missing from release ZIP — critical
  '../logger.js',
  '../config/env.js',
  '../lib/validateUrl.js',
  '../lib/schemaValidator.js',
];

// server.js calls app.listen() at module load time, which would block the test.
// We mock it out so the import check completes without binding a port.
const http = require('http');
const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function mockedListen(...args) {
  // Call the callback (last arg if function) so the server thinks it started
  const cb = args.find(a => typeof a === 'function');
  if (cb) cb();
  return this;
};

let passed = 0;
let failed = 0;
const errors = [];

for (const mod of CRITICAL_MODULES) {
  const absPath = path.resolve(__dirname, mod);
  try {
    require(absPath);
    console.log(`  ✅ ${mod}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${mod}`);
    console.error(`     ${err.message}`);
    errors.push({ module: mod, error: err.message });
    failed++;
  }
}

console.log('');
console.log(`Smoke test complete: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('');
  console.error('FAILED MODULES:');
  errors.forEach(e => console.error(`  • ${e.module}: ${e.error}`));
  process.exit(1);
}

process.exit(0);
