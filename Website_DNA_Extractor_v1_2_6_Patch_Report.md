# Website DNA Extractor v1.2.6 Patch Report

## Status
This package is a hardening patch over v1.2.5. It addresses the main release blockers found in the previous review, but it has not been certified as production ready because full dependency install, frontend build, and live staging tests could not be completed in this environment.

## Key fixes applied

1. Fixed `server.js` syntax and runtime issues
   - Added missing `crypto` import.
   - Fixed malformed duplicate `SERVER_URL` health response entry.
   - Replaced `req.auth.tenantId` with `req.user.tenantId` in history routes.
   - Added constant-time HMAC signature comparison for session tokens.

2. Tenant-bound jobs and history
   - `/api/jobs/:jobId` GET and DELETE now enforce tenant ownership.
   - New web extraction jobs store `tenantId`.
   - `runExtraction()` accepts `tenantId` and passes it into history storage.
   - History storage now writes `tenant_id` to Supabase and `tenantId` only to local dev history.
   - `migration.sql` now adds `tenant_id` and an index for tenant-scoped history reads.

3. Concurrency leak fixes
   - `/api/jobs` now releases the active extraction slot on validation failures.
   - Dart extraction reserves concurrency before returning 202 to prevent race-through.

4. URL and SSRF hardening
   - CORS now uses exact apex plus subdomain matching, preventing `evilminfo.com` style bypasses.
   - `/api/scan-images` now applies the hardened URL validation gate before fetch.
   - `/api/scan-images` now handles redirects manually and validates every redirect hop.
   - Puppeteer subrequest DNS lookup bug fixed by replacing `dns.promises.lookup` with `dns.lookup` after importing `dns.promises`.

5. Cancellation hardening
   - `extractDNA()` now accepts `abortSignal` and checks it at stage boundaries.
   - Several long waits inside `extractDNA()` now use abortable sleeps.
   - Website extraction path passes the abort signal through from the job controller.

6. Frontend auth and scanner fixes
   - `ScannerTab` now receives the same API base URL and session token getter as the main app.
   - `ScannerTab` now sends `Authorization: Bearer <session>` to `/api/scan-images`.
   - Expired session handling now clears the correct local storage token.

7. Supabase hardening
   - Added support for `SUPABASE_SERVICE_ROLE_KEY` for server-side Supabase operations.
   - Production now rejects a Supabase URL configuration that lacks `SUPABASE_SERVICE_ROLE_KEY`.
   - Migration removes the previous permissive anon policy guidance.

8. Test and packaging updates
   - `npm test` now runs both smoke and unit tests.
   - `tests/smoke.js` now stubs required secrets before import checks.
   - Version updated to `1.2.6`.

## Validation performed here

Passed:
- `node --check server.js`
- `node --check extractor.js`
- `node --check dart_api.js`
- `node --check tests/smoke.js`
- `node --check tests/unit.js`

Not completed:
- `npm ci`
- `npm test`
- `npm run build`
- Live staging tests against real websites

Reason: `npm ci` timed out in this environment before dependencies could be installed.

## Remaining work before calling this production ready

1. Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` in the repo or Codex environment.
2. Run staging extraction tests on at least 20 websites, including hostile/edge cases.
3. Replace in-memory job storage with Redis, Supabase table-backed jobs, or a proper queue before multi-instance deployment.
4. Add route-level tests with Supertest for auth, tenant isolation, job cancellation, scan-image auth, CORS, and schema failure behavior.
5. Confirm Supabase migrations are applied and RLS posture is correct for service-role-only backend writes.
6. Run a security review focused on SSRF, stored XSS, credential leakage, tenant isolation, and job cancellation.
