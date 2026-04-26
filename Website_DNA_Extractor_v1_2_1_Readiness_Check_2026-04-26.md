# Website DNA Extractor v1.2.1 Production Readiness Check

Reviewed file: `Website_DNA_Extractor_v1.2.1.zip`

Date: 2026-04-26

## Verdict

Not production ready. Not bullet proof.

This release is materially stronger than v1.2.0. It fixes the missing `vertex_imagen.js` release blocker, removes the obvious private key file issue, excludes Supabase `.temp` metadata, includes a smoke test, improves schema enforcement, improves the release ZIP builder, and improves download proxy controls.

However, several issues still block live client onboarding use.

Approximate readiness score: 7/10 for controlled internal pre-production use, not for production.

## Confirmed improvements

1. `vertex_imagen.js` is now included.
2. The release ZIP is much cleaner than previous versions.
3. No obvious GCP private key file was found in the ZIP.
4. `supabase/.temp` metadata is not included.
5. `outputs/` contains only `.gitkeep`.
6. `schemaValidator.js` now returns invalid payloads to the caller for blocking.
7. `server.js` now throws on schema validation failure.
8. `/api/download` now uses host and path checks rather than substring matching.
9. `/api/download` now has a 20 MB cap.
10. Dart YouTube URL validation now checks hostname rather than substring matching.
11. Dart API is configured to fail closed in production if `DART_API_KEY` is missing.
12. A release ZIP builder with an allowlist and leak scan has been added.

## Testing performed

1. ZIP contents inspected.
2. JavaScript syntax check completed with `node --check` across all JS files. Result: passed.
3. Root dependency lock dry run completed with `npm ci --ignore-scripts --dry-run`. Result: passed.
4. Secret and leak scan by grep found no obvious private key material.
5. Full dependency install, lint, smoke test, and frontend build could not be fully completed in this environment because `npm ci` did not complete within the available execution window.

## Release blockers

### 1. Puppeteer subrequest SSRF protection is not actually blocking

`extractor.js` defines `makeSsrfSafeHandler`, but the handler calls `req.continue()` before the async DNS check completes. If a hostile webpage loads `http://169.254.169.254/`, `http://127.0.0.1/`, or a private IP hostname, the browser request is already allowed. The code only logs a warning after DNS resolution.

This is a hard security blocker for any scraper that accepts user supplied URLs.

Required fix: block before continue. Use request interception with a synchronous allow decision backed by a DNS cache, or route all network requests through a hardened proxy layer that resolves and validates every request before allowing it.

### 2. `/api/jobs` is unauthenticated

The main extraction endpoint can be called by anyone who can reach the backend. Rate limiting helps, but it is not access control. This can still be abused to run Puppeteer jobs and consume server resources.

Required fix: require authenticated admin or tenant session for `/api/jobs`, `/api/jobs/:jobId`, `/api/scan-images`, and `/api/download` where appropriate.

### 3. Job results rely on UUID secrecy only

`GET /api/jobs/:jobId` returns the full extraction result if the caller knows the job ID. There is no user, tenant, campaign, or session binding.

Required fix: bind jobs to authenticated users or tenants and check authorization on every job poll.

### 4. Browser-side history token is not real security

The frontend reads `VITE_HISTORY_API_KEY`. Any `VITE_` variable is exposed in the browser bundle. The backend also accepts the history token in a query string, which is more likely to leak via logs and browser history.

Required fix: remove browser-shipped shared secrets. Use proper login/session auth or a backend-for-frontend route. Do not accept sensitive tokens via query string.

### 5. Cancel does not cancel the backend job

The frontend AbortController cancels the browser request and polling, but the backend Puppeteer extraction continues until it finishes or fails. This matters for cost, memory, concurrency, and user experience.

Required fix: add `DELETE /api/jobs/:jobId` or a cancellation signal and wire it through to browser/page cleanup.

### 6. Concurrency can race

`activeExtractions` is checked before the async job starts, but incremented after the 202 response. Several simultaneous requests can pass the concurrency gate before the counter increments.

Required fix: reserve a slot before responding with 202, or use a proper queue with atomic capacity control.

### 7. Production persistence is not durable enough

Jobs are stored in memory only. If the server restarts, running and completed jobs disappear. This is risky for onboarding workflows, especially if extraction takes minutes.

Required fix: move jobs to Redis, Postgres, Supabase, or another durable queue with status, ownership, expiry, and retry metadata.

### 8. `GCP_CREDENTIALS_JSON` is written to `/tmp` without restrictive file mode

`config/env.js` writes decoded credentials to `/tmp/gcp-credentials.json` without setting file permissions. Default permissions can be too broad depending on umask and container setup.

Required fix: write with mode `0o600`, validate JSON shape, and avoid logging the credential path in production logs if unnecessary.

### 9. CI is still not a sufficient production gate

The CI has lint, smoke test, and frontend build jobs, which is good. But it still does not test SSRF, auth enforcement, payload schema content quality, image handling, job lifecycle, cancellation, Supabase persistence, Dart response shape, or frontend export/import compatibility.

Required fix: add real unit, integration, and API tests with mocked network calls and security cases.

### 10. Dockerfile still uses `npm install`

The root scripts have improved, but the Dockerfile still uses `npm install` rather than `npm ci`. That makes production builds less deterministic than CI.

Required fix: use `npm ci` for backend and frontend installs in Docker builds.

## Important non-blocking issues

1. `elapsed` in failed jobs is calculated as `Math.floor(Date.now() / 1000)`, not time since job start.
2. The README still says to map `.env.example` secrets into the frontend hosting GUI, which can encourage accidental client exposure of server secrets.
3. The root package requires `GEMINI_API_KEY` at startup, which makes import tests and local non-AI development brittle unless stubbed.
4. `/api/scan-images` extracts up to 200 image URLs but does not verify image MIME, dimensions, or public accessibility before returning candidates.
5. The schema validator is still shallow. It validates broad top-level shapes but not the actual Minfo campaign import contract deeply enough.
6. Some user-facing frontend logic still uses hostname substring checks for social-platform classification. This is less dangerous than backend SSRF, but it can misclassify links.

## Production release criteria

Do not use this for real client onboarding until these checks pass:

1. Every Puppeteer subrequest is blocked or allowed before it is sent.
2. `/api/jobs` and `/api/jobs/:jobId` require authenticated user or tenant access.
3. Job state is persisted outside process memory.
4. Cancel truly terminates the backend job and browser resources.
5. Docker builds use `npm ci` and complete cleanly.
6. CI includes SSRF, auth, schema, image, CTA, job lifecycle, and Dart API tests.
7. Frontend does not contain shared secrets.
8. The final Minfo campaign JSON is validated against the actual production import schema.
9. All generated images are verified as public, safe, correctly sized, and usable in Minfo.
10. A staging extraction run succeeds on representative websites before production use.

## Recommendation

Proceed with a v1.2.2 hardening sprint. The work is now focused and manageable. The largest remaining blocker is real Puppeteer SSRF protection, followed by proper authentication and durable job handling.
