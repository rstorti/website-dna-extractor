# Website DNA Extractor v1.0.0 Code Review and Production Readiness Report

Reviewed ZIP: `Website_DNA_Extractor_v1.0.0.zip`
Review date: 2026-04-25
Purpose: assess suitability for collecting website, YouTube, profile, image, CTA, colour, and brand data to auto-populate a Minfo campaign page during new client onboarding.

## Executive verdict

The current package is useful as a prototype, but it is not production ready.

The main issue is not styling or UX. The release package is incomplete. It contains the React frontend, documentation, sample outputs, and two helper files, but it does not contain the backend extraction service that actually performs Puppeteer scraping, AI verification, image processing, Supabase upload, history persistence, async jobs, or Dart endpoints. Because of that, the full extraction pipeline cannot be verified from this ZIP alone.

The frontend build can be made to compile after dependency repair, but the current ZIP is not reproducible out of the box on Linux because the bundled `node_modules` has permission and optional dependency issues. There are also release blockers in security, schema consistency, auth, URL validation, production workflow, data privacy, image validation, and test coverage.

## What I tested

### 1. ZIP extraction and file inventory

Result: extracted successfully after normalising Windows backslashes in paths.

Important observation: the package includes `node_modules` and `dist`, but excludes the backend server files referenced in the docs, such as `server.js`, extractor modules, Supabase client, Puppeteer logic, and AI pipeline modules.

### 2. Frontend build

Initial result:

```text
npm run build
sh: 1: vite: Permission denied
```

Cause: zipped `node_modules/.bin/vite` did not preserve executable permissions.

After manually setting executable permissions, build still failed:

```text
Cannot find module @rollup/rollup-linux-x64-gnu
```

Cause: missing Rollup native optional dependency for Linux.

After running `npm install --ignore-scripts --no-audit --no-fund`, build succeeded:

```text
vite v5.4.21 building for production...
33 modules transformed.
dist/index.html 0.76 kB
assets/index-EkB52yZq.css 8.40 kB
assets/index-CyvuwP6R.js 529.69 kB, gzip 166.27 kB
warning: Some chunks are larger than 500 kB after minification.
```

Production implication: the project should not ship `node_modules` in a ZIP. It should ship source plus lockfile and build with `npm ci` in CI.

### 3. Test and lint scripts

Result:

```text
npm test
Missing script: test

npm run lint
Missing script: lint
```

Production implication: there is no automated safety net for payload generation, URL validation, schema mapping, image selection, CTA filtering, auth behaviour, or UI regressions.

### 4. JSON validity checks

Files parsed successfully:

```text
docs/sample_response.json
docs/Final_Campaign_Target.json
.data/history.json
docs/Minfo_Dart_API.postman_collection.json
```

Important issue: JSON validity does not mean schema consistency. The sample response uses different field names from the frontend expectations.

### 5. Dependency audit

`npm audit` reported:

```text
1 high vulnerability in xlsx
3 moderate vulnerabilities including Vite, esbuild, and PostCSS related findings
```

The `xlsx` issue is direct and relevant because the app imports `xlsx` in the main bundle.

### 6. URL validation helper tests

The server-side helper `lib/validateUrl.js` blocks several private ranges, but it allowed `http://0.0.0.0/`, which should be blocked.

Representative result:

```text
http://0.0.0.0/ => { ok: true, url: 'http://0.0.0.0/' }
```

This is a security issue for any backend service that fetches user-supplied URLs.

### 7. Live backend health check

Attempted to call:

```text
https://website-dna-extractor-production.up.railway.app/api/health
```

Result from this environment:

```text
Could not resolve host
```

I could not verify the live Railway backend from this environment because DNS/network access was unavailable. The backend is also not included in the ZIP, so a full end-to-end extraction test could not be completed.

## Release blockers

### 1. Backend code is missing from the ZIP

Severity: Critical

The frontend calls these endpoints:

```text
/api/scan-images
/api/health
/api/history
/api/status
/api/extract
/api/download
```

The docs also reference:

```text
/api/dart/health
/api/dart/extract
/api/dart/result/:jobId
```

None of the backend implementation is included. This means the core product cannot be audited, reproduced, secured, or deployed from this package.

Required fix:

- Add the full backend source.
- Add `.env.example`.
- Add Dockerfile or deployment manifest.
- Add API contract tests.
- Add endpoint level auth, rate limiting, request validation, queueing, and logging.

### 2. The web UI uses a long synchronous extraction request instead of the async job pattern

Severity: Critical

The frontend sends `/api/extract` as one long request with a 5 minute browser timeout. The Dart guide correctly specifies a two-step async job pattern: submit job, then poll result. The web UI should use the same pattern.

Current risk:

- Browser tab or network interruption loses the job.
- Reverse proxies can time out.
- Cancellation only aborts the browser request, not necessarily the backend job.
- No durable resume mechanism.
- No clean concurrency control.

Required fix:

- Replace synchronous `/api/extract` flow with `POST /api/jobs` and `GET /api/jobs/:id`.
- Add job states: queued, running, blocked, failed, complete, cancelled.
- Add persistent job records per tenant.
- Add backend cancellation.
- Return progress events or pollable progress data.

### 3. Status polling interval leaks after successful extraction

Severity: Critical

In `handleExtract`, `statusInterval` is cleared in the catch block, but not on success. After a successful extraction, the frontend can keep polling `/api/status` every 3 seconds.

Required fix:

Move `clearInterval(statusInterval)` into `finally`, guarded by existence:

```js
finally {
  if (statusInterval) clearInterval(statusInterval);
  clearTimeout(timeoutId);
  abortControllerRef.current = null;
  setLoading(false);
}
```

### 4. Frontend auth is unsafe and inconsistent

Severity: Critical

`fetchHistory` sends:

```js
'x-api-key': import.meta.env.VITE_ADMIN_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || ''
```

Any `VITE_` variable is public in a Vite frontend bundle. A Gemini key or admin key must never be exposed there.

The delete history calls do not include an auth header at all and do not check `res.ok`.

Required fix:

- Remove all secret keys from frontend environment variables.
- Use a real login/session model, such as short-lived HTTP-only secure cookies or OAuth.
- Enforce backend authorization by tenant, role, and action.
- Require CSRF protection for cookie-based write actions.
- Check `response.ok` on delete calls and show failure to the user.

### 5. URL validation is not strong enough for production scraping

Severity: Critical

Client checks are substring based. Examples:

- YouTube validation accepts any URL containing `youtube.com` or `youtu.be` in the string.
- Bio profile validation accepts any URL containing `linktr.ee`, `bit.ly`, etc., anywhere in the string.
- Server helper allowed `0.0.0.0`.

Required fix:

- Parse URLs with `new URL()`.
- Normalize missing protocol before sending to backend.
- Validate exact hostnames or approved subdomains, never substring matches.
- Use a hardened IP library such as `ipaddr.js` for IPv4, IPv6, IPv4-mapped IPv6, decimal IPs, loopback, link-local, private, multicast, documentation ranges, and metadata ranges.
- Re-resolve and revalidate on every redirect.
- Enforce maximum redirects.
- Use request timeouts and content length limits.
- Block non-http and non-https protocols.

### 6. Schema mismatch between sample API response and frontend mapping

Severity: Critical

`docs/sample_response.json` uses fields such as:

```text
logo_url
placeholder_images
button_styles
website_ctas
youtube_ctas
profile_ctas
social_media_links
```

The frontend uses fields such as:

```text
result.data.image
result.featuredImages
result.data.buttonStyles
result.buttonStyles
result.ctas
result.socialMediaLinks
```

This can lead to missing logos, missing CTAs, missing images, wrong button styles, and incomplete campaign pages.

Required fix:

- Define one canonical response schema.
- Add a backend schema validator using Zod, Joi, or JSON Schema.
- Add a frontend adapter that converts legacy response shapes into a canonical internal model.
- Add unit tests for `sample_response.json`, `.data/history.json`, and real backend responses.

### 7. AI and website text can become unsanitized HTML in campaign output

Severity: Critical

`getFinalPayloadStr` creates:

```js
const htmlDesc = descText ? `<p>${descText.replace(/\n/g, '<br>')}</p>` : '';
```

If `descText` contains malicious HTML or script payloads from a website or AI output, that payload can be stored into the Minfo campaign JSON. Whether it executes depends on how the Minfo app renders campaign descriptions, but this should be treated as a stored XSS risk.

Required fix:

- Escape plain text before wrapping in HTML.
- If HTML is allowed, sanitize with a strict allowlist using DOMPurify or a server-side sanitizer.
- Strip scripts, inline event handlers, iframes, unknown tags, unknown attributes, and javascript URLs.
- Sanitize CTA labels, brand names, and social names before rendering downstream.

### 8. Bundled `.data/history.json` contains real extraction history and operational error details

Severity: High

The ZIP includes `.data/history.json` with real URLs, Supabase public asset URLs, YouTube descriptions, and a Gemini error indicating an API key was reported as leaked.

Required fix:

- Remove `.data/history.json` from release packages.
- Add `.data/` to `.gitignore`.
- Store history in a database with tenant isolation.
- Redact provider error messages before displaying or saving them.
- Never expose raw provider errors to end users.
- Rotate any key that was ever leaked or flagged.

### 9. Dependency security is not clean

Severity: High

`xlsx@0.18.5` is a direct dependency with known high severity advisories. The app only writes Excel exports, so the risk is lower than accepting arbitrary spreadsheets, but it still fails a production audit.

Required fix:

- Replace `xlsx` with a maintained alternative if possible.
- If keeping SheetJS, use the maintained distribution path recommended by SheetJS, not the stale npm `xlsx` package.
- Dynamically import spreadsheet export code so the main bundle does not carry Excel logic for every user.
- Add CI dependency scanning.

### 10. No automated tests, no lint, no type checking

Severity: High

The core app is a 2,567 line React component with substantial business logic embedded inside UI rendering. This is not maintainable for production onboarding.

Required fix:

- Add TypeScript.
- Add ESLint and Prettier.
- Add Vitest unit tests.
- Add React Testing Library tests.
- Add Playwright end-to-end tests.
- Add schema fixture tests for campaign payload output.
- Split the app into components and pure helper modules.

### 11. Image handling is not production grade

Severity: High

The UI claims it is using generated 640 x 640 variants and scraped images, but the frontend does not independently verify dimensions, file type, public accessibility, or pairing between clean and tagged image variants.

Required fix:

- Backend must return image metadata: width, height, MIME type, bytes, source URL, processed URL, clean/tagged pair id, license status, and validation status.
- Enforce 640 x 640 JPG for Minfo placeholders.
- Reject localhost, data URLs, private bucket URLs, broken URLs, oversized images, and non-image content.
- Validate every exported image with server-side HEAD and image metadata checks.
- Add manual image approval before campaign creation.
- Add a rights confirmation checkbox for client-owned or client-authorized images.

### 12. CTA extraction needs aggressive filtering and review

Severity: High

For onboarding, bad CTAs create bad campaign pages. The sample and history data show common risks such as login links, account links, cookie buttons, register links, shorteners, and irrelevant navigation.

Required fix:

- Classify CTA candidates into purchase, booking, contact, subscribe, social, support, login, cookie, navigation, legal, and unknown.
- Default-select only high-confidence action CTAs.
- De-select cookie consent, login, privacy, careers, generic navigation, and internal anchor links.
- Flag external domains and URL shorteners.
- Require client approval for all final CTAs.
- Cap the number of default CTAs for a clean Minfo page.

### 13. Production API base URL is hardcoded and scanner endpoint is inconsistent

Severity: High

`API_BASE_URL` is hardcoded to the Railway production URL for non-local environments. The Scanner tab separately uses:

```js
const API_BASE = import.meta.env.VITE_API_URL || '';
```

This can cause the Dashboard scan to call Railway while the Scanner tab calls the current web origin.

Required fix:

- Use one runtime config source.
- Support dev, staging, and production API URLs.
- Fail visibly if the API base URL is not configured.
- Remove hardcoded production URLs from source.

### 14. Frontend generates final Minfo payload without backend validation

Severity: High

The browser creates the final campaign JSON. That makes it easy to generate invalid payloads and difficult to enforce schema, security, and field-level provenance.

Required fix:

- Move final payload generation and validation to the backend.
- Frontend sends approved selections and edits.
- Backend returns a validated campaign draft.
- Backend records provenance for every field.
- Backend enforces schema, limits, sanitization, and required fields.

### 15. No tenant, client, or audit model

Severity: High

For client onboarding, every extraction should belong to a client, workspace, campaign draft, and authorised team member. The current model appears to use global history and local UI state.

Required fix:

- Add tenants/workspaces.
- Add client profiles.
- Add campaign draft records.
- Add field-level audit trail.
- Add who approved what and when.
- Add retention and deletion controls.
- Add role-based access: admin, editor, reviewer, client approver.

## Important non-blocking improvements

### 16. Bundle size is too high for the initial dashboard

The production build emits a 529 kB JS file before gzip. The biggest obvious improvement is moving `xlsx` into a dynamic import used only when the export button is clicked.

### 17. Accessibility needs work

Several navigation items and image cards are clickable `div`s. This weakens keyboard access and screen reader support.

Fixes:

- Use real `<button>` elements.
- Add labels and `aria-pressed` where appropriate.
- Ensure keyboard selection for images and CTAs.
- Add visible focus states.
- Validate 48 x 48 point tap targets.
- Validate colour contrast after extracted colours are applied.

### 18. Settings controls are decorative

The Settings checkboxes for Vertex AI Outpainting, lazy loading, and raw HTML snapshot are uncontrolled and not connected to extraction requests.

Fix:

- Either wire them into backend extraction options or remove them from production.

### 19. Error messages are too raw for clients

The current UI exposes operational detail, provider names, raw snippets, and backend hints. This is useful for developers, but unsafe for client onboarding.

Fix:

- Split errors into user-safe messages and internal diagnostic logs.
- Use correlation IDs.
- Show clients a clear action, not raw stack-like data.

### 20. History deletion UX is optimistic without verification

The UI removes history locally after DELETE without checking whether the backend succeeded.

Fix:

- Check `res.ok`.
- Show success or failure toast.
- Refresh history after deletion.
- Add undo where appropriate.

### 21. Use of Google favicon service leaks outbound lookups

The frontend constructs favicon URLs through Google. This is convenient, but sends domain lookups to Google.

Fix:

- Prefer backend favicon extraction and caching.
- Store approved favicons in your own asset store.

### 22. Legal and compliance guardrails are missing

The tool scrapes public websites and images, then repackages them for Minfo campaign pages. For real clients, you need explicit permission.

Fix:

- Add client confirmation: “I confirm I own or am authorised to use the website content, images, logos, and links selected for this campaign.”
- Store this confirmation in the audit trail.
- Add robots and terms-aware scraping policy if extracting from non-client sites.

## Recommended target architecture

### Web onboarding workflow

1. User selects or creates a client workspace.
2. User enters website, YouTube URL, and profile link.
3. Backend validates and normalizes every URL.
4. Backend creates extraction job.
5. Worker queue performs scraping, image extraction, AI summarisation, CTA classification, and asset processing.
6. Backend stores raw extraction, processed assets, and field-level provenance.
7. UI shows a review screen with confidence scores.
8. User edits summaries, CTAs, colours, images, logo, and social links.
9. Backend validates final campaign draft against Minfo schema.
10. User approves campaign draft.
11. Campaign page is created or exported.
12. Audit log records the full path from source to approval.

### Backend services

- API service: auth, tenant checks, job creation, draft management.
- Worker service: Puppeteer scraping, image processing, AI calls, Supabase uploads.
- Queue: BullMQ, Cloud Tasks, or equivalent.
- Database: Supabase Postgres or equivalent.
- Storage: Supabase Storage or equivalent with signed or public approved assets.
- Observability: structured logs, correlation IDs, job traces, error dashboards.

### Data model minimum

- users
- workspaces
- clients
- extraction_jobs
- extraction_sources
- extracted_assets
- extracted_ctas
- extracted_social_links
- campaign_drafts
- campaign_draft_versions
- approvals
- audit_events

## Minimum production test suite

### Unit tests

1. URL normalization and validation.
2. Bio profile host allowlist.
3. YouTube URL parsing.
4. Wayback URL cleaning.
5. CTA type inference.
6. CTA filtering.
7. Social category mapping.
8. Button shape enum mapping.
9. Colour contrast validation.
10. Campaign payload generation.
11. HTML sanitization.
12. Image public URL validation.
13. 640 x 640 image metadata validation.

### Integration tests

1. Submit website-only extraction job.
2. Submit website plus YouTube extraction job.
3. Submit profile-only extraction job.
4. Submit invalid URL.
5. Submit private IP URL.
6. Submit URL that redirects to private IP.
7. Submit slow website.
8. Submit website with lazy-loaded images.
9. Submit website with cookie banner.
10. Submit website with no images.
11. Submit website with hostile HTML.
12. Submit website with broken image URLs.

### End-to-end tests

1. New client onboarding from URLs to approved campaign draft.
2. Manual edit of summary, CTAs, colours, and images.
3. Export final JSON.
4. Export Excel.
5. Delete history with auth.
6. Cancel extraction job.
7. Resume extraction result after page refresh.
8. Verify no secret appears in frontend bundle.
9. Verify image URLs are public and valid.
10. Verify imported campaign renders safely in Minfo app.

## Priority implementation plan

### Phase 1: Make it buildable and safe

1. Remove `node_modules`, `dist`, and `.data` from release package.
2. Add `.gitignore`.
3. Add backend source or separate backend repo reference with exact commit.
4. Add `npm ci` build flow.
5. Add lint, test, and typecheck scripts.
6. Remove all `VITE_` secrets.
7. Fix status interval leak.
8. Replace hardcoded API URL with environment config.
9. Fix URL validation.
10. Add schema adapter and tests.

### Phase 2: Make extraction production-grade

1. Convert web extraction to async jobs.
2. Add queue and durable job records.
3. Add auth, tenant isolation, and rate limits.
4. Add backend payload generation and validation.
5. Add HTML sanitization.
6. Add image metadata validation.
7. Add CTA classifier and review defaults.
8. Add structured logging and correlation IDs.

### Phase 3: Make onboarding client-ready

1. Add client workspace flow.
2. Add field-level provenance and confidence scores.
3. Add client approval workflow.
4. Add asset rights confirmation.
5. Add audit trail and draft versioning.
6. Add production monitoring.
7. Add regression fixture suite with real-world sites.

## Summary

This app has a strong prototype direction, especially the review UI, image picker concept, Excel export, and final campaign JSON intent. But it is currently too fragile for production onboarding because the core backend is missing, the web flow is not durable, URL validation is insufficient, secrets/auth are unsafe, schemas are inconsistent, final HTML is not sanitized, and there is no automated test coverage.

The correct path is not to polish the current monolithic frontend. The correct path is to harden the product around an authenticated, tenant-aware, async extraction and review workflow where the backend owns validation, sanitization, schema enforcement, image processing, and auditability.
