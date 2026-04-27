'use strict';

/**
 * dart_api.js - Dart-facing REST API layer.
 */

const { isAllowedUrl } = require('./lib/validateUrl.js');
const { JobStore } = require('./lib/jobStore');

function requireApiKey(req, res, next) {
  const expectedKey = process.env.DART_API_KEY;
  if (!expectedKey) {
    return next();
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }
  next();
}

function parseUrl(raw, fieldName) {
  if (!raw || typeof raw !== 'string') return { ok: false, error: `${fieldName} is required and must be a string` };
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return { ok: true, url: parsed.href };
  } catch {
    return { ok: false, error: `${fieldName} is not a valid URL` };
  }
}

function buildDartPayload(fullPayload) {
  const d = fullPayload.data || {};
  const yt = fullPayload.youtubeData || null;
  const profile = fullPayload.profilePayload || null;

  const websiteImages = fullPayload.featuredImages || d.featuredImages || [];
  const profileImages = profile?.featuredImages || [];
  const placeholderImages = websiteImages.slice(0, 2).length === 2
    ? websiteImages.slice(0, 2)
    : [...websiteImages, ...profileImages].slice(0, 2);

  return {
    name: d.name || null,
    website_summary: d.website_summary || null,
    youtube_summary: d.youtube_summary || null,
    combined_summary: d.combined_summary || null,
    logo_url: d.image || null,
    screenshot_url: fullPayload.screenshotUrl || null,
    placeholder_images: placeholderImages,
    campaign_description: d.campaign_description || null,
    background_color: d.background_color || '#FFFFFF',
    foreground_color: d.foreground_color || '#000000',
    qr_code_color: d.qr_code_color || '#000000',
    background_app_bar_color: d.background_app_bar_color || null,
    foreground_app_bar_color: d.foreground_app_bar_color || null,
    icon_foreground_color_left: d.icon_foreground_color_left || null,
    icon_background_color_left: d.icon_background_color_left || null,
    icon_foreground_color_right: d.icon_foreground_color_right || null,
    icon_background_color_right: d.icon_background_color_right || null,
    background_selected_color: d.background_selected_color || null,
    button_styles: (fullPayload.buttonStyles || []).map((b) => {
      const shapeMap = { Square: 1, Curved: 2, Rounded: 2, Pill: 3 };
      const shapeStr = b.shape || 'Square';
      const shapeInt = shapeMap[shapeStr] ?? 1;
      const alignRaw = (b.textAlign || 'center').toLowerCase().replace('start', 'left').replace('end', 'right');
      const alignMap = { left: 1, center: 2, right: 3 };
      return {
        background_color_hex: b.backgroundColorHex || null,
        text_color_hex: b.colorHex || null,
        shape: shapeStr,
        shape_int: shapeInt,
        border_radius: b.borderRadius || '0px',
        font_family: b.fontFamily || null,
        padding: b.padding || null,
        text_align: alignRaw,
        text_align_int: alignMap[alignRaw] ?? 2,
        sample_text: b.text || null,
        sample_url: b.url || null,
      };
    }),
    website_ctas: (fullPayload.ctas || []).map((c) => ({
      button_name: c.button_name,
      url: c.url,
      context: c.context || null,
    })),
    youtube_ctas: (d.youtube_ctas || []).map((c) => ({
      button_name: c.button_name,
      url: c.url,
      context: c.context || null,
    })),
    profile_ctas: (profile?.ctas || []).map((c) => ({
      button_name: c.button_name,
      url: c.url,
      context: c.context || null,
    })),
    social_media_links: fullPayload.socialMediaLinks || [],
    youtube_social_links: d.youtube_social_links || [],
    profile_social_links: profile?.socialMediaLinks || [],
    youtube: yt ? {
      title: yt.title || null,
      channel: yt.channel || null,
      description: yt.description || null,
      thumbnail_url: yt.thumbnail || null,
      channel_logo: yt.channelLogo || null,
      published_at: yt.publishedAt || null,
    } : null,
    minfo_campaign: d,
    is_wayback_fallback: fullPayload.isWaybackFallback || false,
    youtube_warning: fullPayload.youtubeWarning || null,
    total_ms: fullPayload.totalMs || null,
  };
}

module.exports = function mountDartApi(app, {
  runExtraction,
  dartExtractRateLimit = (_req, _res, next) => next(),
  activeExtractions = () => 0,
  incrementActive = () => {},
  decrementActive = () => {},
  MAX_CONCURRENCY = 4,
  jobStore = new JobStore(),
} = {}) {
  if (process.env.NODE_ENV === 'production' && !process.env.DART_API_KEY) {
    console.warn('[DART API] WARNING: DART_API_KEY is not set — Dart routes will operate in open-access mode. Set the key in Railway Variables for production security.');
  }

  app.post('/api/dart/extract', requireApiKey, dartExtractRateLimit, async (req, res) => {
    const { url, youtube_url, profile_url } = req.body || {};

    const urlParsed = parseUrl(url, 'url');
    if (!urlParsed.ok) return res.status(400).json({ error: urlParsed.error });
    const ssrfCheck = await isAllowedUrl(urlParsed.url);
    if (!ssrfCheck.ok) return res.status(400).json({ error: `URL not allowed: ${ssrfCheck.reason}` });

    let ytUrl = null;
    if (youtube_url) {
      const p = parseUrl(youtube_url, 'youtube_url');
      if (!p.ok) return res.status(400).json({ error: p.error });
      const host = new URL(p.url).hostname.toLowerCase();
      const isYoutube = host === 'youtube.com' || host.endsWith('.youtube.com') ||
        host === 'youtu.be' || host.endsWith('.youtu.be');
      if (!isYoutube) {
        return res.status(400).json({ error: 'youtube_url must be a youtube.com or youtu.be URL' });
      }
      const ytSsrf = await isAllowedUrl(p.url);
      if (!ytSsrf.ok) return res.status(400).json({ error: `youtube_url not allowed: ${ytSsrf.reason}` });
      ytUrl = p.url;
    }

    let profUrl = null;
    if (profile_url) {
      const p = parseUrl(profile_url, 'profile_url');
      if (!p.ok) return res.status(400).json({ error: p.error });
      const profSsrf = await isAllowedUrl(p.url);
      if (!profSsrf.ok) return res.status(400).json({ error: `profile_url not allowed: ${profSsrf.reason}` });
      profUrl = p.url;
    }

    if (activeExtractions() >= MAX_CONCURRENCY) {
      return res.status(429).json({ error: 'Server is at maximum capacity. Please try again in 1 minute.' });
    }

    const job = await jobStore.createJob({
      jobType: 'dart',
      tenantId: 'dart',
      status: 'pending',
      stage: 'init',
      steps: [],
    });

    res.status(202).json({
      job_id: job.jobId,
      status: 'pending',
      poll_url: `/api/dart/result/${job.jobId}`,
      message: 'Extraction started. Poll poll_url every 5 seconds for results.',
    });

    (async () => {
      incrementActive();
      await jobStore.updateJob(job.jobId, { status: 'running' });
      try {
        const payload = await runExtraction({
          url: urlParsed.url,
          youtubeUrl: ytUrl || undefined,
          profileUrl: profUrl || undefined,
          caller: 'dart',
          onStage: ({ stage, steps, elapsed }) => jobStore.updateJob(job.jobId, { stage, steps, elapsed }),
        });
        await jobStore.updateJob(job.jobId, {
          status: 'complete',
          result: buildDartPayload(payload),
          error: null,
          hint: null,
        });
      } catch (error) {
        console.error(`[DART API] Job ${job.jobId} failed:`, error.message);
        await jobStore.updateJob(job.jobId, {
          status: error.message === 'Extraction cancelled by user' ? 'cancelled' : 'failed',
          error: error.message,
          stage: error.stage || 'unknown',
          hint: error.hint || null,
        });
      } finally {
        decrementActive();
      }
    })();
  });

  app.get('/api/dart/result/:jobId', requireApiKey, async (req, res) => {
    const job = await jobStore.getJob(req.params.jobId, { tenantId: 'dart' });
    if (!job) {
      return res.status(404).json({ error: 'Job not found or expired (jobs expire after 30 minutes)' });
    }

    if (['pending', 'running', 'cancelling'].includes(job.status)) {
      return res.status(202).json({ status: job.status, message: 'Still processing - poll again in 5 seconds' });
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      return res.status(422).json({
        status: job.status,
        error: job.error,
        stage: job.stage || null,
        hint: job.hint || null,
      });
    }

    return res.status(200).json({
      status: 'complete',
      data: job.result,
    });
  });

  app.get('/api/dart/health', requireApiKey, async (_req, res) => {
    const counts = await jobStore.getCounts('dart');
    res.json({
      status: 'ok',
      dart_api: 'v1',
      active_jobs: counts.running + counts.cancelling,
      pending_jobs: counts.pending,
      dart_api_key: process.env.DART_API_KEY ? 'SET' : 'NOT SET (open access)',
    });
  });

  console.log('[DART API] Routes mounted: POST /api/dart/extract, GET /api/dart/result/:jobId, GET /api/dart/health');
};
