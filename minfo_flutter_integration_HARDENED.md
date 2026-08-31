# Minfo Flutter ↔ DNA Extractor — **Hardened Integration Plan**

> Synthesis of four parallel specialist reviews (Flutter, API, QC/SRE, Security) of the original `minfo_flutter_integration.md`. Findings are prioritized P0–P3. P0/P1 must ship before public release.

---

## Executive summary — top issues to fix before ship

| # | Severity | Issue | One-line fix |
|---|---|---|---|
| 1 | P0 sec | `DART_API_KEY` is compiled into the binary; obfuscation does not hide it | Remove the shared key. Mint short-lived per-user JWTs (5 min, `aud=dart`, `sub=user_id`) from the Minfo backend, or proxy DNA calls through Minfo |
| 2 | P0 sec | SSRF — server fetches any URL the user submits | Server-side allowlist: reject private IP ranges, link-local, `localhost`, `file://`, `data:`, `gopher://` etc. |
| 3 | P0 sec | Stored XSS via `'<p>${description}</p>'` | Don't build HTML on client. Send plain text; let Minfo render-time sanitize |
| 4 | P0 bug | `DnaResult.fromJson` will throw `CastError` on malformed/missing fields, blowing up the whole flow | Defensive parsing — `whereType<String>()`, null-guards, per-item try/catch |
| 5 | P0 bug | Polling has no cancellation token; widget can be disposed while a Future is in-flight → setState-after-dispose / memory leak | Convert to `Stream<DnaJobStatus>` + `CancelToken`; tear down in `dispose()` |
| 6 | P0 bug | `String.fromEnvironment('DART_API_KEY')` defaults to `''` so missing build flag silently sends `Authorization: Bearer ` (401 storm) | `assert(_apiKey.isNotEmpty)` in service constructor + CI check |
| 7 | P0 bug | `socialCategoryId` uses `.contains()` → `myinstagram-fanclub.com` is classified as Instagram | Use `Uri.parse(url).host.endsWith('instagram.com')` and exact-host map |
| 8 | P1 api | No idempotency key on `POST /extract` — double-tap = double-billed job | Client generates `Idempotency-Key: <uuid v4>`, server caches 24 h |
| 9 | P1 api | No `DELETE /api/dart/job/{job_id}` — server keeps billing after client times out at 3 min | Add cancel endpoint, call it on timeout / user back-press |
| 10 | P1 ops | No remote kill-switch for the "Import from Website" button | Feature flag fetched at app start; can disable without store release |

---

## 1. Critical Dart/Flutter bugs

### 1.1 Null-safety holes
- `DnaResult` declares `name`, `logoUrl`, `screenshotUrl`, `campaignDescription` as `String?` but marks them `required`. In `buildMinfoPayload()` `d.name` is then assigned to `'name'` (5 places) where the Minfo API expects a non-null string. **Fix:** every `d.name` use becomes `d.name ?? Uri.parse(websiteUrl).host`.
- `j['data'] as Map<String, dynamic>` (line 121) — if status is `complete` but `data` is missing, this crashes. Guard: `if (json['data'] is! Map) throw DnaException('No result payload');`.
- `j['status'] as String` (line 115) — same pattern. Validate it exists and is a known enum before switching.
- `campaignDescription: j['campaign_description'] ?? j['website_summary']` — falls through to `null` but downstream wraps it in `<p>$desc</p>` producing `<p>null</p>`. Fall back to `''`.

### 1.2 Defensive JSON parsing
Replace every `(j['x'] as List? ?? []).cast<String>()` with `whereType<String>().toList()`, and every `.map((b) => DnaButtonStyle.fromJson(b as Map<String, dynamic>))` with a guarded variant:

```dart
buttonStyles: (j['button_styles'] as List? ?? [])
    .whereType<Map>()
    .map((m) => Map<String, dynamic>.from(m))
    .map((m) {
      try { return DnaButtonStyle.fromJson(m); }
      catch (e, st) { _log.warn('button_style parse failed', e, st); return null; }
    })
    .whereType<DnaButtonStyle>()
    .toList(),
```

### 1.3 HTTP client lifecycle
The plan uses `package:http` top-level functions (`http.post`, `http.get`). **Each call opens a fresh `IOClient` → fresh TLS handshake.** 36 polls = 36 handshakes. Replace with:
- A single injected `http.Client` (or `dio` instance) cached for the service's lifetime.
- Use `cronet_http` on Android and `cupertino_http` on iOS for native HTTP/2 and connection reuse.
- Wire a centralised error/logging/auth/retry interceptor.

### 1.4 Polling correctness — convert Future → Stream + CancelToken
Replace `pollUntilComplete` with a stream the UI subscribes to and cancels in `dispose()`:

```dart
Stream<DnaJobStatus> watchJob(String jobId, {http.Client? client, CancelToken? cancel}) async* {
  client ??= _client;
  Duration backoff = const Duration(seconds: 2);
  final deadline = DateTime.now().add(_timeout);

  while (DateTime.now().isBefore(deadline)) {
    cancel?.throwIfCancelled();
    final res = await client.get(_resultUri(jobId), headers: _headers).timeout(_httpTimeout);
    if (res.statusCode == 429) {
      final retry = int.tryParse(res.headers['retry-after'] ?? '') ?? 30;
      await Future<void>.delayed(Duration(seconds: retry));
      continue;
    }
    final body = _safeJson(res.body);
    final status = body?['status'] as String?;
    yield DnaJobStatus.fromJson(body ?? {});
    if (status == 'complete') return;
    if (status == 'failed' || status == 'cancelled') {
      throw DnaException(body?['detail'] as String? ?? 'Extraction $status');
    }
    // Honour Retry-After if server provides it; otherwise exponential backoff capped at 10 s.
    final retryAfter = int.tryParse(res.headers['retry-after'] ?? '');
    final wait = retryAfter != null ? Duration(seconds: retryAfter) : backoff;
    backoff = Duration(milliseconds: (backoff.inMilliseconds * 1.5).round().clamp(2000, 10000));
    await Future<void>.delayed(wait);
  }
  throw DnaException('Extraction timed out after ${_timeout.inSeconds}s');
}
```

Key changes:
- **Poll immediately, then back off** (current code waits 5 s before the *first* request).
- **Adaptive backoff** capped at 10 s — 36 calls becomes ~12.
- **`Retry-After` header respected** for 429 and running responses.
- **Cancellable** via `CancelToken`.
- **JSON decode in isolate** for large payloads via `compute(jsonDecode, body)`.

### 1.5 Other Dart fixes
- Replace `firstOrNull` (Dart 3+ only) with `isNotEmpty ? .first : null` or document min Dart SDK in `pubspec.yaml`.
- Make `_baseUrl` configurable: `String.fromEnvironment('DART_DNA_BASE_URL', defaultValue: 'https://...')`.
- Replace magic numbers (`shapeInt: 2`, `campaignType: 1`, `buttonType: 4`, `propertyDefinitionId: 20`) with named enums / constants in a dedicated `minfo_enums.dart`.
- Add a state-management layer (Riverpod or Bloc). Direct widget→service calls will create concurrent polls when widgets rebuild.
- Add localisation hooks. "Scanning your brand…", "Extraction failed", etc. must be `AppLocalizations.of(context).…`.

---

## 2. API contract hardening

### 2.1 Async job semantics — RFC 7231 + 7807
**`POST /api/v1/dart/extract`** must return:

```
HTTP/1.1 202 Accepted
Location: https://dna.../api/v1/dart/jobs/{job_id}
Retry-After: 2
Content-Type: application/json

{
  "job_id": "01J…",   // ULID/UUID — never sequential
  "status": "pending",
  "expires_at": "2026-04-27T14:35:00Z",
  "estimated_seconds": 60
}
```

Errors use **RFC 7807 Problem Details**:
```json
{
  "type": "https://dna.api/errors/extraction-failed",
  "title": "Extraction Failed",
  "status": 422,
  "detail": "Cloudflare challenge could not be solved.",
  "instance": "/api/v1/dart/jobs/01J…",
  "code": "cloudflare_challenge",
  "retryable": false
}
```

### 2.2 Idempotency
Client generates `Idempotency-Key: <uuid-v4>` per submit. Server stores `(key, response)` for 24 h and returns the cached 202 on replay. Prevents double-tap and network-retry duplicates.

### 2.3 Cancellation
- `DELETE /api/v1/dart/jobs/{job_id}` → `204 No Content` (idempotent).
- Client calls it on user back-press, on timeout, and in `dispose()`.

### 2.4 Replace polling with SSE (preferred) or webhook
- **Best:** server-side webhook → DNA calls Minfo on completion → Minfo pushes FCM/APNs. Survives app kills.
- **Good:** SSE at `/api/v1/dart/jobs/{job_id}/events` — single long-lived connection; latency drops from 0–5 s to <100 ms.
- **Minimum:** server returns `Retry-After` so client can back off intelligently (already wired above).

### 2.5 Versioning + schema contract
- Path-version: `/api/v1/dart/...` (or `Accept: application/vnd.minfo.dart.v1+json`).
- Publish an OpenAPI 3.1 spec in the repo, generate Dart client with `openapi-generator`, fail CI on schema drift.
- Same treatment for the Minfo `POST /api/campaigns` payload — magic numbers (`campaignType`, `scanType`, `buttonType`, `propertyDefinitionId`) become server-served enum endpoints or strongly-typed constants in a shared SDK.

### 2.6 Image lifecycle
The plan flags "image URLs expire" and does nothing. Two options:
- **(A) Server stores final assets** in Minfo's bucket immediately on extraction completion → response contains permanent URLs.
- **(B) Each URL carries `valid_until`** and the client re-fetches stale ones before publishing.

Pick (A). It also fixes the security issue that an attacker-controlled image URL could be hot-linked from a Minfo campaign.

### 2.7 Partial-failure recovery
DNA extracted (90 s of compute) → `POST /api/campaigns` 500s → **user loses everything.** Persist the prepared payload to local storage (Hive/SQLite) before POSTing. Surface a "Resume" prompt on next launch with exponential-backoff retry queue.

---

## 3. Security hardening

| # | Severity | Issue | Fix |
|---|---|---|---|
| S1 | P0 | DART_API_KEY in binary | Remove. Mint per-user 5-min JWT from Minfo backend, or proxy through Minfo |
| S2 | P0 | SSRF (private IPs, file://, IMDS, localhost) | Server-side allowlist + DNS rebinding protection (resolve once, pin IP for fetch, re-validate it's public) |
| S3 | P0 | Stored XSS in `campaignDescription` | Send plain text; sanitise on render. Never client-build HTML from user input |
| S4 | P0 | No certificate pinning | `dio_certificate_pinning` with rotated public-key pins for both DNA and Minfo hosts |
| S5 | P1 | No request signing → bearer replay | HMAC-SHA256 over body + timestamp; reject `> 5 min` skew or seen-nonce |
| S6 | P1 | URL input not validated | Regex + scheme + length cap (2048); reject private IPs at the **client** as well |
| S7 | P1 | Image decoder DoS via attacker-supplied `logo_url`/`screenshot_url` | HEAD-check `Content-Type` + `Content-Length` < 5 MB; serve through Minfo image proxy that re-encodes (strips EXIF, decompression bombs) |
| S8 | P1 | Hex color injection (`'red; }</style><script>'`) | Validate `^#[0-9A-Fa-f]{6}$` before storing or rendering |
| S9 | P1 | Open redirect/phishing CTAs scraped from arbitrary sites | Show full target host in review UI, denylist known phishing TLDs, validate scheme is `https?:` only |
| S10 | P2 | Favicon proxy leaks every brand to Google | Self-host favicons or proxy via Minfo CDN |
| S11 | P2 | No per-user rate limit / debounce | Client 500 ms debounce; server-side 5 jobs/hour/user |
| S12 | P2 | No audit trail | Minfo logs `{user_id, ts, input_url, job_id, status}`; required for SOC2/GDPR |
| S13 | P2 | No PII deletion path | Document retention (screenshots/HTML purged at 30 d or on account deletion) |
| S14 | P3 | No integrity check | Play Integrity API (Android) / DeviceCheck (iOS) for high-value flows |
| S15 | P3 | Logs may contain PII (URLs with tokens, scraped emails) | Redaction filter on client + server log pipeline |

---

## 4. Resilience & error handling

- **Network flap mid-poll** — current code throws and dies. Wrap each poll in 3-attempt exponential retry; only surface error after final retry.
- **Force-quit recovery** — persist `job_id` in `SharedPreferences`/Hive; on relaunch, offer "Resume extraction" if not expired.
- **App backgrounded** — pause polling on `AppLifecycleState.paused`, resume on `.resumed`. Prevents waking the device just to poll.
- **Two-device race** — same user creates same brand on two phones simultaneously → Minfo must upsert by `(user_id, website_url_hash)`, not insert.
- **Clock skew** — `DateTime.now().toUtc()` may be wrong (user-set clock). Use server timestamp from response `Date` header to compute deadlines.
- **DST during 365-day campaign** — tested OK with `Duration(days: 365)` (UTC), but document and add a unit test pinned to a DST-crossing date.
- **Description mangling** — `replaceAll('\n', '<br>')` doesn't handle `\r\n`; `</p>` in description produces malformed HTML. Fix by passing plain text + server-side wrap.
- **Color contrast** — extracted brand colors may be white-on-white. Compute WCAG ratio in review screen; warn user before publish.
- **3-digit hex** — normalise `#fff` → `#ffffff` in `DnaResult.fromJson`.
- **IDN / non-ASCII URLs** — `Uri.parse` handles them but our `.contains()`-based social classifier doesn't. Normalize to punycode (`Uri.parse(url).host`) before classifying.
- **URL with embedded credentials** — `https://user:pass@acme.com` → strip userinfo before sending; **never log**.

---

## 5. Test plan (must hit ≥ 70% coverage before Phase 2)

### Unit tests
**`DnaResult.fromJson`:**
- Empty body, null body, missing each top-level field, malformed types (color as int, `button_styles` as object), extra unknown keys, unicode/emoji/RTL in name, `#fff` (3-digit hex), `rgb(…)`/`hsl(…)` color values, `data:` blob in image URLs, mixed-type arrays.

**`socialCategoryId`:**
- `myinstagram-fanclub.com` → 8 (NOT 3) — explicit substring-bug regression test.
- Trailing slash, scheme-less URL, IDN punycode, uppercase TLD, twitter↔x.com mapping.

**`buildMinfoPayload`:**
- Null `name`, empty `selectedImages`, empty `selectedCtas`, 5000-char description, HTML-injecting description (`<script>alert(1)</script>` and `</p>`), missing `websiteUrl`, very long URLs, `\r\n` line endings.

### Widget tests
- Cancel button mid-poll cleanly aborts HTTP and disposes stream.
- App backgrounded mid-poll → state survives resume.
- Network drop mid-poll → retries 3× then surfaces "No internet" with manual retry.

### Integration tests (mocked DNA server)
Golden files for 5 archetypes:
1. SPA / JS-rendered.
2. Cloudflare-challenged.
3. Non-English / RTL / IDN.
4. Very large (100+ CTAs, 10 MB JSON).
5. Minimal (no logo, no colors).

### Contract tests (real DNA staging)
- 400 on bad URL, 401 on expired key, 429 on rate-limit (must include `Retry-After`), 503 on queue full (must be retryable).
- Schema validation: response matches OpenAPI spec exactly.

### Security tests
- SSRF probe suite: `127.0.0.1`, `169.254.169.254`, `10.0.0.1`, `[::1]`, `file://etc/passwd`, redirect-to-private.
- XSS canary: description with `<img onerror=…>` should round-trip as escaped text in published Minfo page.

---

## 6. Observability — bake in from day one

- **Telemetry events:** `extraction_started`, `extraction_polling`, `extraction_complete`, `extraction_failed`, `review_opened`, `review_field_edited`, `review_abandoned`, `publish_succeeded`, `publish_failed`. Each carries `job_id`, hashed `website_domain`, `extraction_duration_ms`.
- **Distributed tracing:** client generates W3C `traceparent`, sends on every DNA + Minfo call. Joins with Railway logs.
- **Crash/error reporting:** Sentry or Firebase Crashlytics, with `job_id`, poll count, last HTTP status as breadcrumbs. Never include user URL plain-text — hash it.
- **Server metrics:** p50/p95/p99 latency by website archetype, cost per job, queue depth, success rate.
- **SLOs:**
  - p95 end-to-end ≤ 75 s.
  - Extraction success rate ≥ 90 %.
  - Review→publish rate ≥ 60 % (proxy for usefulness of the pre-fill).
  - 99.5 % monthly availability.

---

## 7. Operational readiness

- **Remote kill-switch:** boolean feature flag `dna_extractor_enabled` in Minfo backend, hot-fetched on app start (with sane cached fallback). Disables the "Import from Website" CTA without an app-store release.
- **Staged rollout:** 10 % → 25 % → 50 % → 100 % gated on success-rate thresholds.
- **Runbook entries needed:**
  - DNA extractor 503 — toggle kill-switch, page DNA owner, monitor recovery.
  - Minfo POST 500 after successful extraction — drain retry queue, alert backend owner.
  - User reports "lost my work" — fetch persisted draft from local storage diag, replay POST.
- **Log redaction:** strip query strings (may contain tokens), strip URL credentials, hash domains in client logs.
- **Audit log retention:** 1 year, queryable by `user_id` for SOC2 / GDPR access requests.

---

## 8. Updated phased rollout

### Phase 0 — Pre-flight (1 week, blocks everything)
- [ ] OpenAPI 3.1 spec for DNA + Minfo endpoints, generator-based Dart client.
- [ ] Auth refactor: remove `DART_API_KEY` from client, mint per-user JWT from Minfo.
- [ ] SSRF allowlist + private-IP rejection on DNA server.
- [ ] Idempotency + cancel + Retry-After + Problem Details on DNA API.
- [ ] Sentry + analytics scaffolding wired.

### Phase 1 — MVP (revised, 3 weeks)
- [ ] `DnaExtractionService` with stream + CancelToken + http.Client reuse.
- [ ] `DnaResult` with defensive parsing, hex/IDN/null guards.
- [ ] Polling progress screen with cancel, retry, offline detection, app-lifecycle handling.
- [ ] Pre-fill into existing Create Campaign form; user reviews and publishes.
- [ ] Local draft persistence + resume on app relaunch.
- [ ] HTML-escape user-edited description; pass plain text to Minfo.
- [ ] Image URL validation (https-only, content-type/size HEAD, served via Minfo proxy).
- [ ] Feature flag `dna_extractor_enabled` integrated.
- [ ] Unit + widget + contract test coverage ≥ 70 %.
- [ ] SSRF + XSS + rate-limit smoke tests in CI.

### Phase 2 — Enhanced Review (2 weeks)
- [ ] Image carousel with WCAG contrast warnings.
- [ ] CTA editor with phishing-domain warnings.
- [ ] Color palette preview.
- [ ] Social-link toggles with strict-host classifier (regression-tested).

### Phase 3 — Admin/Refresh (2 weeks)
- [ ] Re-extract from edit screen.
- [ ] Server-side webhook → push notification on completion (replaces polling).
- [ ] Quarterly background refresh (biometric-gated).
- [ ] Audit-log export for compliance.

---

## 9. Pre-launch checklist (must all be ✅)

**Security**
- [ ] DART_API_KEY removed from binary
- [ ] SSRF allowlist verified with probe suite
- [ ] HTML escape on description verified end-to-end
- [ ] Cert pinning enabled, mitmproxy test fails gracefully
- [ ] HMAC request signing on extract + cancel
- [ ] CTA + image + color hex validation enforced
- [ ] PII redaction in client + server logs

**API**
- [ ] OpenAPI spec checked in, CI gates schema drift
- [ ] Idempotency keys honoured 24 h
- [ ] DELETE cancel endpoint implemented + called on timeout
- [ ] Retry-After + 429 + 7807 errors returned
- [ ] Versioned path or content-type negotiation in place

**Flutter**
- [ ] Polling is a Stream, cancellable from `dispose`
- [ ] Single shared http.Client (or dio) across calls
- [ ] All `as List`/`as Map` casts replaced with `whereType` + per-item guards
- [ ] All `d.name` references have a non-null fallback
- [ ] `socialCategoryId` uses host-suffix matching
- [ ] L10n hooks for all user-visible strings
- [ ] State management (Riverpod/Bloc) wired

**QC / Ops**
- [ ] Unit + widget coverage ≥ 70 %
- [ ] Sentry breadcrumbs include job_id, poll_count, last status
- [ ] traceparent propagation client→server
- [ ] Feature flag and staged rollout configured
- [ ] Runbook published, on-call trained
- [ ] SLO dashboard live (p95, success rate, abandon rate)

---

*Synthesised from four parallel specialist reviews. The original plan is solid at the architectural level — async + human-review is the right call. The hardening above turns it from "MVP" into "production-defensible".*
