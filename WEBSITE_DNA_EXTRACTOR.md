# 🧬 Website DNA Extractor

**Version:** 1.0.0  
**Stack:** Node.js + Express (backend) · React + Vite (frontend)  
**Deployment:** Render.com (backend) · Render.com (frontend static)  
**Database / Storage:** Supabase (PostgreSQL + Object Storage)

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Architecture Overview](#architecture-overview)
3. [Inputs](#inputs)
4. [Processing Pipeline](#processing-pipeline)
5. [Outputs](#outputs)
6. [Environment Variables](#environment-variables)
7. [API Reference](#api-reference)
8. [File Structure](#file-structure)
9. [Running Locally](#running-locally)
10. [Key Dependencies](#key-dependencies)
11. [Business Benefits](#business-benefits)
12. [Known Limitations & Notes](#known-limitations--notes)

---

## What It Does

Website DNA Extractor is a full-stack AI-powered tool that automatically reverse-engineers the **brand identity and digital DNA** of any website or YouTube channel.

Given one or more URLs, it:
- Navigates to the site headlessly using Puppeteer
- Scrapes brand colours, typography, button styles, CTAs, logos, hero images, and social links
- Runs the raw data through **Google Gemini AI** for verification and summarisation
- Generates outpainted 640×640 image variants via **Google Vertex AI Imagen**
- Uploads all assets to **Supabase Storage** for public CDN access
- Exports a fully structured **JSON payload** ready for direct import into the **Minfo campaign builder**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React/Vite)                 │
│  Dashboard │ History │ Settings                              │
│  - URL inputs (Website, YouTube, Profile)                    │
│  - Results panel (colours, CTAs, images, button styles)      │
│  - JSON / Excel export builder                               │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (fetch)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND (Express.js)                  │
│                                                              │
│  POST /api/extract                                           │
│    ├── extractor.js       (Puppeteer scraping pipeline)      │
│    ├── youtube_extractor.js (YouTube Data API v3)            │
│    ├── ai_verifier.js     (Gemini AI verification)           │
│    └── supabaseClient.js  (image upload + CDN URLs)          │
│                                                              │
│  GET  /api/history        (read from Supabase or local JSON) │
│  DELETE /api/history      (by domain or timestamp)           │
│  GET  /api/health         (uptime + env status)              │
│  GET  /api/download       (proxy download for CORS)          │
└─────────────┬──────────────────────────┬────────────────────┘
              │                          │
              ▼                          ▼
    ┌──────────────────┐      ┌──────────────────────┐
    │  Google Gemini   │      │  Supabase             │
    │  (AI Verifier)   │      │  PostgreSQL + Storage │
    └──────────────────┘      └──────────────────────┘
              │
              ▼
    ┌──────────────────┐
    │  Vertex AI Imagen│
    │  (Outpainting)   │
    └──────────────────┘
```

---

## Inputs

### User-Facing URL Inputs (Frontend)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **Website URL** | URL string | Optional* | The main brand website (e.g. `https://strava.com`) |
| **YouTube Channel URL** | URL string | Optional* | A YouTube channel or video URL |
| **Profile / Linktree URL** | URL string | Optional* | A link-in-bio or social profile page |

> *At least one URL must be provided. All three can be combined for a richer extraction.

### Backend API Input (POST /api/extract)

```json
{
  "url":        "https://www.example.com",
  "youtubeUrl": "https://www.youtube.com/@ExampleChannel",
  "profileUrl": "https://linktr.ee/example"
}
```

### Environment Inputs (`.env` / Render Secrets)

See [Environment Variables](#environment-variables) section.

---

## Processing Pipeline

Each extraction runs through up to 5 sequential stages:

### Stage 1 — Website Extraction (`extractor.js`)
- Launches a **stealth Puppeteer** browser with spoofed user-agent
- Navigates to the URL with up to 90s timeout
- **Fallback chain:** Live site → Wayback Machine archive → Lightweight `axios` scrape
- Extracts:
  - Page title, meta description, Open Graph tags
  - Computed CSS: background colours, foreground colours, app-bar colours, button styles (border-radius, padding, font, colour)
  - Logo (detected via `<img>`, favicon, OG image)
  - Hero images (above-the-fold)
  - CTA buttons (text, URL, context)
  - Social media links (Facebook, Twitter/X, Instagram, LinkedIn, YouTube, TikTok)
- Takes a **full-page screenshot**
- Slices and uploads hero image regions to Supabase
- Calls **Vertex AI Imagen** to outpaint images to clean 640×640 aspect ratio (generates Clean + Tagged variants)

### Stage 2 — YouTube Extraction (`youtube_extractor.js`)
- Calls **YouTube Data API v3** to retrieve:
  - Channel description, subscriber count, banner images, thumbnail
  - Latest video titles and descriptions (for CTA mining)
- Falls back to Puppeteer scraping of the YouTube page if the API key is unavailable

### Stage 3 — Profile Extraction (`extractor.js` → `extractDNA`)
- Runs the full Website Extraction pipeline on the Profile URL
- Returns a **separate payload** (`profilePayload`) so the UI can show it independently

### Stage 4 — AI Verification (`ai_verifier.js`)
- Sends the raw extracted data + screenshot + logo to **Google Gemini 2.5 Pro**
- Gemini verifies and enriches:
  - Brand name
  - Website summary (1–2 sentences, campaign-friendly)
  - YouTube summary
  - Combined summary
  - YouTube CTAs (mined from video descriptions/banners)
  - Color accuracy confirmation
- Returns structured JSON merged back into the final payload

### Stage 5 — History Save
- Saves the full extraction (including payload) to:
  - **Supabase `extraction_history` table** (primary)
  - Local `outputs/history.json` (fallback / backup)

---

## Outputs

### Frontend Dashboard

The results panel renders:

| Section | Content |
|---------|---------|
| **Brand Header** | Logo, brand name, domain, Wayback badge if archived |
| **Descriptions** | Website summary / YouTube summary / Combined (toggle) |
| **CTAs** | Editable button names + destination URLs (checkbox to include) |
| **Hero Images** | Generated 640×640 Clean + Tagged variants (checkbox to include) |
| **Website Images** | Original scraped images from the live page |
| **Button Styles** | Visual preview of extracted button CSS (radio to select) |
| **Social Links** | Grouped by platform with favicons |
| **Colour Palette** | 5 brand swatches with live colour picker override |
| **JSON Builder** | Generates the Minfo import payload with selected data |

### JSON Export (Minfo Campaign Schema)

Clicking **Export to JSON** generates a file structured as:

```json
{
  "campaign": {
    "name": "Brand Name",
    "campaignDescription": "<p>AI-generated description</p>",
    "backgroundColor": "#FFFFFF",
    "foregroundColor": "#000000",
    "appbarBackgroundColor": "#000000",
    "appbarForegroundColor": "#FFFFFF",
    "backgroundImage": "",
    "image": "https://cdn.supabase.co/.../logo.png",
    "campaignType": 1,
    "scanType": 0,
    "displayInSearch": true,
    "is_enable": true,
    "is_elevator": false,
    "startTimeUtc": "ISO timestamp",
    "endTimeUtc": "ISO timestamp +1 year",
    "brand": {
      "name": "Brand Name",
      "logo": "https://cdn.supabase.co/.../logo.png",
      "website": "https://www.example.com"
    }
  },
  "productGroups": [
    {
      "name": "Brand Name",
      "modelorder": 1,
      "products": [
        {
          "item_name": "Brand Name",
          "description": "Plain-text summary",
          "modelorder": 1,
          "calories": 0,
          "ingredients": "",
          "item_type": "Product",
          "deliverable": false,
          "productImages": [
            { "image_url": "https://cdn.supabase.co/.../variant.jpg", "modelorder": 1 }
          ],
          "campaignItemButtons": [
            {
              "name": "Button Label",
              "buttonType": 4,
              "backgroundColor": "#F99D32",
              "foregroundColor": "#FFFFFF",
              "properties": [
                { "propertyDefinitionId": 20, "propertyValue": "https://...", "propertyName": "URL" }
              ],
              "shape": 1,
              "buttonAlign": 1,
              "textAlign": 1,
              "enabled": true
            }
          ],
          "medialinks": []
        }
      ]
    }
  ],
  "medialinks": [
    {
      "name": "Facebook",
      "icon": "https://www.google.com/s2/favicons?domain=...",
      "link_url": "https://facebook.com/brand",
      "buttonCategoryId": 1,
      "modelorder": 1
    }
  ]
}
```

### Excel Export (`.xlsx`)

| Sheet | Contents |
|-------|---------|
| **Descriptions** | Brand name, all URLs, all 4 summaries |
| **CTAs** | Source, button name, type, URL, context |
| **Social Links** | Platform + URL |
| **Palette** | 5 hex colour values + role description |
| **Button Styles** | Shape, border radius, colours, font, padding |

### History Tab

- Groups past extractions by domain
- Shows all URLs entered per extraction (Website 🌐 / YouTube ▶ / Profile 👤)
- Copy icon on each URL pill (copies full URL to clipboard)
- **Review** button restores the full extraction to the Dashboard
- Delete by individual record or entire domain

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key (AI verification) |

### Optional but Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `YOUTUBE_API_KEY` | `null` | YouTube Data API v3 key. Falls back to Puppeteer scrape without it |
| `SUPABASE_URL` | `null` | Supabase project URL. Without this, images use localhost fallback paths |
| `SUPABASE_ANON_KEY` | `null` | Supabase publishable key for storage uploads |
| `GCP_PROJECT_ID` | `null` | Google Cloud project ID (for Vertex AI Imagen outpainting) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `null` | Path to GCP service account JSON key file |
| `FIRECRAWLER_API_KEY` | `null` | Firecrawl fallback scraping API |
| `RENDER_EXTERNAL_URL` | `null` | Set automatically by Render.com. Used to build absolute image URLs |
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `development` | `development` or `production` |

### Frontend Only (Vite)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | Auto-detected | Override the backend API base URL. Not needed for localhost dev |

---

## API Reference

### `POST /api/extract`

Triggers a full extraction pipeline.

**Request body:**
```json
{ "url": "string", "youtubeUrl": "string", "profileUrl": "string" }
```

**Success response (200):**
```json
{
  "success": true,
  "isVerified": true,
  "isWaybackFallback": false,
  "data": { ... },
  "youtubeData": { ... },
  "screenshotUrl": "string",
  "buttonStyles": [ ... ],
  "ctas": [ ... ],
  "socialMediaLinks": [ ... ],
  "featuredImages": [ ... ],
  "profilePayload": { ... }
}
```

**Error response (4xx/5xx):**
```json
{
  "error": "Human-readable message",
  "stage": "pipeline-stage-name",
  "elapsed": "12.3",
  "hint": "Actionable fix suggestion"
}
```

Rate limit: **5 requests per minute per IP**.

---

### `GET /api/history`

Returns all past extractions, newest first.

**Response:** Array of history records (Supabase rows or local JSON entries).

---

### `DELETE /api/history`

Delete history by domain or by timestamp.

**Request body (domain):** `{ "domain": "strava.com" }`  
**Request body (single):** `{ "timestamp": "2026-04-18T00:00:00.000Z" }`

---

### `GET /api/health`

Returns server uptime and env var status. Safe to call without authentication.

---

### `GET /api/download?url=...&filename=...`

Secure proxy for downloading Supabase or Google Favicon images. Only allows Supabase CDN and Google Favicon domains (SSRF-protected).

---

## File Structure

```
/
├── server.js                  # Express API server + history endpoints
├── extractor.js               # Core Puppeteer scraping pipeline (~75 KB)
├── ai_verifier.js             # Gemini AI verification module
├── youtube_extractor.js       # YouTube Data API + scrape fallback
├── supabaseClient.js          # Supabase client initialisation
├── logger.js                  # Structured logging helper
├── config/
│   └── env.js                 # Environment variable loader + validation
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Main React application (~1900 lines)
│   │   ├── index.css          # Design system + global styles
│   │   ├── loading.css        # Loading spinner animations
│   │   └── main.jsx           # React entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── outputs/
│   └── history.json           # Local history fallback (auto-created)
├── .env                       # Local env vars (NOT committed to git)
├── .env.example               # Template for env setup
├── package.json               # Root package (backend deps + scripts)
├── Dockerfile                 # Production container for Render
└── supabase_setup.sql         # Supabase table schema (run once)
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- npm 9+
- A `.env` file with at least `GEMINI_API_KEY` set

### Steps

```bash
# 1. Install all dependencies (root + frontend)
npm install
cd frontend && npm install && cd ..

# 2. Copy env template and fill in your keys
cp .env.example .env

# 3. Start both backend and frontend (hot-reload)
npm run dev
```

**URLs:**
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Health: `http://localhost:3001/api/health`

### Supabase Setup (one-time)

Run `supabase_setup.sql` in your Supabase SQL editor to create the `extraction_history` table and storage bucket policies.

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `puppeteer` + `puppeteer-extra-plugin-stealth` | Headless browser scraping with bot-detection evasion |
| `@google/generative-ai` | Google Gemini AI for brand data verification |
| `@google-cloud/vertexai` | Vertex AI Imagen for image outpainting |
| `@supabase/supabase-js` | Database + CDN image storage |
| `sharp` | Server-side image processing and resizing |
| `express` + `cors` + `express-rate-limit` | REST API, CORS policy, rate limiting |
| `xlsx` (frontend) | Excel export generation in-browser |
| `react` + `vite` | Fast frontend framework + dev server |
| `concurrently` + `nodemon` | Dev experience: hot-reload both servers together |

---

## Business Benefits

### For Minfo Campaign Managers

| Benefit | Detail |
|---------|-------|
| **10× faster campaign creation** | What takes hours of manual brand research is done in ~2 minutes |
| **No design skills needed** | Colours, fonts, button styles, and images are extracted automatically |
| **One-click Minfo import** | The JSON export exactly matches the Minfo campaign import schema — paste and go |
| **Multi-source enrichment** | Combines website, YouTube, and profile data for a richer brand picture |
| **AI-verified accuracy** | Gemini cross-checks raw scraped data against the live screenshot to catch errors |

### For Brand Teams

| Benefit | Detail |
|---------|-------|
| **Instant brand audit** | See your own (or competitor) brand colours, CTAs, and social presence in seconds |
| **Consistent brand application** | Extracted hex values and button styles ensure pixel-perfect reproduction |
| **Image variants ready to use** | Clean + Tagged 640×640 outpainted variants are production-ready for digital ads |
| **Historical record** | Every extraction is saved with full payload — compare extractions over time |

### For Developers / QA

| Benefit | Detail |
|---------|-------|
| **Robust extraction pipeline** | 3-stage fallback: live site → Wayback Machine → lightweight scrape |
| **Structured error reporting** | Every failure reports stage, elapsed time, and an actionable fix hint |
| **Rate-limited & SSRF-protected** | Built-in protection against abuse and server-side request forgery |
| **Exportable for analysis** | Excel export enables QA review of all extracted brand data in a spreadsheet |

---

## Known Limitations & Notes

| Limitation | Detail |
|------------|-------|
| **Bot-protected sites** | Sites behind Cloudflare Turnstile or strict WAF may block extraction |
| **Login-gated pages** | Pages requiring authentication cannot be scraped headlessly |
| **Old history records** | Records saved before v1.0 (no payload) cannot be Reviewed — re-extract to refresh |
| **Localhost image URLs** | Images uploaded during local dev use `localhost` URLs which Minfo cannot access. Use the Render deployment for production image URLs |
| **Vertex AI outpainting** | Requires GCP credentials configured in `.env`. Skipped gracefully if not set |
| **YouTube API quota** | YouTube Data API has a daily quota. Falls back to Puppeteer scrape when exceeded |
| **Rate limit** | 5 extractions per minute per IP. Intentional to protect Puppeteer from DoS |

---

*Generated: April 2026 · Website DNA Extractor v1.0.0*
