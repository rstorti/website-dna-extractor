# Website DNA Extractor v1.2.0 Production Readiness Check

Reviewed file: `Website_DNA_Extractor_v1.2.0.zip`

Date: 2026-04-26

## Verdict

Not production ready. Not bullet proof.

This version is stronger than v1.1.0. It removes the obvious private key issue, adds a cleaner release ZIP process, improves history route protection, adds blocking schema validation, improves URL checks for web and Dart flows, and fixes the previous frontend polling leak.

However, it still has release-blocking defects. The most serious is that the backend extraction module imports `./vertex_imagen`, but `vertex_imagen.js` is not included in the ZIP. That means the extraction backend is expected to fail when the extractor is loaded.

## Readiness score

Approximate score: 6.0 out of 10.

This is a stronger pre-production build, but it is still not suitable for live client onboarding or automated Minfo campaign page creation.

## Checks performed

- Extracted the ZIP package.
- Inspected backend source structure and release contents.
- Checked package scripts and CI configuration.
- Performed static inspection of server routes, Dart API routes, URL validation, schema validation, history protection, image scanning, download proxy, frontend job polling, JSON generation, and release packaging.
- Checked for obvious leaked private keys and secret files.
- Checked for stale generated files and Supabase metadata in the ZIP.
- Confirmed missing module using `require.resolve('./vertex_imagen')`.
- Reviewed `full_qa_test.js` quality and CI viability.

What I could not complete:

- A full `npm ci`, `npm run build`, `npm test`, and `npm audit` cycle could not be completed in this environment because dependency installation and audit calls timed out. This does not change the verdict because static inspection found hard blockers.

## Critical blockers

### 1. Missing backend module: `vertex_imagen.js`

`extractor.js` imports:

```js
const { generateBrandHero } = require('./vertex_imagen');
```

But the file is not included in the ZIP.

This is a hard production blocker. Once `extractor.js` is required, the backend extraction path will fail with `MODULE_NOT_FOUND`. The first extraction job is likely to fail before doing useful work.

Required fix:

- Add `vertex_imagen.js` to the release allowlist, or remove the dependency entirely and make Vertex image generation optional using a guarded dynamic import.
- Add a CI check that runs `node -e "require('./extractor')"` after clean install.

### 2. CI is not a trustworthy production gate

`.github/workflows/ci.yml` installs backend and frontend with `npm ci --ignore-scripts`, then runs `npm run build`.

The root `build` script runs:

```json
"build": "cd frontend && npm install && npm run build"
```

That means CI starts with clean installs, then the build step runs `npm install` inside the frontend again. This is less deterministic than `npm ci` and can mask lockfile issues.

Also, `npm test` runs `node full_qa_test.js`, which requires live scraping, browser dependencies, network access, API keys, and the missing `vertex_imagen.js` module. This is not a reliable unit or CI test.

Required fix:

- Replace root build script with `cd frontend && npm ci --ignore-scripts && npm run build` for CI, or separate local and CI scripts.
- Add `npm run lint` to CI.
- Add fast unit tests that do not require live websites or AI keys.
- Add a smoke test that imports all backend modules after install.

### 3. Supabase `.temp` metadata is still included

The ZIP still includes:

- `supabase/.temp/linked-project.json`
- `supabase/.temp/project-ref`
- `supabase/.temp/pooler-url`
- version and migration temp files

This is not as severe as a private key, but it is still dirty release packaging. It exposes infrastructure metadata and proves the allowlist packaging script is not strict enough.

Required fix:

- Exclude `supabase/.temp` in `zip_code.ps1`.
- Add a post-ZIP validation script that fails if `.temp`, `.data`, `.env`, logs, debug images, generated JSON, or secret-like files appear in the archive.

### 4. Puppeteer request-level SSRF is still incomplete

The route validates the starting URL, and Axios uses safe HTTP agents. But Puppeteer request interception currently allows most browser subrequests:

```js
if (['font', 'media'].includes(resourceType)) {
  req.abort();
} else {
  req.continue();
}
```

A malicious website can cause the headless browser to request internal URLs through images, scripts, CSS, or fetch calls. The in-browser fallback fetch for images is also not protected by the server-side safe HTTP agent.

Required fix:

- Validate every Puppeteer request URL before `req.continue()`.
- Abort requests to private, loopback, link-local, multicast, metadata, and unresolved hosts.
- Consider blocking scripts for untrusted pages unless required.
- Disable or tightly restrict in-page `fetch()` fallback behaviour for image retrieval.

### 5. Public frontend history token is not real protection

The frontend reads:

```js
const HISTORY_API_KEY = import.meta.env.VITE_HISTORY_API_KEY || null;
```

Any `VITE_` variable is public in the browser bundle. This means the token used to protect `/api/history` can be exposed to anyone using the production frontend.

Required fix:

- Do not use a static history API key in the frontend bundle for production.
- Use real admin authentication, session cookies, Supabase Auth, or a server-side proxy that checks user identity and role.

### 6. Download proxy can still be abused for large-file memory pressure

`/api/download` only allows Supabase public storage or Google favicon URLs, which reduces SSRF risk. But it fetches the full response into memory:

```js
const buffer = Buffer.from(await response.arrayBuffer());
```

There is no hard content-length limit and no streaming limit. An attacker could point to a huge public Supabase file and force the server to allocate too much memory.

Required fix:

- Enforce `Content-Length` max before download.
- Stream with a byte counter and abort when over limit.
- Restrict downloads to the expected Supabase project hostname, not any `.supabase.co` project, unless there is a deliberate reason to allow all projects.

### 7. `/api/jobs/:jobId` is unauthenticated and uses guess-resistant IDs only

Job IDs are UUIDs, which helps. But production-grade client onboarding should not rely on secrecy of job IDs alone. A job result can include extracted client data, links, images, and generated campaign payloads.

Required fix:

- Bind jobs to authenticated sessions or tenant IDs.
- Require auth to read job results.
- Store jobs in Redis or a database, not only memory, if the system needs reliability across restarts.

### 8. The QA test is not production-grade

`full_qa_test.js` is a live integration script, not a proper automated test suite. It checks only two URLs, writes generated outputs, expects some stale field names, and depends on external services.

Required fix:

- Add unit tests for URL validation, schema validation, CTA filtering, payload mapping, image filtering, and sanitization.
- Add mocked integration tests for `/api/jobs`, `/api/dart/extract`, and `/api/download`.
- Add a small set of optional live smoke tests that are not required for every CI run.

## Important non-blocking issues

### 1. Hard-coded production backend URL in frontend

The frontend uses:

```js
const API_BASE_URL = IS_LOCAL ? '' : 'https://website-dna-extractor-production.up.railway.app';
```

This makes staging, client demos, disaster recovery, and environment separation harder.

Recommendation:

- Use `VITE_API_URL` for the backend base URL.
- Keep local, staging, and production URLs separate.

### 2. Root `postinstall` downloads Chrome

The root `postinstall` script runs:

```json
"postinstall": "npx puppeteer browsers install chrome"
```

That can slow deploys, fail in restricted environments, and complicate CI. Production containers should usually install browser dependencies explicitly in the Dockerfile or deployment image.

### 3. No persistent job queue

Both web and Dart jobs use in-memory maps. This is acceptable for a prototype, but not for reliable production onboarding. A server restart loses active jobs and results.

Recommendation:

- Use Redis, BullMQ, Supabase, Postgres, or another persistent queue and job store.

### 4. `supabaseClient.js` likely uses the anon key server-side

The server appears to use the Supabase anon key. That may be acceptable only if RLS policies are very tightly designed. For server-owned uploads and history persistence, a service role key with carefully controlled server-only access is usually cleaner.

### 5. Error handling still mixes user-facing and internal details

Several error paths return raw stage names, hints, and sometimes upstream messages. Useful for debugging, but production should separate developer diagnostics from client-facing errors.

## Improvements since v1.1.0

- Obvious GCP private key file is no longer present.
- `DART_API_KEY` now fails closed in production.
- Dart URL validation now uses `isAllowedUrl` and exact YouTube host checks.
- History routes now require `HISTORY_API_KEY` in production.
- Schema validation is now blocking instead of merely logging.
- Frontend polling cleanup is improved.
- HTML escaping was added around generated campaign description.
- The download proxy whitelist is stronger than before.
- Release packaging is now allowlist-based, but still needs stricter exclusions.

## Minimum checklist before live client use

1. Add or safely remove `vertex_imagen.js` dependency.
2. Make CI import every backend module after clean install.
3. Replace `full_qa_test.js` with real automated tests.
4. Add lint, unit tests, schema tests, SSRF tests, and build checks to CI.
5. Harden Puppeteer request interception against internal subrequests.
6. Remove `supabase/.temp` and add post-ZIP leak detection.
7. Replace public `VITE_HISTORY_API_KEY` with real authentication.
8. Add max-size streaming protection to `/api/download`.
9. Bind job results to authenticated users or tenants.
10. Run clean install, build, lint, test, and audit successfully in a clean container.

## Final recommendation

Do not deploy this to live client onboarding yet.

Treat v1.2.0 as a pre-production hardening candidate. The next developer task should be a targeted v1.2.1 release with the missing module fixed, a clean ZIP validator, real CI tests, Puppeteer subrequest SSRF protection, and frontend/admin auth corrected.
