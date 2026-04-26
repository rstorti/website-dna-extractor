'use strict';

const env = require('./config/env');
const { assertRuntimeReadiness } = require('./lib/runtimeGuards');
const { app, jobStore } = require('./server');
const { supabase } = require('./supabaseClient');

async function main() {
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
  });
}

main().catch((error) => {
  console.error('[BOOT] Fatal startup error:', error);
  process.exit(1);
});
