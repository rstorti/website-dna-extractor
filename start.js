'use strict';

// ── Global crash catchers ─────────────────────────────────────────────────────
// Catch ANY unhandled error or rejection so Railway logs show the exact cause
// instead of a silent 502. These fire AFTER the normal main() flow.
process.on('uncaughtException', (err, origin) => {
  console.error(`[CRASH] uncaughtException (${origin}):`, err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH] unhandledRejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const env = require('./config/env');
const { assertRuntimeReadiness } = require('./lib/runtimeGuards');
const { app, jobStore } = require('./server');
const { supabase } = require('./supabaseClient');

async function main() {
  console.log('[BOOT] Starting up...');
  console.log(`[BOOT] NODE_ENV: ${env.NODE_ENV}`);

  await assertRuntimeReadiness(env, () => ({ supabase }), console);
  const jobStoreInit = await jobStore.initialize();
  if (jobStoreInit.staleJobsReconciled > 0) {
    console.warn(`[BOOT] Marked ${jobStoreInit.staleJobsReconciled} stale job(s) as failed after restart.`);
  }

  app.listen(env.PORT, () => {
    console.log(`[BOOT] Server listening on port ${env.PORT}`);
    console.log(`[BOOT] Environment: ${env.NODE_ENV}`);
    console.log(`[BOOT] GEMINI_API_KEY: ${env.GEMINI_API_KEY ? 'SET' : 'MISSING'}`);
    console.log(`[BOOT] YOUTUBE_API_KEY: ${env.YOUTUBE_API_KEY ? 'SET' : 'not set (optional)'}`);
    console.log(`[BOOT] SUPABASE_URL: ${env.SUPABASE_URL ? 'SET' : 'not set'}`);
    console.log(`[BOOT] Durable jobs: ${jobStoreInit.durable ? 'enabled' : 'memory fallback only'}`);
    console.log('[BOOT] ✅ Ready to serve requests.');
  });
}

main().catch((error) => {
  console.error('[BOOT] Fatal startup error:', error);
  process.exit(1);
});
