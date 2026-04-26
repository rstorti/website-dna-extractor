# Minfo Website DNA Extractor — Dart Integration Guide

**Version:** 1.0  
**API Version:** v1  
**Last Updated:** April 2026  
**Server:** Minfo Railway Deployment  
**Contact:** rstorti / Minfo Engineering

---

## What This Package Contains

| File | Purpose |
|---|---|
| `minfo_extractor_client.dart` | Drop-in Dart HTTP client — copy into your project |
| `Minfo_Dart_API.postman_collection.json` | Import into Postman to test the API manually |
| `sample_response.json` | Full example of a successful API response |
| `pubspec_additions.yaml` | The one dependency you need to add to `pubspec.yaml` |
| `DART_DEVELOPER_GUIDE.md` | This document |

---

## 1. Prerequisites

- Flutter SDK ≥ 3.0 (or Dart ≥ 3.0 for pure Dart projects)
- Internet access from the device/emulator to the Minfo server
- The API key provided by your Minfo contact (see Section 2)

---

## 2. Credentials

You will need two values — get these from your Minfo project contact:

| Value | Where to use it |
|---|---|
| **Server Base URL** | The Railway deployment URL, e.g. `https://website-dna-extractor-production.up.railway.app` |
| **Dart API Key** | The value of `DART_API_KEY` — passed as `Authorization: Bearer <key>` |

> ⚠️ **Never hardcode the API key in source code.** Store it using `flutter_secure_storage`, environment variables injected at build time (`--dart-define`), or a remote config service.

**Recommended pattern using `--dart-define`:**
```bash
flutter run --dart-define=MINFO_BASE_URL=https://your-railway-url.up.railway.app \
            --dart-define=MINFO_API_KEY=your-secret-key
```
Then in Dart:
```dart
const baseUrl = String.fromEnvironment('MINFO_BASE_URL');
const apiKey  = String.fromEnvironment('MINFO_API_KEY');
```

---

## 3. Add the Dependency

Add one line to your `pubspec.yaml` under `dependencies`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0      # ← add this line
```

Then run:
```bash
flutter pub get
```

---

## 4. Install the Client

Copy `minfo_extractor_client.dart` into your project, for example:
```
lib/
  services/
    minfo_extractor_client.dart   ← paste here
```

---

## 5. How the API Works — The Two-Step Pattern

Extraction takes 30–90 seconds. To avoid HTTP timeouts, the API uses an **async job pattern**:

```
Step 1 — POST /api/dart/extract
         Send the URLs → get back a job_id immediately (< 1 second)

Step 2 — GET /api/dart/result/:jobId
         Poll every 5 seconds → when status = "complete", data is ready
```

```
┌─────────────────┐        POST /api/dart/extract         ┌────────────────┐
│   Dart App      │ ─────────────────────────────────────► │  Minfo Server  │
│                 │ ◄───────── { job_id, status: "pending" } ─── (< 1s)     │
│                 │                                         │                │
│  [poll every 5s]│        GET /api/dart/result/:jobId      │  ⚙️ Extracting │
│                 │ ─────────────────────────────────────► │   (30–90s)     │
│                 │ ◄───── { status: "running" } ─────────── (keep polling) │
│                 │ ─────────────────────────────────────► │                │
│                 │ ◄───── { status: "complete", data: {…} } ──────────────  │
└─────────────────┘                                         └────────────────┘
```

---

## 6. Basic Usage

```dart
import 'package:your_app/services/minfo_extractor_client.dart';

// Create the client (do this once, e.g. in a service locator / provider)
final extractor = MinfoExtractorClient(
  baseUrl: const String.fromEnvironment('MINFO_BASE_URL'),
  apiKey:  const String.fromEnvironment('MINFO_API_KEY'),
);

// Run an extraction
try {
  final result = await extractor.extract(
    url:        'https://www.example.com',         // required
    youtubeUrl: 'https://youtu.be/abc123',         // optional
    profileUrl: 'https://linktr.ee/examplebrand',  // optional
    onProgress: (status) => print('Status: $status'),
  );

  // ── Use the results ──────────────────────────────────────
  final name        = result.name;
  final logo        = result.logoUrl;
  final images      = result.placeholderImages;   // List of 2 image URLs
  final description = result.campaignDescription; // HTML string
  final summary     = result.combinedSummary;
  final bgColor     = result.backgroundColor;
  final buttons     = result.buttonStyles;
  final socials     = result.socialMediaLinks;
  final campaign    = result.minfoJson;           // Full Minfo JSON to import

} on ExtractionException catch (e) {
  print('Failed: ${e.message}');
  print('Hint:   ${e.hint}');
}

// Always dispose when done (e.g. in dispose())
extractor.dispose();
```

---

## 7. Full Response Reference

See `sample_response.json` for a real example. Key fields at a glance:

### Identity
| Field | Type | Description |
|---|---|---|
| `name` | `String?` | Person or brand name extracted from the website |
| `website_summary` | `String?` | AI-generated summary of the website |
| `youtube_summary` | `String?` | AI-generated summary of the YouTube video |
| `combined_summary` | `String?` | Combined website + YouTube summary (use this for campaign description) |
| `campaign_description` | `String?` | Full HTML description — render with `flutter_widget_from_html` |

### Brand Assets
| Field | Type | Description |
|---|---|---|
| `logo_url` | `String?` | Brand logo (hosted on Supabase, permanent URL) |
| `screenshot_url` | `String?` | Full-page screenshot of the website |
| `placeholder_images` | `List<String>` | **2 best hero images** selected by AI — use as campaign backgrounds |

### Colours
| Field | Type | Description |
|---|---|---|
| `background_color` | `String` | Main page background hex, e.g. `#FFFFFF` |
| `foreground_color` | `String` | Main text hex |
| `qr_code_color` | `String` | Recommended QR code hex |
| `background_app_bar_color` | `String?` | App bar / toolbar background |
| `foreground_app_bar_color` | `String?` | App bar text/icon colour |
| `icon_background_color_left` | `String?` | Left action icon background |
| `icon_foreground_color_left` | `String?` | Left action icon foreground |
| `icon_background_color_right` | `String?` | Right action icon background |
| `icon_foreground_color_right` | `String?` | Right action icon foreground |
| `background_selected_color` | `String?` | Selection / highlight colour |

### Button Styles
`button_styles` is a `List` of objects. Each object:

| Field | Type | Values |
|---|---|---|
| `background_color_hex` | `String?` | Hex, e.g. `#FF1436` |
| `text_color_hex` | `String?` | Hex, e.g. `#FFFFFF` |
| `shape` | `String` | `'Square'` \| `'Curved'` \| `'Pill'` |
| `shape_int` | `int` | `1`=Square, `2`=Rounded, `3`=Pill |
| `text_align` | `String` | `'left'` \| `'center'` \| `'right'` |
| `text_align_int` | `int` | `1`=Left, `2`=Center, `3`=Right |
| `border_radius` | `String` | CSS value, e.g. `'500px'` or `'0px'` |
| `font_family` | `String?` | e.g. `'Poppins, sans-serif'` |
| `padding` | `String?` | e.g. `'10px 20px'` |
| `sample_text` | `String?` | Button label from the website |
| `sample_url` | `String?` | Button destination URL |

### CTAs (Calls to Action)
Each CTA list (`website_ctas`, `youtube_ctas`, `profile_ctas`) contains:
```json
{ "button_name": "Read More", "url": "https://...", "context": "Website Main Button" }
```

### Social Media Links
| Field | Type | Description |
|---|---|---|
| `social_media_links` | `List<String>` | Links found on the main website |
| `youtube_social_links` | `List<String>` | Links found in the YouTube description |
| `profile_social_links` | `List<String>` | Links found on the bio-link page |

### YouTube
`youtube` is `null` if no YouTube URL was provided. When present:
```json
{
  "title":         "Video title",
  "channel":       "Channel name",
  "description":   "Full video description text...",
  "thumbnail_url": "https://i.ytimg.com/vi/.../maxresdefault.jpg",
  "channel_logo":  "https://yt3.ggpht.com/...",
  "published_at":  "2026-04-16T16:01:32Z"
}
```

### Minfo Campaign JSON
`minfo_campaign` is the **complete Minfo campaign JSON** ready to POST directly to the Minfo campaign import endpoint. It includes all fields required for a new campaign.

---

## 8. Handling Errors

```dart
try {
  final result = await extractor.extract(url: 'https://example.com');
  // …
} on ExtractionException catch (e) {
  switch (e.statusCode) {
    case 400: // Bad URL or missing field
      showSnackBar('Please check the URL you entered.');
    case 401: // Wrong API key
      showSnackBar('Authentication error — contact support.');
    case 422: // Extraction failed (site blocked, timeout, etc.)
      showSnackBar('Could not extract this website: ${e.message}');
      if (e.hint != null) print('Hint: ${e.hint}');
    case 429: // Rate limit
      showSnackBar('Too many requests — wait 1 minute and try again.');
    case 408: // Client-side timeout (3-minute limit)
      showSnackBar('Extraction took too long — please try again.');
    default:
      showSnackBar('Unexpected error: ${e.message}');
  }
}
```

**HTTP status codes:**
| Code | Meaning |
|---|---|
| `202` | Job accepted / still running — keep polling |
| `200` | Complete |
| `400` | Invalid request (bad URL, missing field) |
| `401` | Invalid or missing API key |
| `404` | Job expired (jobs auto-delete after 30 minutes) |
| `422` | Extraction failed (site blocked, offline, etc.) |
| `429` | Rate limit — max 5 extractions/min per IP |

---

## 9. Testing with Postman

1. Open Postman → **Import** → select `Minfo_Dart_API.postman_collection.json`
2. In the collection, click **Variables** and set:
   - `baseUrl` → your Railway server URL
   - `dartApiKey` → the API key provided to you
3. Run **"1. Health Check"** — should return `{ "status": "ok" }`
4. Run **"2. Start Extraction"** — the `job_id` auto-saves via the test script
5. Run **"3. Poll for Result"** — repeat until `status = "complete"`
6. Inspect the full `data` object — this matches the `ExtractionResult` model exactly

---

## 10. Accepted Profile / Bio-Link Domains

The `profile_url` field only accepts these services:

| Service | Example URL |
|---|---|
| Linktree | `https://linktr.ee/username` |
| Bitly | `https://bit.ly/xxxxx` |
| Beacon | `https://beacon.ai/username` |
| Bio.site | `https://bio.site/username` |
| Bento.me | `https://bento.me/username` |
| Lnk.bio | `https://lnk.bio/username` |
| Solo.to | `https://solo.to/username` |
| Tap.bio | `https://tap.bio/username` |
| Milkshake | `https://milkshake.app/username` |
| Hoo.be | `https://hoo.be/username` |
| Campsite | `https://campsite.bio/username` |

---

## 11. Rate Limits

| Endpoint | Limit |
|---|---|
| `POST /api/dart/extract` | 5 requests per minute per IP |
| `GET /api/dart/result/:id` | 30 requests per minute per IP |

Extractions are capped at **4 concurrent jobs** server-wide. If the server is at capacity, you will receive a `429` response — implement an exponential back-off retry.

---

## 12. Quick-Start Checklist

- [ ] Copy `minfo_extractor_client.dart` into `lib/services/`
- [ ] Add `http: ^1.2.0` to `pubspec.yaml` and run `flutter pub get`
- [ ] Set `MINFO_BASE_URL` and `MINFO_API_KEY` via `--dart-define` or secure storage
- [ ] Instantiate `MinfoExtractorClient` in your service layer
- [ ] Call `extractor.extract(url: ...)` with optional `youtubeUrl` and `profileUrl`
- [ ] Render `result.placeholderImages[0]` and `[1]` as campaign hero images
- [ ] Pass `result.minfoJson` to the Minfo campaign import endpoint
- [ ] Call `extractor.dispose()` in your widget's `dispose()` method
- [ ] Import `Minfo_Dart_API.postman_collection.json` and test against staging
