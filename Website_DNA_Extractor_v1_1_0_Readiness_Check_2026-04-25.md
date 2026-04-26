# Website DNA Extractor v1.1.0 Production Readiness Check

Reviewed file: `Website_DNA_Extractor_v1.1.0.zip`
Date: 2026-04-25

## Verdict

Not production ready. Not bullet proof.

This version is a material improvement over v1.0.0 because it now includes backend source, async web jobs, a Dart API route, rate limiting, CI config, schema validation, and improved URL validation. However, it still has critical security, packaging, validation, and QA blockers.

## What I checked

- Extracted the ZIP successfully.
- Counted 144 files, about 6.2 MB extracted.
- Confirmed backend source is now included.
- Checked syntax for core backend files:
  - `server.js`: pass
  - `dart_api.js`: pass
  - `extractor.js`: pass
  - `lib/validateUrl.js`: pass
  - `lib/schemaValidator.js`: pass
- Reviewed route security, URL validation, async jobs, history handling, packaging, QA evidence, and generated payload handling.
- Could not complete `npm ci` or a fresh build in this environment because dependency installation timed out. The package includes a built frontend, but that does not replace a clean CI build.

## Critical blockers

### 1. A Google Cloud service account private key is included in the ZIP

File found:

- `western-verve-701-4a02ba21c2c8.json`

This contains a private key and client email. This is a release-stopping security incident. The key should be revoked or rotated immediately and removed from the repository and all ZIPs.

### 2. Dart API can run open if `DART_API_KEY` is missing

`dart_api.js` allows all requests when `DART_API_KEY` is not set. In production, this should fail closed. The server should refuse to start in production if the Dart API key is missing.

### 3. Dart API URL validation is weaker than the web route

The Dart route uses `parseUrl()` only. It does not use `isAllowedUrl()` and does not apply the same SSRF protections as `/api/jobs`.

This means `/api/dart/extract` can accept internal, localhost, metadata, or private network targets unless blocked later by accident. For a scraper, this is a critical issue.

### 4. YouTube validation in Dart API is bypassable

`dart_api.js` uses substring matching:

```js
if (!host.includes('youtube.com') && !host.includes('youtu.be'))
```

That can accept hostile domains such as `youtube.com.evil.tld`. It must use exact host or subdomain checks.

### 5. Download proxy Supabase whitelist is bypassable

`server.js` uses:

```js
url.includes('.supabase.co/storage/v1/object/public/')
```

That can be bypassed by putting the Supabase string inside a malicious URL query or path. The code must parse the URL and check exact hostname suffix and path prefix.

### 6. `/api/history` and DELETE `/api/history` are unauthenticated

The source explicitly says history is open so Netlify users can see the table. This is not acceptable for production because history can contain client URLs, screenshots, extraction payloads, and campaign data.

### 7. Browser-level SSRF is not fully blocked

Initial URL validation has improved, but Puppeteer request interception does not validate every outgoing request. A hostile page can still cause Chromium to request internal URLs as images, scripts, or subresources unless every request URL is checked before `req.continue()`.

### 8. Schema validation logs but does not enforce

`lib/schemaValidator.js` attaches `_schemaValid = false` and lets the payload continue. That is not production enforcement. Invalid payloads should return a 422 or be transformed into a safe fallback.

### 9. QA evidence says the tested extractions are partial

`full_qa_report.json` marks both tested cases as `partial`. Missing fields include colors, CTAs, socials, business description, and AI analysis. This means the current QA evidence does not prove the extractor can reliably auto-populate a campaign page.

### 10. Lint output shows failures

`eslint_output.txt` reports 80 problems: 7 errors and 73 warnings. This is not a clean CI state.

### 11. The ZIP contains many files that should not ship

Examples found:

- logs: `error.log`, `server.log`, `trace.log`, `push_error.log`, `test_server.log`
- debug images: `debug_base.png`, `debug_mask.png`, `debug_outpaint.jpg`
- old and temp code: `old_app.jsx`, `old_app_temp.jsx`, `temp_app.jsx`, `temp_db_setup.js`
- QA outputs and generated campaign JSONs
- Supabase `.temp` files including project and pooler metadata
- `frontend/dist` build output despite being ignored in `.gitignore`

The packaging script excludes only `.env`, `.git`, `.data`, `outputs`, ZIPs and node modules. It does not follow `.dockerignore`, so secrets and artifacts are still leaking into the release ZIP.

## Improvements since v1.0.0

- Backend source is now included.
- `/api/jobs` async job model has been added for the web UI.
- The old long synchronous web extraction path appears to have been replaced by job creation and polling.
- Polling cleanup in the React extraction flow is better.
- Server-side URL validation is stronger for the web route.
- Basic rate limiting and concurrency cap were added.
- `xlsx` appears to have been replaced in the frontend package.
- HTML escaping has been added in the final frontend payload builder.
- A CI workflow, lint script and test script were added.

## Required fixes before production

1. Revoke the included Google Cloud key and remove all secrets from the package.
2. Replace the ZIP packaging script with an allowlist release build.
3. Require `DART_API_KEY` in production and fail startup if absent.
4. Apply the same hardened URL validation to Dart API, web jobs, scan-images, image fetches, and every Puppeteer request.
5. Replace all substring host checks with exact hostname or subdomain checks.
6. Authenticate history read and delete routes.
7. Make schema validation blocking.
8. Clean the lint output to zero errors.
9. Replace smoke tests with real automated tests for URL security, SSRF, schema validation, async jobs, image extraction, CTA filtering, and Minfo payload import shape.
10. Remove logs, debug files, temp files, old code, generated outputs, Supabase temp files, service keys, previous review reports and built artifacts from the release ZIP.
11. Move job state from in-memory maps to Redis, Supabase table, or another persistent store before multi-instance deployment.
12. Add production observability with structured logs, trace IDs, redaction, job duration metrics, and failure reason categories.

## Readiness score

Current score: 5.5 out of 10.

This is no longer just a frontend prototype. It is now a stronger pre-production prototype. But the included private key, open Dart API fallback, weak Dart SSRF protection, unauthenticated history, non-blocking schema validation, partial QA results, and dirty package contents prevent production use.

## Recommendation

Do not use this with real client onboarding data yet. Run one more hardening sprint focused on security, release packaging, schema enforcement, and QA automation before considering a controlled pilot.
