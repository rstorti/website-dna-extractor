# Website DNA Extractor v1.2.2 Readiness Check

## Verdict

v1.2.2 is **not production ready** and is not bullet proof.

Approximate readiness score: **7.2/10**.

The package is cleaner than v1.2.1 and several earlier blockers have been addressed, including the missing `vertex_imagen.js`, deterministic Docker install, GCP credential file mode, a cleaner ZIP allowlist, and partial endpoint authentication. However, multiple hard release blockers remain.

## What I checked

- ZIP contents and release package cleanliness
- Server route security
- Job API flow
- History API flow
- Dart API flow
- Puppeteer SSRF handling
- URL validation
- Download proxy controls
- Frontend job polling and cancellation
- Secret leakage patterns
- Dockerfile and CI workflow
- Static JavaScript syntax checks with `node --check`

`node --check server.js`, `node --check extractor.js`, and `node --check dart_api.js` passed. Full `npm ci` and full build were not completed in this environment, so runtime dependency and browser execution remain unverified here.

## Major improvements since v1.2.1

1. `vertex_imagen.js` is now included.
2. Supabase `.temp` project metadata is not present.
3. No obvious private key file was found in the ZIP.
4. GCP credential bootstrap now writes with `0600` permissions.
5. Dockerfile now uses `npm ci`.
6. The download proxy includes a 20 MB cap.
7. Frontend polling cleanup has improved.
8. CI now includes lint, smoke test, unit test, and frontend build jobs.
9. Dart API now fails closed in production when `DART_API_KEY` is missing.

## Hard release blockers

### 1. Puppeteer SSRF protection still allows the request before validation

`extractor.js` still calls `req.continue()` before the DNS check finishes. The later DNS check only logs a warning if the request resolved to a restricted IP.

This means a hostile page can still make the headless browser request internal or metadata URLs before the app notices.

Required fix: the request interception handler must decide before sending the request. Use an async Puppeteer request handler that awaits URL and DNS validation, then calls either `req.abort()` or `req.continue()`, with a DNS cache if performance is a concern.

### 2. `/api/jobs` can still run open in production

`requireJobsToken()` allows extraction requests to continue if `JOB_API_KEY` is missing, even in production. It only logs a warning.

Required fix: fail closed in production. If `NODE_ENV=production` and `JOB_API_KEY` is missing, the server should refuse to start or the endpoint should return `503`.

### 3. The public frontend cannot securely call `/api/jobs` if `JOB_API_KEY` is enabled

The frontend posts to `/api/jobs` without an Authorization header. If you enable `JOB_API_KEY`, the frontend will break. If you leave it disabled, the extraction endpoint is open.

Required fix: add real admin authentication, tenant sessions, or a backend-for-frontend session flow. Do not put `JOB_API_KEY` in Vite.

### 4. `/api/jobs/:jobId` is unauthenticated

The job result endpoint returns completed extraction data to anyone who knows the job ID.

Required fix: bind job IDs to an authenticated user or tenant and require auth on result retrieval.

### 5. History session endpoint makes history effectively public

`/api/history/session` issues a valid signed session token to any caller. This means the history endpoint can be accessed by anyone who can reach the backend.

Required fix: session token issuance must itself require authenticated admin access. A signed token is not useful if it is handed out publicly.

### 6. CORS origin checks are substring based

The server allows origins using `origin.includes('minfo.com')`, `origin.includes('netlify.app')`, and similar checks. This can allow hostile domains such as `minfo.com.evil.example` or other crafted hostnames.

Required fix: parse origin with `new URL(origin)` and compare exact hostnames or approved suffixes with boundary checks.

### 7. Cancel still does not stop backend extraction

The frontend aborts its own request, but it does not call the backend cancel endpoint. The backend stores an `AbortController`, but `runExtraction()` does not receive or check the abort signal. A cancelled job can continue using Puppeteer and may later overwrite the cancelled status as complete.

Required fix: pass `abortSignal` into `runExtraction()` and `extractDNA()`, check it at every long-running stage, close the browser on cancellation, and prevent completed payloads from overwriting cancelled jobs.

### 8. Jobs are still stored in memory only

Both web and Dart jobs are held in `Map()` objects. If the server restarts, all running and completed jobs disappear.

Required fix: use Redis, Postgres, Supabase, or another durable queue and result store.

### 9. `/api/scan-images` is unauthenticated

The image scanner can fetch arbitrary user-supplied URLs. It uses safe HTTP agents, which is good, but it is still an open scraping endpoint.

Required fix: apply the same production authentication and tenant binding as `/api/jobs`, and call `isAllowedUrl()` before fetching.

### 10. Frontend delete history uses an undefined variable

`historyAuthHeaders` is referenced in the frontend delete handlers but is not defined. That will break delete history actions at runtime.

Required fix: either remove browser-side delete capability or implement authenticated delete using a real session auth flow.

## Important but not necessarily blocking

1. `docs/minfo_extractor_client.dart` and the Postman collection include placeholder API keys. They appear to be dummy examples, but docs should make that unmistakable.
2. `/api/health` publicly exposes which integrations are configured. This is useful for diagnostics but should be restricted or reduced in production.
3. The download proxy still buffers chunks before sending. The 20 MB cap limits the blast radius, but streaming directly to the response would be cleaner.
4. The root code still has very large files, especially `frontend/src/App.jsx` and `extractor.js`, which makes future QA harder.
5. The tests are useful but still partly simulated. They do not yet prove Puppeteer request blocking, authenticated job ownership, real cancellation, or import-ready Minfo payload correctness end to end.

## Release decision

Do not use v1.2.2 with real client onboarding data yet.

It is good enough for internal staging behind a VPN or strict admin access, but not for public client-facing onboarding.

## Required v1.2.3 hardening checklist

1. Fix Puppeteer subrequest SSRF so validation happens before every request is sent.
2. Fail closed in production if `JOB_API_KEY`, `HISTORY_API_KEY`, or `DART_API_KEY` is missing.
3. Add real authenticated sessions or tenant auth for `/api/jobs`, `/api/jobs/:jobId`, `/api/history`, `/api/history/session`, and `/api/scan-images`.
4. Bind every job to an authenticated user or tenant.
5. Implement real backend cancellation that closes browser resources.
6. Move job state to Redis, Supabase, Postgres, or another durable store.
7. Fix `historyAuthHeaders` in the frontend or remove browser delete access.
8. Replace substring CORS checks with exact origin validation.
9. Add integration tests proving SSRF blocking, auth, cancellation, job ownership, image extraction, CTA filtering, and final Minfo import schema.
10. Run a clean CI build from a fresh checkout and require all tests to pass before packaging.
