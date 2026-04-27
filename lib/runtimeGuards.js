'use strict';

const { JOB_TABLE } = require('./jobStore');

function getMissingEnvVars(env) {
  const missing = [];
  const requireVar = (name, enabled = true) => {
    if (enabled && !env[name]) {
      missing.push(name);
    }
  };

  requireVar('GEMINI_API_KEY');

  if (env.NODE_ENV === 'production') {
    requireVar('JOB_API_KEY');
    requireVar('HISTORY_API_KEY');
    requireVar('DART_API_KEY');
    requireVar('SUPABASE_URL');
    requireVar('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (env.ENABLE_IMAGE_GENERATION) {
    requireVar('GCP_PROJECT_ID');
    requireVar('GOOGLE_APPLICATION_CREDENTIALS', !env.GCP_CREDENTIALS_JSON);
    requireVar('GCP_CREDENTIALS_JSON', !env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  return missing;
}

// Helper: serialise a Supabase PostgREST error into a readable string
function formatSupabaseError(err) {
  if (!err) return '(no error)';
  const parts = [];
  if (err.code)    parts.push(`code=${err.code}`);
  if (err.message) parts.push(`message="${err.message}"`);
  if (err.details) parts.push(`details="${err.details}"`);
  if (err.hint)    parts.push(`hint="${err.hint}"`);
  return parts.length ? parts.join(', ') : JSON.stringify(err);
}

async function assertRuntimeReadiness(env, getSupabase, logger = console) {
  const missing = getMissingEnvVars(env);
  if (missing.length > 0) {
    logger.warn(`[BOOT] ⚠️  Missing env vars: ${missing.join(', ')}. Starting in DEGRADED mode — affected features will return 503 until set in Railway Variables.`);
    return { schemaChecked: false, durableJobs: false, degraded: true, missing };
  }

  if (env.NODE_ENV !== 'production') {
    return { schemaChecked: false, durableJobs: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) };
  }

  const { supabase } = getSupabase();
  if (!supabase) {
    throw new Error('Refusing to start: Supabase client is unavailable in production.');
  }

  logger.log('[BOOT] Probing Supabase schema — extraction_history + extraction_jobs ...');

  const [historyProbe, jobsProbe] = await Promise.all([
    supabase.from('extraction_history').select('tenant_id', { head: true, count: 'exact' }).limit(1),
    supabase.from(JOB_TABLE).select('job_id', { head: true, count: 'exact' }).limit(1),
  ]);

  logger.log('[BOOT] extraction_history probe:', historyProbe.error ? `FAIL — ${formatSupabaseError(historyProbe.error)}` : 'OK');
  logger.log(`[BOOT] ${JOB_TABLE} probe:`, jobsProbe.error ? `FAIL — ${formatSupabaseError(jobsProbe.error)}` : 'OK');

  if (historyProbe.error) {
    throw new Error(
      `Refusing to start: Supabase extraction_history schema check failed: ${formatSupabaseError(historyProbe.error)}`
    );
  }

  if (jobsProbe.error) {
    throw new Error(
      `Refusing to start: Supabase ${JOB_TABLE} schema check failed: ${formatSupabaseError(jobsProbe.error)}`
    );
  }

  if (env.REQUIRE_NETWORK_EGRESS_LOCKDOWN && env.NETWORK_EGRESS_LOCKDOWN_ACK !== 'enabled') {
    throw new Error(
      'Refusing to start: network egress lockdown is required but NETWORK_EGRESS_LOCKDOWN_ACK is not set to "enabled".'
    );
  }

  logger.log('[BOOT] Runtime readiness checks passed.');
  return { schemaChecked: true, durableJobs: true };
}


module.exports = {
  assertRuntimeReadiness,
  getMissingEnvVars,
  formatSupabaseError, // exported for tests
};
