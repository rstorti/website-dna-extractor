'use strict';

const { v4: uuidv4 } = require('uuid');

const JOB_TTL_MS = 30 * 60 * 1000;
const JOB_TABLE = 'extraction_jobs';
const ACTIVE_STATUSES = ['pending', 'running', 'cancelling'];

function nowIso() {
  return new Date().toISOString();
}

function expiresAtIso() {
  return new Date(Date.now() + JOB_TTL_MS).toISOString();
}

function normalizeJob(job) {
  if (!job) return null;
  return {
    jobId: job.job_id,
    jobType: job.job_type,
    tenantId: job.tenant_id,
    status: job.status,
    result: job.result || null,
    error: job.error || null,
    hint: job.hint || null,
    stage: job.stage || 'init',
    steps: Array.isArray(job.steps) ? job.steps : [],
    elapsed: job.elapsed || null,
    cancelRequested: Boolean(job.cancel_requested),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    expiresAt: job.expires_at,
  };
}

class JobStore {
  constructor({ getSupabase = () => ({ supabase: null }), logger = console } = {}) {
    this.getSupabase = getSupabase;
    this.logger = logger;
    this.memoryJobs = new Map();
    this.abortControllers = new Map();
  }

  _cleanupMemoryJobs() {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [jobId, job] of this.memoryJobs.entries()) {
      if (new Date(job.created_at).getTime() < cutoff) {
        this.memoryJobs.delete(jobId);
        this.abortControllers.delete(jobId);
      }
    }
  }

  async initialize() {
    this._cleanupMemoryJobs();
    const { supabase } = this.getSupabase();
    if (!supabase) return { durable: false, staleJobsReconciled: 0 };

    const staleStatuses = ACTIVE_STATUSES.join(',');
    const staleMessage = 'Extraction was interrupted before completion. The server likely restarted or redeployed. Restart the job.';
    const { data, error } = await supabase
      .from(JOB_TABLE)
      .update({
        status: 'failed',
        error: 'Job interrupted before completion',
        hint: staleMessage,
        updated_at: nowIso(),
      })
      .in('status', ACTIVE_STATUSES)
      .select('job_id');

    if (error) {
      throw new Error(`Job store initialization failed: ${error.message}`);
    }

    return {
      durable: true,
      staleJobsReconciled: Array.isArray(data) ? data.length : 0,
    };
  }

  registerAbortController(jobId, controller) {
    if (controller) {
      this.abortControllers.set(jobId, controller);
    }
  }

  unregisterAbortController(jobId) {
    this.abortControllers.delete(jobId);
  }

  getAbortController(jobId) {
    return this.abortControllers.get(jobId) || null;
  }

  async createJob({
    jobId = uuidv4(),
    jobType = 'web',
    tenantId = 'default',
    status = 'pending',
    stage = 'init',
    steps = [],
  } = {}) {
    const record = {
      job_id: jobId,
      job_type: jobType,
      tenant_id: tenantId,
      status,
      stage,
      steps,
      result: null,
      error: null,
      hint: null,
      elapsed: null,
      cancel_requested: false,
      created_at: nowIso(),
      updated_at: nowIso(),
      expires_at: expiresAtIso(),
    };

    const { supabase } = this.getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from(JOB_TABLE)
        .insert(record)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create job: ${error.message}`);
      }
      return normalizeJob(data);
    }

    this.memoryJobs.set(jobId, record);
    this._cleanupMemoryJobs();
    return normalizeJob(record);
  }

  async updateJob(jobId, patch) {
    const normalizedPatch = {
      ...patch,
      updated_at: nowIso(),
      expires_at: expiresAtIso(),
    };

    const { supabase } = this.getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from(JOB_TABLE)
        .update(normalizedPatch)
        .eq('job_id', jobId)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to update job ${jobId}: ${error.message}`);
      }
      return normalizeJob(data);
    }

    const job = this.memoryJobs.get(jobId);
    if (!job) return null;
    const next = { ...job, ...normalizedPatch };
    this.memoryJobs.set(jobId, next);
    this._cleanupMemoryJobs();
    return normalizeJob(next);
  }

  async getJob(jobId, { tenantId = null } = {}) {
    this._cleanupMemoryJobs();
    const { supabase } = this.getSupabase();
    if (supabase) {
      let query = supabase
        .from(JOB_TABLE)
        .select('*')
        .eq('job_id', jobId)
        .gt('expires_at', nowIso())
        .limit(1);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new Error(`Failed to load job ${jobId}: ${error.message}`);
      }
      return normalizeJob(data);
    }

    const job = this.memoryJobs.get(jobId);
    if (!job) return null;
    if (tenantId && job.tenant_id !== tenantId) return null;
    if (new Date(job.expires_at).getTime() <= Date.now()) {
      this.memoryJobs.delete(jobId);
      this.abortControllers.delete(jobId);
      return null;
    }
    return normalizeJob(job);
  }

  async requestCancel(jobId) {
    return this.updateJob(jobId, {
      status: 'cancelling',
      cancel_requested: true,
    });
  }

  async getCounts(jobType = null) {
    const { supabase } = this.getSupabase();
    const counts = { pending: 0, running: 0, cancelling: 0 };

    if (supabase) {
      for (const status of Object.keys(counts)) {
        let query = supabase
          .from(JOB_TABLE)
          .select('job_id', { count: 'exact', head: true })
          .eq('status', status)
          .gt('expires_at', nowIso());
        if (jobType) {
          query = query.eq('job_type', jobType);
        }
        const { count, error } = await query;
        if (error) {
          throw new Error(`Failed to count ${status} jobs: ${error.message}`);
        }
        counts[status] = count || 0;
      }
      return counts;
    }

    this._cleanupMemoryJobs();
    for (const job of this.memoryJobs.values()) {
      if (jobType && job.job_type !== jobType) continue;
      if (Object.prototype.hasOwnProperty.call(counts, job.status)) {
        counts[job.status] += 1;
      }
    }
    return counts;
  }
}

module.exports = {
  JOB_TABLE,
  JOB_TTL_MS,
  JobStore,
};
