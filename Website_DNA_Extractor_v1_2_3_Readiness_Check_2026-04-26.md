# Website DNA Extractor v1.2.3 Readiness Check

Reviewed file: `Website_DNA_Extractor_v1_2_3.zip`

Date: 2026-04-26

## Verdict

**Not production ready. Not bullet proof.**

v1.2.3 is improved, especially around Puppeteer subrequest SSRF handling and authenticated access to job, history, and scan routes. However, it still has release blockers that would make it unsafe to use for real client onboarding data.

Approximate production readiness score: **7.0/10**.

## What improved since v1.2.2

1. **Puppeteer request interception is materially better.**  
   `extractor.js` now waits for DNS resolution before `req.continue()`, and blocks requests resolving to restricted IP ranges.

2. **`/api/jobs`, `/api/jobs/:jobId`, `/api/history`, and `/api/scan-images` now use `requireAuthSession`.**  
   This is better than relying only on UUID secrecy or open routes.

3. **CORS checks were improved.**  
   The server now parses `origin` and checks hostnames instead of using broad substring checks.

4. **Docker still uses deterministic `npm ci`.**

5. **`vertex_imagen.js` is still included.**  
   The previous missing-module blocker remains fixed.

6. **Unit and smoke tests were added.**  
   The intent is good, although the test coverage is still not production grade.

## Hard blockers

### 1. The release ZIP is dirty and does not match the allowlist packaging script

The ZIP includes files that the release script claims should be excluded:

- `frontend/node_modules/`
- `frontend/dist/`
- `.data/history.json`
- `supabase/.temp/linked-project.json`
- `supabase/.temp/project-ref`
- `supabase/.temp/pooler-url`
- previous readiness reports
- test output JSON files
- debug files
- old app files
- nested source ZIPs, including `WebsiteDNA_SourceCode.zip`

This is a production release blocker. It proves the clean packaging process was not used or did not work.

### 2. Real extraction cancellation is still broken

The frontend only aborts its local request controller. It does **not** call `DELETE /api/jobs/:jobId`, so the backend Puppeteer extraction can continue running.

On the backend, `runExtraction()` is called with `abortSignal`, but its function signature does not accept it:

```js
async function runExtraction({ url, youtubeUrl, profileUrl, selectedImages = [], caller = 'web' })
```

The extraction engine therefore does not actually receive the abort signal. This still leaves long-running cancelled jobs consuming server memory and CPU.

### 3. `runExtraction()` references undefined `checkAbort()`

`server.js` calls `checkAbort()` several times, but no `checkAbort` function is defined in the file. This can cause `ReferenceError` in fallback paths and profile extraction paths.

Examples observed:

```js
checkAbort();
```

and:

```js
const profileDna = await extractProfileDNA(profileUrl, ..., abortSignal);
```

`abortSignal` is also not in scope inside `runExtraction()`.

### 4. Frontend history loading is broken

`frontend/src/App.jsx` calls:

```js
const sessionToken = await getHistorySessionToken();
```

But `getHistorySessionToken()` is not defined anywhere. That means the history fetch path can fail at runtime before it even calls `/api/history`.

### 5. Production session signing can fall back to a hardcoded dev secret

`/api/auth/login` signs session tokens with:

```js
const secret = process.env.HISTORY_API_KEY || 'dev-history-secret';
```

`requireAuthSession()` uses the same fallback. In production, this should fail closed if `HISTORY_API_KEY` is missing. A hardcoded default signing secret in a production code path is not acceptable.

### 6. Job storage is still in memory only

Both web jobs and Dart jobs are stored in process memory. This means:

- jobs disappear on restart
- results are not durable
- multiple server instances cannot share state
- there is no reliable audit trail
- recovery is impossible after a crash

For production onboarding, use Redis, Postgres, Supabase, or a proper queue.

### 7. Authentication is still not tenant-ready

The app now has a session token, but it is still basically a shared admin password model. Production onboarding needs tenant-bound access, because client extraction data should not be globally accessible to every authenticated operator.

Minimum production model:

- authenticated user ID
- tenant/client ID
- job owner ID
- history rows scoped by tenant
- job result access scoped by tenant
- audit logging for every extraction

### 8. Tests are not sufficient as a production gate

`tests/unit.js` includes useful checks, but several tests are simulations rather than tests of the real Express middleware and real routes. For example, job auth is tested through a local helper function, not by hitting the actual route.

The CI should include real route-level tests for:

- login
- missing keys in production
- session token expiry
- forged session tokens
- `/api/jobs` auth
- `/api/jobs/:jobId` auth
- `/api/scan-images` auth
- `/api/history` auth
- job cancellation
- SSRF through page subresources
- direct IP, IPv6, DNS failure, redirect, and rebinding cases

### 9. QA results still show partial extraction quality

`full_qa_report.json` shows both sample cases as `partial`, with missing colors, CTAs, socials, business description, and AI analysis.

For a tool that auto-populates campaign pages, partial extraction should not be considered production-ready unless there is a clear manual approval flow and quality threshold.

### 10. The frontend hardcodes the production backend URL

`frontend/src/App.jsx` points production traffic to:

```js
https://website-dna-extractor-production.up.railway.app
```

That is brittle. Production backend URLs should come from environment configuration, not a hardcoded source string.

## Secondary issues

- `.env.example` still contains stale comments about `/api/history/session` and `VITE_JOB_API_KEY` even though the frontend no longer implements that path cleanly.
- `eslint_output.txt` shows lint errors and warnings in the submitted package.
- `npm ci` did not complete within the execution window in this environment, and `npm test` could not pass without installed dependencies. This may be environment-related, but the included release ZIP structure made clean validation harder than it should be.
- `supabase/.temp` metadata is still present in the ZIP despite `.gitignore`, `.dockerignore`, and the release script saying it should be excluded.

## Production go/no-go

**No-go.**

Do not use v1.2.3 for real client onboarding data yet.

## Required v1.2.4 hardening sprint

1. Rebuild the ZIP using the allowlist-only release script and verify it excludes `node_modules`, `dist`, `.data`, `supabase/.temp`, logs, debug files, old code, nested ZIPs, and prior reports.
2. Fix `runExtraction()` to accept `abortSignal`, define `checkAbort()`, and pass `abortSignal` into every extraction path.
3. Update the frontend cancel button to call `DELETE /api/jobs/:jobId` before clearing local state.
4. Remove the undefined `getHistorySessionToken()` call or implement it correctly.
5. Require `HISTORY_API_KEY` in production and remove the `dev-history-secret` fallback from all production paths.
6. Move job storage to Redis, Postgres, Supabase, or another durable queue/store.
7. Add tenant-bound job and history access control.
8. Replace simulation-style tests with real route-level tests.
9. Add a clean release verification command: unzip, scan, `npm ci --ignore-scripts`, lint, smoke test, unit test, frontend build.
10. Require a QA threshold before any payload can be used to auto-create a campaign page.

## Bottom line

v1.2.3 is closer, but the remaining blockers are not cosmetic. The app still has broken runtime paths, incomplete cancellation, non-durable jobs, a dirty release package, and insufficient production-grade access control.
