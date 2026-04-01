# Migration to Lovable: Strategy & Checklists

This document outlines the current technical architecture and the required steps to successfully migrate and configure this project within Lovable.dev.

## 1. Tech Stack Overview
- **Frontend Framework:** React 18, Vite 5.
- **Backend Framework:** Node.js, Express (orchestrates data extraction pipelines).
- **Core Runtime Dependencies:** Puppeteer (web scraping), `sharp` (image processing), `pdf-parse`.
- **Database / ORM:** Supabase (Remote File Storage).
- **External Interfaces:**
  - Google Gemini Vision 2.5 (`@google/generative-ai`)
  - Google Vertex AI Imagen 3.0 (`@google-cloud/aiplatform`)
  - YouTube Data API
  - Firecrawler API (Optional fallback)

## 2. Current Deployment Targets
- **Frontend:** Currently deployed statically via Vite build step (e.g. Netlify/Vercel).
- **Backend:** Currently deployed as an Express `server.js` service (e.g. Render.com or custom VPS) due to headless browser requirements. 
- **Important Note:** Supabase is currently strictly used for cloud picture object persistence (`supabaseClient.js`), not as a classic Postgres database.

## 3. Environment & Secrets in Lovable
The project configuration has been refactored strictly behind a single runtime configuration module (`src/config/env.js`).
1. **Source of Truth:** The local `.env.example` formally documents the exact spelling and expected format for every variable.
2. **Setup in Lovable Cloud:** In the Lovable platform, navigate to **Cloud → Secrets** and directly port over the definitions from `.env.example`.
3. **Security Contexts:**
   - **Public keys:** Currently, NO keys are exposed directly into the Vite build step (frontend). The frontend explicitly delegates to your proxy domain. *If* required by Lovable's Edge deployment later, any variables injected into Vite must be prefixed with `VITE_` (e.g. `VITE_SUPABASE_URL`).
   - **Server-only secrets:** `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `SUPABASE_ANON_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, etc., must be strictly kept Server-Side (Render/Lovable Secrets).

## 4. External Integrations Alignment

### AI Providers
| Provider | Initialization | Required Env Vars | Client Loc |
|---|---|---|---|
| **Google Gemini** | `@google/generative-ai` | `GEMINI_API_KEY` | Server-Side |
| **Google Vertex (Imagen)** | `@google-cloud/aiplatform` | `GCP_PROJECT_ID`, `GCP_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS` | Server-Side |

### YouTube API
- **Usage:** Validates channel branding and video description texts (API limits bypassed locally).
- **Required Env Var:** `YOUTUBE_API_KEY` (or historically mapped `VITE_YOUTUBE_API_KEY`).
- *(Note: There are no Webhooks or Redirect URIs required to map for YouTube).*

### Supabase
- **Usage:** Currently persisting cropped/analyzed branding images from Puppeteer extractions into the remote `outputs` storage bucket.
- **Required Vars:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- **Future Alignment:** It is advised to migrate History JSON extraction capabilities to a Supabase Postgres relation later to deeply tie into Lovable's native Database GUI.

### Netlify Deployment
- **`netlify.toml`**: Configures the base `frontend/dist` publish directory with redirect rewrites `/* /index.html 200` to support React Router natively.
- **Lovable Mapping**: Lovable natively identifies Vite projects. You simply need to point Lovable's build command to `cd frontend && npm install && npm run build` and output directory to `frontend/dist`. 

## 5. Antigravity-Only Artifacts
When migrating the codebase into Lovable you will likely notice various system-generated files. They do **not** impact your Web App and can be ignored or safely removed by Lovable's AI.
- **`western-verve-701-4a02ba21c2c8.json`**: This is a direct Service Agent credential specifically installed in this workspace for Gemini Vertex authorization. In Lovable, map the string credentials securely as a text environment string or explicit secret rather than maintaining a hardcoded local file tracking.
- **`App_Reconstruction_Prompt.md`**: Developer roadmap context exclusively for agents. Safe to ignore.

### Recommended Manual Steps
If you plan to utilize Lovable's native "Knowledge" platform, you shouldn't rely on existing Antigravity context windows blindly. 
1. Ignore or delete `.code-workspace` telemetry.
2. Manually re-upload `Brand Style.docx` into Lovable's Knowledge Base if you want the Lovable assistant to understand Minfo's brand guidelines explicitly.
3. You do not need to preserve `git_history.txt`, `out.log`, or `error.log`. Lovable starts completely fresh with standard clean Git state.

## 6. Migration Checklist into Lovable

- [ ] Connect this repository to your Lovable project.
- [ ] Transfer all secret keys detailed within `.env.example` exactly matching casing into Lovable **Cloud → Secrets**.
- [ ] Map the build paths (Build Command: `cd frontend && npm install && npm run build` and Output: `frontend/dist`).
- [ ] *(Optional but necessary for full backend parity)* Deploy the `server.js` Express backend environment (which encapsulates `Puppeteer`/Express) since traditional Edge/Serverless functions often timeout parsing visual websites. If hosting the backend natively on Render.com, inject all secrets into the exact same Render Dashboard variables.
- [ ] Test the pipeline end-to-end using a sample website query to verify backend API latency limitations match expectation.
