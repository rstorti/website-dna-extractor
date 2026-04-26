'use strict';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'stub-ci-key';
process.env.HISTORY_API_KEY = 'test-history-secret-abc123';
process.env.JOB_API_KEY = 'test-job-secret-xyz789';
process.env.DART_API_KEY = 'test-dart-secret-456';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const request = require('supertest');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const historyPath = path.join(ROOT, '.data', 'history.json');
const outputsDir = path.join(ROOT, 'outputs');
const downloadFixture = path.join(outputsDir, 'test-download.txt');

const extractorPath = require.resolve(path.join(ROOT, 'extractor.js'));
const aiVerifierPath = require.resolve(path.join(ROOT, 'ai_verifier.js'));
const youtubeExtractorPath = require.resolve(path.join(ROOT, 'youtube_extractor.js'));

require.cache[extractorPath] = {
  id: extractorPath,
  filename: extractorPath,
  loaded: true,
  exports: {
    extractDNA: async (url, onStage) => {
      onStage?.('Mock crawl');
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        mappedData: { name: `Mock ${new URL(url).hostname}`, colors: [] },
        screenshotPath: null,
        logoPath: null,
        screenshotUrl: null,
        buttonStyles: [],
        ctas: [{ button_name: 'Get Started', url: `${new URL(url).origin}/get-started` }],
        socialMediaLinks: [],
        featuredImages: [],
        isWaybackFallback: false,
      };
    },
    scrapeYoutubeFallback: async () => ({
      title: 'Fallback video',
      channel: 'Fallback channel',
      description: 'Fallback description',
    }),
  },
};

require.cache[aiVerifierPath] = {
  id: aiVerifierPath,
  filename: aiVerifierPath,
  loaded: true,
  exports: {
    verifyDNA: async (mappedData) => ({
      verified_data: mappedData,
    }),
  },
};

require.cache[youtubeExtractorPath] = {
  id: youtubeExtractorPath,
  filename: youtubeExtractorPath,
  loaded: true,
  exports: {
    extractYoutubeDetails: async () => ({
      title: 'Test video',
      channel: 'Test channel',
      description: 'Test description',
      thumbnail: 'https://img.youtube.com/test.jpg',
      channelLogo: null,
    }),
  },
};

const { app, jobStore } = require('../server.js');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(`     ${error.message}`);
    failures.push({ name, error: error.message });
    failed++;
  }
}

async function waitFor(fn, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for expected condition');
}

async function loginAs(tenantId) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ password: process.env.JOB_API_KEY, tenantId });

  assert.strictEqual(res.status, 200, `login failed: ${res.text}`);
  assert.ok(res.body.token, 'login did not return a token');
  return res.body.token;
}

async function main() {
  const originalHistory = fs.existsSync(historyPath) ? fs.readFileSync(historyPath, 'utf8') : null;
  const hadDownloadFixture = fs.existsSync(downloadFixture);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.mkdirSync(outputsDir, { recursive: true });
  fs.writeFileSync(downloadFixture, 'download fixture', 'utf8');

  try {
    const token = await loginAs('tenant-a');

    await test('POST /api/auth/login rejects missing password', async () => {
      const res = await request(app).post('/api/auth/login').send({ tenantId: 'tenant-a' });
      assert.strictEqual(res.status, 400);
    });

    await test('GET /api/history returns tenant-scoped records', async () => {
      const fixture = [
        { id: '1', tenant_id: 'tenant-a', tenantId: 'tenant-a', url: 'https://tenant-a.example', timestamp: new Date().toISOString() },
        { id: '2', tenant_id: 'tenant-b', tenantId: 'tenant-b', url: 'https://tenant-b.example', timestamp: new Date().toISOString() },
      ];
      fs.writeFileSync(historyPath, JSON.stringify(fixture, null, 2));

      const res = await request(app)
        .get('/api/history')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.length, 1);
      assert.strictEqual(res.body[0].tenant_id, 'tenant-a');
    });

    await test('POST /api/jobs creates a durable job and GET /api/jobs/:id returns completion', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://example.com' });

      assert.strictEqual(res.status, 202, res.text);
      assert.ok(res.body.jobId);

      const completed = await waitFor(async () => {
        const poll = await request(app)
          .get(`/api/jobs/${res.body.jobId}`)
          .set('Authorization', `Bearer ${token}`);
        return poll.status === 200 ? poll : null;
      });

      assert.strictEqual(completed.body.status, 'complete');
      assert.strictEqual(completed.body.data.success, true);
    });

    await test('GET /api/jobs/:id returns running state for seeded job', async () => {
      const seeded = await jobStore.createJob({
        jobType: 'web',
        tenantId: 'tenant-a',
        status: 'running',
        stage: 'website-extraction',
        steps: ['website-extraction'],
      });

      const res = await request(app)
        .get(`/api/jobs/${seeded.jobId}`)
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 202);
      assert.strictEqual(res.body.status, 'running');
      assert.strictEqual(res.body.stage, 'website-extraction');
    });

    await test('DELETE /api/jobs/:id requests cancellation for seeded job', async () => {
      const seeded = await jobStore.createJob({
        jobType: 'web',
        tenantId: 'tenant-a',
        status: 'running',
        stage: 'website-extraction',
        steps: ['website-extraction'],
      });
      let aborted = false;
      jobStore.registerAbortController(seeded.jobId, { abort: () => { aborted = true; } });

      const res = await request(app)
        .delete(`/api/jobs/${seeded.jobId}`)
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'cancelling');
      assert.strictEqual(aborted, true);

      const updated = await jobStore.getJob(seeded.jobId, { tenantId: 'tenant-a' });
      assert.strictEqual(updated.status, 'cancelling');
    });

    await test('POST /api/scan-images returns extracted images', async () => {
      const originalAxiosGet = axios.get;
      axios.get = async () => ({
        status: 200,
        headers: {},
        data: `
          <html>
            <head><meta property="og:image" content="https://cdn.example.com/hero.jpg"></head>
            <body><img src="/logo.png" /><div style="background-image:url('/bg.jpg')"></div></body>
          </html>
        `,
      });

      try {
        const res = await request(app)
          .post('/api/scan-images')
          .set('Authorization', `Bearer ${token}`)
          .send({ url: 'https://example.com' });

        assert.strictEqual(res.status, 200, res.text);
        assert.ok(Array.isArray(res.body.images));
        assert.ok(res.body.images.some((img) => img.url.includes('hero.jpg')));
      } finally {
        axios.get = originalAxiosGet;
      }
    });

    await test('GET /api/download serves authenticated local output files', async () => {
      const res = await request(app)
        .get('/api/download')
        .set('Authorization', `Bearer ${token}`)
        .query({ url: '/outputs/test-download.txt', filename: 'report.txt' });

      assert.strictEqual(res.status, 200, res.text);
      assert.match(res.headers['content-disposition'], /report\.txt/);
    });

    await test('GET /api/download rejects unauthenticated requests', async () => {
      const res = await request(app)
        .get('/api/download')
        .query({ url: '/outputs/test-download.txt', filename: 'report.txt' });

      assert.strictEqual(res.status, 401);
    });
  } finally {
    if (originalHistory == null) {
      if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath);
      }
    } else {
      fs.writeFileSync(historyPath, originalHistory);
    }

    if (!hadDownloadFixture && fs.existsSync(downloadFixture)) {
      fs.unlinkSync(downloadFixture);
    }
  }

  console.log('');
  console.log(`Route tests complete: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('');
    console.error('FAILED TESTS:');
    for (const failure of failures) {
      console.error(`  - ${failure.name}: ${failure.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Route test runner crashed:', error);
  process.exit(1);
});
