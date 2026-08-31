# Minfo — JSON File Import Brief
### For the Dart/Flutter Developer

**Prepared by:** Antigravity / Minfo Engineering  
**Date:** May 2026  
**Context:** The Website DNA Extractor web app produces a structured JSON file via its **"Create Json"** button. This brief tells you exactly what that file contains and how to ingest it into Minfo.

---

## 1. How the File Is Generated (Context Only)

The operator uses the Website DNA Extractor web app to:
1. Scrape a brand website (and optional YouTube / LinkedIn URLs)
2. Review and select descriptions, images, CTAs, button styles, and colours
3. Click **"Create Json"** → then **"Download JSON"**

The result is a single `.json` file they hand to you (or upload via a future in-app flow). **No API call is required** — this is a direct file-ingest path.

---

## 2. Top-Level JSON Structure

The file always has exactly **four top-level keys**:

```json
{
  "campaign":            { ... },
  "campaignItemButtons": [ ... ],
  "medialinks":          [ ... ],
  "productGroups":       [ ... ]
}
```

> **Note:** `campaignItemButtons` appears both at the top level AND nested inside `productGroups[].products[]`. The top-level array is the canonical button list for the campaign.

---

## 3. Full Field Reference

### 3.1 `campaign` object

| Field | Dart Type | Notes |
|---|---|---|
| `name` | `String` | Short brand name, e.g. `"Strava"` |
| `campaignDescription` | `String` | HTML string — render with `flutter_widget_from_html`. May be `""`. |
| `backgroundColor` | `String` | `#RRGGBB` hex |
| `foregroundColor` | `String` | `#RRGGBB` hex |
| `appbarBackgroundColor` | `String` | `#RRGGBB` hex |
| `appbarForegroundColor` | `String` | `#RRGGBB` hex |
| `backgroundImage` | `String` | Usually `""` — skip if empty |
| `image` | `String` | Brand logo URL (Supabase-hosted, permanent) |
| `campaignType` | `int` | Always `1` |
| `scanType` | `int` | Always `0` |
| `displayInSearch` | `bool` | `true` |
| `is_enable` | `bool` | `true` |
| `is_elevator` | `bool` | `false` |
| `startTimeUtc` | `String` | ISO 8601 UTC |
| `endTimeUtc` | `String` | ISO 8601 UTC (1 year from creation) |
| `brand.name` | `String` | Same as `campaign.name` |
| `brand.logo` | `String` | Same as `campaign.image` |
| `brand.website` | `String` | Canonical brand website URL |

---

### 3.2 `campaignItemButtons` array

Each element:

```json
{
  "name": "Join Strava Now",
  "buttonType": 1,
  "modelorder": 1,
  "backgroundColor": "#FC4C02",
  "foregroundColor": "#FFFFFF",
  "properties": [
    {
      "propertyDefinitionId": 20,
      "propertyValue": "https://strava.com/register",
      "propertyName": "URL"
    }
  ],
  "shape": "Square",
  "buttonAlign": "Center",
  "textAlign": "Center",
  "enabled": true
}
```

| Field | Dart Type | Enum values / Notes |
|---|---|---|
| `name` | `String` | Button label |
| `buttonType` | `int` | `1`=URL · `2`=Phone · `3`=SMS · `4`=URL (legacy) · `5`=Share |
| `modelorder` | `int` | Sort order, 1-based |
| `backgroundColor` | `String` | `#RRGGBB` |
| `foregroundColor` | `String` | `#RRGGBB` |
| `shape` | `String` | `"Square"` · `"Rounded"` · `"Pill"` |
| `buttonAlign` | `String` | `"Left"` · `"Center"` · `"Right"` |
| `textAlign` | `String` | `"Left"` · `"Center"` · `"Right"` |
| `enabled` | `bool` | Filter out `false` entries |
| `properties[0].propertyDefinitionId` | `int` | `20`=URL · `21`=Phone · `22`=SMS · `23`=Share |
| `properties[0].propertyValue` | `String` | The URL / phone / SMS target |
| `properties[0].propertyName` | `String` | `"URL"` · `"Phone"` · `"SMS"` · `"Share"` |

> **When posting to the internal Minfo campaign API**, convert shape and align to integers:
> shape: `1`=Square · `2`=Rounded · `3`=Pill  
> textAlign/buttonAlign: `1`=Left · `2`=Center · `3`=Right

---

### 3.3 `medialinks` array

```json
{
  "name": "Instagram",
  "icon": "https://www.google.com/s2/favicons?domain=instagram.com&sz=64",
  "link_url": "https://instagram.com/strava",
  "buttonCategoryId": 3,
  "modelorder": 2
}
```

| Field | Dart Type | Notes |
|---|---|---|
| `name` | `String` | Platform label, e.g. `"Twitter"`, `"Website"` |
| `icon` | `String` | Google favicon URL — use a fallback icon if it fails to load |
| `link_url` | `String` | Full URL |
| `buttonCategoryId` | `int` | See platform map below |
| `modelorder` | `int` | Sort order |

**`buttonCategoryId` map:**

| ID | Platform |
|---|---|
| `1` | Facebook |
| `2` | Twitter / X |
| `3` | Instagram |
| `4` | YouTube |
| `5` | LinkedIn |
| `6` | TikTok |
| `7` | Pinterest |
| `8` | Everything else (Website, Threads, GitHub, WhatsApp, etc.) |

---

### 3.4 `productGroups` array

```json
{
  "name": "Strava",
  "modelorder": 1,
  "products": [
    {
      "item_name": "Strava",
      "description": "Plain text description (no HTML).",
      "modelorder": 1,
      "calories": 0,
      "ingredients": "",
      "item_type": "Product",
      "deliverable": false,
      "productImages": [
        { "image_url": "https://...", "modelorder": 1 }
      ],
      "campaignItemButtons": [ ... ],
      "medialinks": []
    }
  ]
}
```

- `productImages` — hero/background images the operator selected. Use `image_url`. May be empty `[]`.
- `description` is **plain text**, not HTML (unlike `campaign.campaignDescription`).
- `campaignItemButtons` here mirrors the top-level array.

---

## 4. Dart Model Classes

```dart
// lib/models/campaign_import_models.dart

import 'package:flutter/material.dart';

class MinfoImportPayload {
  final CampaignData campaign;
  final List<CampaignButton> campaignItemButtons;
  final List<MediaLink> medialinks;
  final List<ProductGroup> productGroups;

  const MinfoImportPayload({
    required this.campaign,
    required this.campaignItemButtons,
    required this.medialinks,
    required this.productGroups,
  });

  factory MinfoImportPayload.fromJson(Map<String, dynamic> j) =>
      MinfoImportPayload(
        campaign: CampaignData.fromJson(
            j['campaign'] as Map<String, dynamic>? ?? {}),
        campaignItemButtons: (j['campaignItemButtons'] as List? ?? [])
            .whereType<Map>()
            .map((m) => CampaignButton.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
        medialinks: (j['medialinks'] as List? ?? [])
            .whereType<Map>()
            .map((m) => MediaLink.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
        productGroups: (j['productGroups'] as List? ?? [])
            .whereType<Map>()
            .map((m) => ProductGroup.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
      );
}

// ── Hex validation helper ──────────────────────────────────────────────────
String? _validHex(dynamic val) {
  if (val is! String) return null;
  return RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(val) ? val : null;
}

Color hexToColor(String hex, {Color fallback = Colors.black}) {
  final clean = hex.replaceFirst('#', '');
  if (clean.length == 6) {
    return Color(int.parse('FF$clean', radix: 16));
  }
  if (clean.length == 8) {
    return Color(int.parse(clean, radix: 16));
  }
  return fallback;
}

// ── CampaignData ───────────────────────────────────────────────────────────
class CampaignData {
  final String name;
  final String campaignDescription;  // HTML
  final String backgroundColor;
  final String foregroundColor;
  final String appbarBackgroundColor;
  final String appbarForegroundColor;
  final String? image;               // logo URL
  final int campaignType;
  final bool displayInSearch;
  final bool isEnable;
  final String startTimeUtc;
  final String endTimeUtc;
  final BrandInfo brand;

  const CampaignData({
    required this.name,
    required this.campaignDescription,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.appbarBackgroundColor,
    required this.appbarForegroundColor,
    this.image,
    required this.campaignType,
    required this.displayInSearch,
    required this.isEnable,
    required this.startTimeUtc,
    required this.endTimeUtc,
    required this.brand,
  });

  factory CampaignData.fromJson(Map<String, dynamic> j) => CampaignData(
        name:                  j['name'] as String? ?? '',
        campaignDescription:   j['campaignDescription'] as String? ?? '',
        backgroundColor:       _validHex(j['backgroundColor']) ?? '#FFFFFF',
        foregroundColor:       _validHex(j['foregroundColor']) ?? '#000000',
        appbarBackgroundColor: _validHex(j['appbarBackgroundColor']) ?? '#000000',
        appbarForegroundColor: _validHex(j['appbarForegroundColor']) ?? '#FFFFFF',
        image:                 j['image'] as String?,
        campaignType:          j['campaignType'] as int? ?? 1,
        displayInSearch:       j['displayInSearch'] as bool? ?? true,
        isEnable:              j['is_enable'] as bool? ?? true,
        startTimeUtc:          j['startTimeUtc'] as String? ??
                                   DateTime.now().toUtc().toIso8601String(),
        endTimeUtc:            j['endTimeUtc'] as String? ?? '',
        brand: BrandInfo.fromJson(j['brand'] as Map<String, dynamic>? ?? {}),
      );
}

class BrandInfo {
  final String name;
  final String? logo;
  final String website;

  const BrandInfo({required this.name, this.logo, required this.website});

  factory BrandInfo.fromJson(Map<String, dynamic> j) => BrandInfo(
        name:    j['name'] as String? ?? '',
        logo:    j['logo'] as String?,
        website: j['website'] as String? ?? '',
      );
}

// ── CampaignButton ─────────────────────────────────────────────────────────
class CampaignButton {
  final String name;
  final int buttonType;
  final int modelorder;
  final String backgroundColor;
  final String foregroundColor;
  final List<ButtonProperty> properties;
  final String shape;        // "Square" | "Rounded" | "Pill"
  final String buttonAlign;  // "Left" | "Center" | "Right"
  final String textAlign;
  final bool enabled;

  const CampaignButton({
    required this.name,
    required this.buttonType,
    required this.modelorder,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.properties,
    required this.shape,
    required this.buttonAlign,
    required this.textAlign,
    required this.enabled,
  });

  /// Convenience: get the primary URL/phone/value
  String? get primaryValue =>
      properties.isNotEmpty ? properties.first.propertyValue : null;

  factory CampaignButton.fromJson(Map<String, dynamic> j) => CampaignButton(
        name:            j['name'] as String? ?? '',
        buttonType:      j['buttonType'] as int? ?? 1,
        modelorder:      j['modelorder'] as int? ?? 0,
        backgroundColor: _validHex(j['backgroundColor']) ?? '#FFFFFF',
        foregroundColor: _validHex(j['foregroundColor']) ?? '#000000',
        properties:      (j['properties'] as List? ?? [])
            .whereType<Map>()
            .map((m) => ButtonProperty.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
        shape:       j['shape'] as String? ?? 'Square',
        buttonAlign: j['buttonAlign'] as String? ?? 'Center',
        textAlign:   j['textAlign'] as String? ?? 'Center',
        enabled:     j['enabled'] as bool? ?? true,
      );
}

class ButtonProperty {
  final int propertyDefinitionId;
  final String propertyValue;
  final String propertyName;

  const ButtonProperty({
    required this.propertyDefinitionId,
    required this.propertyValue,
    required this.propertyName,
  });

  factory ButtonProperty.fromJson(Map<String, dynamic> j) => ButtonProperty(
        propertyDefinitionId: j['propertyDefinitionId'] as int? ?? 20,
        propertyValue:        j['propertyValue'] as String? ?? '',
        propertyName:         j['propertyName'] as String? ?? 'URL',
      );
}

// ── MediaLink ──────────────────────────────────────────────────────────────
class MediaLink {
  final String name;
  final String icon;
  final String linkUrl;
  final int buttonCategoryId;
  final int modelorder;

  const MediaLink({
    required this.name,
    required this.icon,
    required this.linkUrl,
    required this.buttonCategoryId,
    required this.modelorder,
  });

  factory MediaLink.fromJson(Map<String, dynamic> j) => MediaLink(
        name:             j['name'] as String? ?? '',
        icon:             j['icon'] as String? ?? '',
        linkUrl:          j['link_url'] as String? ?? '',
        buttonCategoryId: j['buttonCategoryId'] as int? ?? 8,
        modelorder:       j['modelorder'] as int? ?? 0,
      );
}

// ── ProductGroup / Product / ProductImage ──────────────────────────────────
class ProductGroup {
  final String name;
  final int modelorder;
  final List<Product> products;

  const ProductGroup(
      {required this.name, required this.modelorder, required this.products});

  factory ProductGroup.fromJson(Map<String, dynamic> j) => ProductGroup(
        name:       j['name'] as String? ?? '',
        modelorder: j['modelorder'] as int? ?? 1,
        products:   (j['products'] as List? ?? [])
            .whereType<Map>()
            .map((m) => Product.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
      );
}

class Product {
  final String itemName;
  final String description;  // plain text
  final int modelorder;
  final List<ProductImage> productImages;
  final List<CampaignButton> campaignItemButtons;

  const Product({
    required this.itemName,
    required this.description,
    required this.modelorder,
    required this.productImages,
    required this.campaignItemButtons,
  });

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        itemName:    j['item_name'] as String? ?? '',
        description: j['description'] as String? ?? '',
        modelorder:  j['modelorder'] as int? ?? 1,
        productImages: (j['productImages'] as List? ?? [])
            .whereType<Map>()
            .map((m) => ProductImage.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
        campaignItemButtons: (j['campaignItemButtons'] as List? ?? [])
            .whereType<Map>()
            .map((m) => CampaignButton.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
      );
}

class ProductImage {
  final String imageUrl;
  final int modelorder;

  const ProductImage({required this.imageUrl, required this.modelorder});

  factory ProductImage.fromJson(Map<String, dynamic> j) => ProductImage(
        imageUrl:   j['image_url'] as String? ?? '',
        modelorder: j['modelorder'] as int? ?? 0,
      );
}
```

---

## 5. Parsing the File

```dart
import 'dart:convert';
import 'dart:io';
import 'package:file_picker/file_picker.dart';

Future<MinfoImportPayload?> pickAndParseJson() async {
  // 1. Open file picker
  final picked = await FilePicker.platform.pickFiles(
    type: FileType.custom,
    allowedExtensions: ['json'],
    withData: true,
  );
  if (picked == null || picked.files.isEmpty) return null;

  // 2. Get bytes
  final bytes = picked.files.first.bytes ??
      await File(picked.files.first.path!).readAsBytes();

  // 3. Decode JSON
  final Map<String, dynamic> raw;
  try {
    raw = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
  } catch (e) {
    throw FormatException('Invalid JSON file: $e');
  }

  // 4. Validate it is a DNA Extractor export
  if (!raw.containsKey('campaign')) {
    throw FormatException(
        'Not a valid DNA Extractor export — missing "campaign" key.');
  }

  // 5. Parse
  return MinfoImportPayload.fromJson(raw);
}
```

---

## 6. Recommended UI Flow

```
User taps "Import from DNA Extractor JSON"
    │
    ▼
File picker → user selects the .json file
    │
    ▼
Parse + validate
  → on error: show snackbar "This file is not a valid DNA Extractor export."
    │
    ▼
Pre-fill Create Campaign form:
  Campaign name      ← payload.campaign.name
  Description (HTML) ← payload.campaign.campaignDescription
  Logo URL           ← payload.campaign.image
  Background colour  ← payload.campaign.backgroundColor
  Foreground colour  ← payload.campaign.foregroundColor
  App bar colours    ← appbarBackgroundColor / appbarForegroundColor
  Brand website      ← payload.campaign.brand.website
  Hero images        ← payload.productGroups[0].products[0].productImages
  CTA buttons        ← payload.campaignItemButtons (filter enabled == true)
  Social links       ← payload.medialinks
    │
    ▼
User reviews / edits any field
    │
    ▼
User taps Publish → POST to Minfo campaign API as normal
```

---

## 7. Validation & Edge Cases

| Scenario | Handle like this |
|---|---|
| `campaignDescription` is `""` | Leave empty; let user write their own |
| `campaign.image` is `""` or null | Show placeholder; let user upload |
| `productImages` is empty `[]` | Skip hero image section; let user upload |
| `campaignItemButtons` is empty | Skip buttons section; let user add manually |
| Hex fails `#RRGGBB` check | Fall back: bg→`#FFFFFF`, fg→`#000000` |
| `icon` URL fails to load | Show generic globe icon |
| `buttonType` unknown int | Default to `1` (URL) |
| `enabled: false` on a button | Exclude from the pre-filled list |
| File not valid JSON | "This file is not a valid DNA Extractor export." |
| `"campaign"` key missing | Same error message above |
| Wayback Machine URLs in `link_url` | Strip `https://web.archive.org/web/DIGITS/` prefix before storing |

---

## 8. Colour Conversion

Hex in this file is always `#RRGGBB`. Use the `hexToColor()` helper from Section 4, which adds the `FF` alpha prefix automatically.

---

## 9. Dependencies

Add to `pubspec.yaml`:

```yaml
dependencies:
  file_picker: ^8.0.0
  flutter_widget_from_html: ^0.15.0   # for rendering HTML campaign descriptions
```

---

## 10. Sample Minimal JSON (for unit tests)

```json
{
  "campaign": {
    "name": "Strava",
    "campaignDescription": "<p>The world's largest sports community.</p>",
    "backgroundColor": "#FFFFFF",
    "foregroundColor": "#000000",
    "appbarBackgroundColor": "#FAFAFA",
    "appbarForegroundColor": "#000000",
    "backgroundImage": "",
    "image": "https://storage.googleapis.com/minfo/logo/strava.png",
    "campaignType": 1,
    "scanType": 0,
    "displayInSearch": true,
    "is_enable": true,
    "is_elevator": false,
    "startTimeUtc": "2026-05-01T00:00:00.000Z",
    "endTimeUtc": "2027-05-01T00:00:00.000Z",
    "brand": {
      "name": "Strava",
      "logo": "https://storage.googleapis.com/minfo/logo/strava.png",
      "website": "https://www.strava.com/"
    }
  },
  "campaignItemButtons": [
    {
      "name": "Join Free",
      "buttonType": 1,
      "modelorder": 1,
      "backgroundColor": "#FC4C02",
      "foregroundColor": "#FFFFFF",
      "properties": [
        {
          "propertyDefinitionId": 20,
          "propertyValue": "https://www.strava.com/register",
          "propertyName": "URL"
        }
      ],
      "shape": "Rounded",
      "buttonAlign": "Center",
      "textAlign": "Center",
      "enabled": true
    }
  ],
  "medialinks": [
    {
      "name": "Website",
      "icon": "https://www.google.com/s2/favicons?domain=strava.com&sz=64",
      "link_url": "https://www.strava.com/",
      "buttonCategoryId": 8,
      "modelorder": 1
    },
    {
      "name": "Instagram",
      "icon": "https://www.google.com/s2/favicons?domain=instagram.com&sz=64",
      "link_url": "https://instagram.com/strava",
      "buttonCategoryId": 3,
      "modelorder": 2
    }
  ],
  "productGroups": [
    {
      "name": "Strava",
      "modelorder": 1,
      "products": [
        {
          "item_name": "Strava",
          "description": "The world's largest sports community.",
          "modelorder": 1,
          "calories": 0,
          "ingredients": "",
          "item_type": "Product",
          "deliverable": false,
          "productImages": [
            { "image_url": "https://storage.googleapis.com/minfo/hero/strava_1.jpg", "modelorder": 1 }
          ],
          "campaignItemButtons": [],
          "medialinks": []
        }
      ]
    }
  ]
}
```

---

## 11. Quick-Start Checklist

- [ ] Add `file_picker` and `flutter_widget_from_html` to `pubspec.yaml`
- [ ] Create `lib/models/campaign_import_models.dart` — paste models from Section 4
- [ ] Implement `pickAndParseJson()` from Section 5
- [ ] Wire an **"Import JSON"** button in Create Campaign screen
- [ ] Pre-fill form fields as per Section 6 flow
- [ ] Use `hexToColor()` when assigning `Color` values
- [ ] Filter buttons where `enabled == true` only
- [ ] Handle empty `productImages` / `campaignItemButtons` / `medialinks` gracefully
- [ ] Test with the minimal JSON in Section 10
- [ ] Test with real files from repo: `docs/Final_Campaign_Target.json` (Strava, 660 lines, 32 buttons)
