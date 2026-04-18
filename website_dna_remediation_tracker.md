# Website DNA Extractor v2 - Consolidated Remediation Tracker

## Purpose

This document consolidates the full review into one numbered tracker covering:

- production blockers
- security fixes
- logic bugs
- scraper reliability improvements
- data model and API fixes
- frontend issues
- operational hardening
- image extraction and 640x640 asset generation recommendations

Use the item numbers as permanent references in tickets, commits, QA notes, and release reviews.

## Status key

- **Open**: not started
- **In Progress**: being worked on
- **Blocked**: cannot proceed until dependency or decision is resolved
- **Done**: implemented and verified
- **Deferred**: intentionally postponed

## Severity key

- **P0**: hard blocker for production
- **P1**: serious issue that should be fixed before broader rollout
- **P2**: important improvement
- **P3**: nice to have or optimization

---

## A. Production blockers and security fixes

### 1. Remove public exposure of local outputs directory
- **Severity**: P0
- **Status**: Open
- **Area**: Backend / Security
- **Issue**: The server exposes `/outputs` statically, which makes fallback files and generated assets directly browsable.
- **Risk**: Extraction history and local artifacts can be accessed without authorization.
- **Required fix**:
  - Remove static serving of `/outputs` in production.
  - Serve only explicitly approved files through controlled endpoints.
  - Keep local artifacts private on disk.
- **Acceptance criteria**:
  - `/outputs/*` is not publicly reachable in production.
  - No extraction history file can be downloaded directly.

### 2. Remove public local history fallback as a production storage path
- **Severity**: P0
- **Status**: Open
- **Area**: Backend / Data handling
- **Issue**: When Supabase history fails, the app writes to `outputs/history.json`.
- **Risk**: Production data becomes dependent on local disk and can be leaked or corrupted.
- **Required fix**:
  - Disable local JSON history fallback in production.
  - Fail clearly if database persistence is unavailable.
  - Keep local fallback only for local development if needed.
- **Acceptance criteria**:
  - Production mode never writes history to public or semi-public local files.
  - Failure to persist history returns a clear, non-false-success response.

### 3. Add authentication and authorization for history endpoints
- **Severity**: P0
- **Status**: Open
- **Area**: API / Security
- **Issue**: History read and delete operations are exposed without proper auth.
- **Risk**: Anyone can inspect or delete extraction records.
- **Required fix**:
  - Require authenticated access.
  - Scope records to the current user or tenant.
  - Log delete actions.
- **Acceptance criteria**:
  - Anonymous requests to history endpoints are rejected.
  - Users can only access their own data.

### 4. Fix local file traversal in `/api/download`
- **Severity**: P0
- **Status**: Open
- **Area**: API / Security
- **Issue**: The download proxy allows local path handling that can be escaped with traversal patterns.
- **Risk**: Arbitrary file read from the server.
- **Required fix**:
  - Remove local path proxying from `/api/download`.
  - Restrict to an allowlist of external domains only.
  - Canonicalize and validate paths if local serving is ever retained in dev.
- **Acceptance criteria**:
  - `..` traversal attempts are rejected.
  - Only approved remote hosts can be proxied.

### 5. Add SSRF protection for all user supplied URLs
- **Severity**: P0
- **Status**: Open
- **Area**: Scraper / Security
- **Issue**: User-provided URLs are fetched without blocking localhost, private ranges, metadata endpoints, or internal hostnames.
- **Risk**: Server-side request forgery and internal network exposure.
- **Required fix**:
  - Resolve DNS and reject private, loopback, link-local, and reserved address ranges.
  - Block cloud metadata IPs and internal hostnames.
  - Re-check after redirects.
- **Acceptance criteria**:
  - Requests to `localhost`, `127.0.0.1`, `169.254.169.254`, RFC1918 ranges, and similar internal targets are blocked.
  - Redirect chains cannot bypass SSRF controls.

### 6. Remove dangerous browser launch flags
- **Severity**: P0
- **Status**: Open
- **Area**: Scraper runtime / Security
- **Issue**: Browser launch includes risky flags such as `--no-sandbox`, `--disable-web-security`, and `--ignore-certificate-errors`.
- **Risk**: Untrusted content runs with unnecessarily weak protections.
- **Required fix**:
  - Remove unsafe flags by default.
  - Use the minimum necessary launch configuration.
  - If any unsafe flag is needed for dev, isolate it behind an explicit development-only switch.
- **Acceptance criteria**:
  - Production browser launch avoids unsafe flags unless formally justified.
  - Security review documents any exceptions.

### 7. Stop returning false-success extraction responses
- **Severity**: P0
- **Status**: Open
- **Area**: API / Error handling
- **Issue**: Some extractor stages return `{ error: ... }` objects instead of throwing, and the API can still return `success: true`.
- **Risk**: Bad or partial extractions look successful and poison downstream data.
- **Required fix**:
  - Standardize stage failure handling.
  - Treat stage-level fatal errors as request failures.
  - Return structured partial-success only when explicitly intended and labeled.
- **Acceptance criteria**:
  - Failed extraction cannot surface as `success: true`.
  - Partial results are clearly marked and explain what failed.

### 8. Align Supabase schema, SQL, and runtime expectations
- **Severity**: P0
- **Status**: Open
- **Area**: Data layer
- **Issue**: Setup SQL and runtime expectations are not fully aligned, which pushes the app into fallback behavior.
- **Risk**: Broken persistence, inconsistent environments, avoidable fallback activation.
- **Required fix**:
  - Review `supabase_setup.sql` against runtime insert/select usage.
  - Add schema validation at startup.
  - Fail fast when required tables or columns are missing.
- **Acceptance criteria**:
  - Fresh setup works without local fallback.
  - Startup health check identifies missing schema clearly.

---

## B. Image extraction and asset generation recommendations

### 9. Remove full-page screenshot slicing as an image generation fallback
- **Severity**: P0
- **Status**: Open
- **Area**: Image pipeline
- **Issue**: When no scraped image URLs are found, the code slices the full-page screenshot and resizes it to 640x640.
- **Risk**: Final campaign assets contain text, buttons, headers, and messy page layouts instead of product or brand imagery.
- **Required fix**:
  - Remove the full-page screenshot slicing fallback from `extractor.js`.
  - Do not generate square assets from whole-page screenshots.
- **Acceptance criteria**:
  - No 640x640 image is ever created from a full-page screenshot.
  - If no valid image asset exists, the app skips image generation or uses a controlled branded fallback.

### 10. Change image pipeline priority to image-first extraction
- **Severity**: P0
- **Status**: Open
- **Area**: Image pipeline
- **Issue**: The current pipeline can fall back too early to screenshot-based processing.
- **Required fix**:
  - Enforce this order:
    1. direct website image URL
    2. direct background-image URL
    3. screenshot of exact image element only
    4. branded or generated fallback
    5. never full-page screenshot slicing
- **Acceptance criteria**:
  - Extracted image URLs are always preferred over page screenshots.
  - Screenshot fallback is image-element-only.

### 11. Restrict screenshot fallback to the exact image element only
- **Severity**: P0
- **Status**: Open
- **Area**: Image pipeline / Puppeteer
- **Issue**: The fallback element lookup is too broad and can target sections or containers containing text.
- **Required fix**:
  - Limit screenshot fallback to `<img>` elements only.
  - Avoid screenshotting `div` or `section` wrappers unless the wrapper is provably image-only.
- **Acceptance criteria**:
  - Fallback screenshots contain only the image asset and not CTA text or navigation.

### 12. Reject logos, icons, avatars, sprites, placeholders, and tracking images from content-image candidates
- **Severity**: P1
- **Status**: Closed (Fixed)
- **Area**: Image selection
- **Issue**: Candidate image collection is too permissive.
- **Risk**: Small brand marks or decorative images get promoted to primary 640x640 outputs.
- **Required fix**:
  - Strengthen URL and metadata filtering.
  - Exclude likely non-content assets by filename, alt text, classes, IDs, size, and parent context.
- **Acceptance criteria**:
  - Logos and small utility graphics are not selected as primary featured images.

### 13. Filter out images from header, nav, and footer contexts
- **Severity**: P1
- **Status**: Closed (Fixed)
- **Area**: Image selection
- **Issue**: Images from layout chrome can be selected.
- **Required fix**:
  - Exclude assets inside or near header, nav, and footer containers.
- **Acceptance criteria**:
  - Header logo and menu assets are not treated as campaign imagery.

### 14. Add minimum size thresholds for image candidates
- **Severity**: P1
- **Status**: Closed (Fixed)
- **Area**: Image selection
- **Issue**: Small images can still pass through.
- **Required fix**:
  - Require meaningful width and height thresholds, for example 300x300 minimum for primary candidates.
- **Acceptance criteria**:
  - Tiny images cannot be selected as hero or featured assets.

### 15. Add aspect ratio filtering for content-image candidates
- **Severity**: P1
- **Status**: Closed (Fixed)
- **Area**: Image selection
- **Issue**: Extreme banners and slivers can be selected and cropped poorly.
- **Required fix**:
  - Reject ultra-wide or ultra-tall assets unless there is a strong reason to keep them.
- **Acceptance criteria**:
  - Image candidates have a sensible aspect ratio range for square conversion.

### 16. Prefer direct background-image URL extraction over section screenshots
- **Severity**: P1
- **Status**: Open
- **Area**: Image extraction
- **Issue**: CSS background images may be represented by screenshotting their section rather than extracting the actual image URL.
- **Required fix**:
  - Parse `background-image` URLs directly and download those assets when possible.
  - Skip if the section contains text overlays and the raw asset cannot be isolated.
- **Acceptance criteria**:
  - Background art is sourced from real image URLs wherever possible.

### 17. Generate exactly two publishable variants from the chosen base asset
- **Severity**: P1
- **Status**: Open
- **Area**: Image generation
- **Issue**: The intended output should be consistent and predictable.
- **Required fix**:
  - For each selected image asset, create:
    - one clean 640x640 image
    - one tagged 640x640 image with tagline overlay
- **Acceptance criteria**:
  - Every selected image produces a matched clean and tagged pair.

### 18. Ensure the clean variant never contains overlaid site text
- **Severity**: P1
- **Status**: Open
- **Area**: Image quality
- **Issue**: Current screenshot-derived inputs can carry page text into the clean version.
- **Required fix**:
  - Clean variant must originate from an extracted image asset or exact image-element screenshot only.
- **Acceptance criteria**:
  - Clean outputs contain no navigation, CTA copy, hero copy, or browser chrome.

### 19. Add tagline overlay rules for the tagged version
- **Severity**: P1
- **Status**: Open
- **Area**: Image generation / Design
- **Issue**: Tagline treatment should be consistent.
- **Required fix**:
  - Apply overlay in a safe zone.
  - Use padding and contrast rules.
  - Prevent text from obscuring the focal subject.
  - Use brand-safe typography and color treatment.
- **Acceptance criteria**:
  - Tagged images remain legible and visually balanced.

### 20. Add image ranking based on content relevance, not only size
- **Severity**: P2
- **Status**: Open
- **Area**: Image selection
- **Issue**: Area alone is not enough to choose the best asset.
- **Required fix**:
  - Score images by a mix of:
    - size
    - centrality or prominence
    - semantic relevance
    - exclusion signals
    - duplication detection
- **Acceptance criteria**:
  - Selected featured images are visibly more representative of the brand or product.

### 21. Add duplicate and near-duplicate image suppression
- **Severity**: P2
- **Status**: Open
- **Area**: Image selection
- **Issue**: Similar or repeated assets may be selected multiple times.
- **Required fix**:
  - Deduplicate by normalized URL plus perceptual similarity when possible.
- **Acceptance criteria**:
  - Featured image sets do not contain obvious duplicates.

### 22. Add a fallback branded placeholder instead of page screenshot slicing
- **Severity**: P2
- **Status**: Open
- **Area**: Image pipeline
- **Issue**: When a site truly lacks usable images, the fallback should still be controlled.
- **Required fix**:
  - Use a neutral branded placeholder or generated fallback asset.
  - Label it clearly as fallback.
- **Acceptance criteria**:
  - No poor-quality page screenshots become campaign assets.

### 23. Pass only processed image URLs into JSON export
- **Severity**: P1
- **Status**: Open
- **Area**: JSON export
- **Issue**: Raw site image URLs and processed asset URLs should be kept conceptually separate.
- **Required fix**:
  - Only selected processed featured image URLs should populate `productImages[].image_url`.
- **Acceptance criteria**:
  - JSON export references only public, final, ready-to-use image assets.

### 24. Preserve raw extracted image list separately for review
- **Severity**: P2
- **Status**: Open
- **Area**: UX / Debugging
- **Issue**: Operators need to inspect what was found before final selection.
- **Required fix**:
  - Keep raw image candidates available in the UI or debug payload.
  - Keep processed featured assets as a separate list.
- **Acceptance criteria**:
  - Users can distinguish raw site assets from final 640x640 outputs.

---

## C. Scraper reliability and logic fixes

### 25. Fix YouTube fallback control flow
- **Severity**: P0
- **Status**: Open
- **Area**: YouTube extraction
- **Issue**: The documented fallback to scraping when the API key is missing or quota is exhausted does not consistently run.
- **Required fix**:
  - Throw or signal failure in a way that reaches the fallback path.
  - Test no-key, quota-exceeded, and malformed-channel cases.
- **Acceptance criteria**:
  - Fallback scraping runs when API extraction is unavailable.

### 26. Standardize error handling across extractor stages
- **Severity**: P1
- **Status**: Open
- **Area**: Backend / Reliability
- **Issue**: Some functions throw, others return `{ error }`, others silently continue.
- **Required fix**:
  - Define one error contract.
  - Distinguish fatal, recoverable, and optional-stage failures.
- **Acceptance criteria**:
  - Error handling is consistent and predictable across all extraction stages.

### 27. Normalize URLs server-side before extraction
- **Severity**: P1
- **Status**: Closed (Fixed)
- **Area**: API / Validation
- **Issue**: The frontend can validate a bare domain, but the raw unnormalized string can still reach the backend.
- **Risk**: Avoidable extraction failures.
- **Required fix**:
  - Normalize and canonicalize URLs server-side.
  - Add protocol if missing.
  - Reject malformed input early.
- **Acceptance criteria**:
  - `example.com` becomes a valid canonical URL before scraping.

### 28. Add strict input validation for all extraction request fields
- **Severity**: P1
- **Status**: Closed (Fixed)
- **Area**: API
- **Issue**: Input validation is not strict enough.
- **Required fix**:
  - Validate website URL, YouTube URL, profile URL, and any optional flags using a schema validator.
- **Acceptance criteria**:
  - Invalid inputs return clean 4xx errors with clear messages.

### 29. Improve request interception safety and predictability
- **Severity**: P1
- **Status**: Open
- **Area**: Browser automation
- **Issue**: Naive interception logic can create races or broken resource loading.
- **Required fix**:
  - Review interception handlers for consistent synchronous handling.
  - Avoid double-handling requests.
- **Acceptance criteria**:
  - Resource filtering does not deadlock or randomly break page rendering.

### 30. Revisit page readiness strategy
- **Severity**: P1
- **Status**: Open
- **Area**: Scraper logic
- **Issue**: Current wait conditions may not be reliable for modern JS-heavy websites.
- **Required fix**:
  - Add a stable readiness strategy that combines navigation, idle checks, image presence, and time caps.
- **Acceptance criteria**:
  - Extraction is more stable across React, Vite, Shopify, WordPress, and heavily scripted sites.

### 31. Add retry logic with bounded backoff for fragile stages
- **Severity**: P1
- **Status**: Open
- **Area**: Reliability
- **Issue**: Transient browser and network failures can fail the job prematurely.
- **Required fix**:
  - Add bounded retries for navigation, image fetch, and AI enrichment calls.
  - Avoid infinite or unbounded retry loops.
- **Acceptance criteria**:
  - Temporary network hiccups do not collapse the full extraction unnecessarily.

### 32. Add robust redirect tracking and final URL capture
- **Severity**: P2
- **Status**: Open
- **Area**: Scraper logic
- **Issue**: Redirect resolution and canonical URL behavior should be more explicit.
- **Required fix**:
  - Track initial URL, redirected URL, canonical URL, and extraction source.
- **Acceptance criteria**:
  - Final payload clearly states what was requested and what was actually scraped.

### 33. Make fallback chain explicit in the response payload
- **Severity**: P2
- **Status**: Open
- **Area**: API / Debugging
- **Issue**: It is hard to tell whether results came from live site, Wayback, lightweight fetch, or partial fallback.
- **Required fix**:
  - Include extraction mode and fallback path in the response.
- **Acceptance criteria**:
  - QA can identify which fallback was used for each run.

---

## D. Frontend bugs and UX fixes

### 34. Fix cancel and abort behavior in the extraction UI
- **Severity**: P1
- **Status**: Closed (Fixed)
- **Area**: Frontend
- **Issue**: The abort controller lifecycle is unreliable.
- **Required fix**:
  - Persist the controller safely across renders.
  - Ensure cancel always aborts the active request.
- **Acceptance criteria**:
  - Clicking cancel reliably stops the extraction request.

### 35. Distinguish raw extracted images from processed featured images in the UI
- **Severity**: P1
- **Status**: Open
- **Area**: Frontend / UX
- **Issue**: Users can confuse scraped site images with final 640x640 output assets.
- **Required fix**:
  - Label sections clearly:
    - Raw website images
    - Processed featured images
    - Selected export images
- **Acceptance criteria**:
  - Users can clearly understand which image list feeds the JSON export.

### 36. Add clearer extraction-state messaging
- **Severity**: P2
- **Status**: Open
- **Area**: Frontend
- **Issue**: Users are not clearly told what stage is running or failed.
- **Required fix**:
  - Surface stage states such as crawling, image extraction, AI verification, storage upload, and history save.
- **Acceptance criteria**:
  - Users can tell where a job failed without reading logs.

### 37. Add better empty-state and partial-result messaging
- **Severity**: P2
- **Status**: Open
- **Area**: Frontend
- **Issue**: Empty or partial payloads can look like bugs instead of controlled outcomes.
- **Required fix**:
  - Explain when no valid images were found.
  - Explain when YouTube data was partial.
- **Acceptance criteria**:
  - Empty states are intentional and understandable.

---

## E. Data, storage, and export integrity

### 38. Add startup validation for required environment variables
- **Severity**: P1
- **Status**: Open
- **Area**: Backend / Config
- **Issue**: Missing configuration can surface late during runtime.
- **Required fix**:
  - Validate required env vars at startup.
  - Differentiate required-for-core and optional-for-enhancement variables.
- **Acceptance criteria**:
  - The app fails fast on missing critical configuration.

### 39. Tighten public URL handling for stored assets
- **Severity**: P1
- **Status**: Open
- **Area**: Storage
- **Issue**: Public asset URL generation should be controlled and validated.
- **Required fix**:
  - Ensure only valid uploaded assets become exportable public URLs.
  - Reject broken or incomplete asset references.
- **Acceptance criteria**:
  - Export JSON never contains dead or malformed asset URLs.

### 40. Validate JSON export before file generation
- **Severity**: P1
- **Status**: Open
- **Area**: Export builder
- **Issue**: Export payload should be schema-checked before download.
- **Required fix**:
  - Add schema validation for Minfo campaign JSON.
- **Acceptance criteria**:
  - Invalid export structure cannot be downloaded silently.

### 41. Preserve model order and image selection deterministically
- **Severity**: P2
- **Status**: Open
- **Area**: Export logic
- **Issue**: Selected image ordering should be stable and predictable.
- **Required fix**:
  - Ensure image order is deterministic and based on explicit selection state.
- **Acceptance criteria**:
  - Same selection yields the same `modelorder` consistently.

---

## F. Operational hardening and scalability

### 42. Replace browser-per-request architecture with a managed concurrency model
- **Severity**: P1
- **Status**: Open
- **Area**: Architecture
- **Issue**: Launching a new browser for every request is resource-heavy and fragile.
- **Required fix**:
  - Move to a worker queue or managed pool.
  - Reuse browser instances safely through isolated contexts.
- **Acceptance criteria**:
  - Concurrent traffic does not cause avoidable browser churn or memory spikes.

### 43. Add job queue and backpressure controls
- **Severity**: P1
- **Status**: Open
- **Area**: Operations
- **Issue**: Rate limiting alone is not enough to protect the service under load.
- **Required fix**:
  - Introduce queueing, concurrency caps, and resource-aware execution.
- **Acceptance criteria**:
  - The app degrades gracefully under load instead of crashing or timing out widely.

### 44. Reduce health endpoint leakage
- **Severity**: P1
- **Status**: Open
- **Area**: Security / Ops
- **Issue**: Health output may reveal too much configuration or environment state.
- **Required fix**:
  - Keep public health responses minimal.
  - Expose detailed health only to internal or authenticated contexts.
- **Acceptance criteria**:
  - Public health response reveals only safe uptime/readiness info.

### 45. Tighten CORS configuration
- **Severity**: P1
- **Status**: Open
- **Area**: Security
- **Issue**: Origin matching is too loose.
- **Required fix**:
  - Use exact origin allowlists.
  - Avoid substring-based acceptance.
- **Acceptance criteria**:
  - Unapproved origins are rejected reliably.

### 46. Add structured logging and correlation IDs
- **Severity**: P2
- **Status**: Open
- **Area**: Observability
- **Issue**: Logging is inconsistent and hard to trace per job.
- **Required fix**:
  - Use structured logger everywhere.
  - Add request ID or job ID to each log line.
- **Acceptance criteria**:
  - One extraction can be traced end to end in logs.

### 47. Add retention and cleanup policy for generated assets and history
- **Severity**: P2
- **Status**: Open
- **Area**: Storage / Ops
- **Issue**: Assets and history can accumulate without lifecycle control.
- **Required fix**:
  - Define retention for logs, history, screenshots, and generated images.
- **Acceptance criteria**:
  - Old data is cleaned up predictably.

---

## G. Documentation and project hygiene

### 48. Remove documentation drift between README, spec, and runtime
- **Severity**: P1
- **Status**: Open
- **Area**: Docs
- **Issue**: Some documented dependencies or flows do not match runtime behavior.
- **Required fix**:
  - Reconcile README, markdown spec, environment docs, and source.
  - Remove unused dependency references.
- **Acceptance criteria**:
  - Setup docs accurately reflect what the code actually needs.

### 49. Mark optional integrations clearly
- **Severity**: P2
- **Status**: Open
- **Area**: Docs / Config
- **Issue**: Optional services are not clearly separated from required services.
- **Required fix**:
  - Distinguish required, optional, and future integrations.
- **Acceptance criteria**:
  - Developers know exactly what is required to get a working install.

### 50. Add a formal threat model and production deployment checklist
- **Severity**: P2
- **Status**: Open
- **Area**: Security / Release
- **Issue**: Production release currently lacks a formal hardening checklist.
- **Required fix**:
  - Document SSRF, traversal, auth, rate limit, storage, and browser-isolation protections.
  - Add release signoff checklist.
- **Acceptance criteria**:
  - Production deployment requires explicit review and signoff of security controls.

---

## H. Recommended implementation order

### Phase 1 - Must fix before production exposure
1. Item 1
2. Item 2
3. Item 3
4. Item 4
5. Item 5
6. Item 6
7. Item 7
8. Item 8
9. Item 9
10. Item 10
11. Item 11
12. Item 25

### Phase 2 - Must fix before broader rollout
13. Item 12
14. Item 13
15. Item 14
16. Item 15
17. Item 16
18. Item 17
19. Item 18
20. Item 19
21. Item 23
22. Item 27
23. Item 28
24. Item 29
25. Item 30
26. Item 31
27. Item 34
28. Item 35
29. Item 38
30. Item 39
31. Item 40
32. Item 42
33. Item 43
34. Item 44
35. Item 45
36. Item 48

### Phase 3 - Important hardening and refinement
37. Item 20
38. Item 21
39. Item 22
40. Item 24
41. Item 32
42. Item 33
43. Item 36
44. Item 37
45. Item 41
46. Item 46
47. Item 47
48. Item 49
49. Item 50

---

## I. Suggested ticket template for each item

```md
### [Item Number] [Short title]
- Severity:
- Status:
- Owner:
- Branch / PR:
- Summary:
- Files touched:
- Decision notes:
- QA steps:
- Result:
```

---

## J. Release gate recommendation

Do **not** call this production-ready until all Phase 1 items are completed and verified.

Do **not** call the image pipeline complete until Items 9 through 19 and 23 are completed and verified against multiple site types, including:

- image-rich ecommerce sites
- sites with CSS background heroes
- sites with lazy-loaded images
- sites with no useful hero imagery
- sites with text-heavy hero sections
- sites where the only meaningful imagery appears below the fold

