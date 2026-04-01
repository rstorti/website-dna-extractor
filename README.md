# Website DNA Extractor

This repository contains both a Node.js/Express backend service parsing visually dense brands & data, and a React/Vite frontend dashboard serving UI insights via Google's Gemini Vision architecture.

## Requirements

1. Node.js (v18+)
2. Valid API keys for Supabase, Gemini Vision Pro, and YouTube (Data API v3).

## Project Setup

1. **Install Root Backend Dependencies**
   ```bash
   npm install
   ```

2. **Install Frontend Dependencies**
   ```bash
   cd frontend
   npm install
   ```

3. **Configure Local Environment**
   Duplicate `.env.example` in the root folder, rename it to `.env`, and populate all the empty keys securely.
   *(Never commit `.env` or `.env.local` to version control).*

---

## Running Locally

**Start both servers (concurrently)**
```bash
npm run dev
```

Alternatively, run them separately:
- Backend: `npm run server`
- Frontend: `npm run client`

## Production Deployment

**Frontend (Lovable / Netlify / Vercel)**
- Build Command: `npm run build` (or `cd frontend && npm install && npm run build`)
- Output Directory: `frontend/dist`
- Environment Variables: Map `.env.example` secrets directly into your hosting GUI. Ensure you set `VITE_API_URL` to route correctly to your hosted Express Backend.

**Backend (Render.com / Custom Container)**
- This codebase runs an Express server interacting heavily with Puppeteer headless chrome. It is highly recommended to host on standard unmetered nodes (Render.com or standard VPS) to avoid arbitrary timeouts on Edge Serverless infrastructures.
- Build/Start Commands: `npm install` && `npm run start`

## Migration Specifics
For detailed integration into Lovable.dev, please review [`docs/migration-to-lovable.md`](./docs/migration-to-lovable.md) located inside the repo.
