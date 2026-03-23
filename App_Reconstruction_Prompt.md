# Website DNA Extractor - Application Reconstruction Prompt

**Objective:**
Recreate a full-stack automated "Website DNA Extractor" application from scratch. The application must analyze a given URL, extract its core brand identity (colors, fonts, logos, social media, CTAs), and programmatically generate high-quality, pixel-perfect 1:1 hero images strictly following the "Pomelli Standard" design system.

The application must consist of a Node.js/Express backend for orchestration and web scraping, and a React/Vite frontend using a premium, modern "glassmorphism" aesthetic.

## 1. Technical Stack Requirements
*   **Backend:** Node.js, Express.js.
*   **Web Scraping & DOM Analysis:** Puppeteer (headless Chrome) mapped exactly to find logos, buttons, headers, and backgrounds.
*   **Image Processing & ML Integration:**
    *   `sharp` for lightning-fast image resizing, cropping, and compositing.
    *   Google Cloud Vertex AI (Imagen 3) using `@google-cloud/aiplatform` for high-end text-to-image/outpainting generation strictly yielding a `1:1` aspect ratio.
    *   Google Gemini Pro (`@google/generative-ai`) to intelligently analyze the DOM scraped JSON to understand the campaign and synthesize 2 distinct, highly-convertible prompts.
*   **Frontend UI:** React 18, Vite, pure Vanilla CSS (no Tailwind/Bootstrap).

## 2. Backend Orchestration Flow (`extractor.js` & `server.js`)
Build an extraction pipeline (`POST /api/extract { url }`) that performs the following sequence:

1.  **Headless Navigation:** Boot Puppeteer, inject stealth mechanisms, navigate to the target URL, and auto-scroll completely to force lazy-loading. Take a full-width screenshot (`1920x1080` base).
2.  **DOM DNA Extraction:** Inject a deterministic script into the page context.
    *   Extract the largest, highest-contrast Logo.
    *   Extract exact computed CSS styles of all buttons (`<button>`, `<a>` acting as buttons), capturing `backgroundColor` and `color`.
    *   Extract all Social Media links.
    *   Extract all large image URLs (ignoring icons, SVGs, capturing primarily background hero/banner imagery).
    *   Extract headers (H1, H2) and `<meta charset="utf-8" name="description">` content.
3.  **LLM Understanding (Gemini):** Pass the raw DOM JSON block to Gemini. Instruct it to output pure JSON containing:
    *   A concise description of the company/campaign.
    *   `cleanPromptA` & `cleanPromptB`: Detailed image generation prompts describing the brand aesthetic.
    *   `taglineA` & `taglineB`: Punchy marketing copy max 4-6 words.
    *   The primary brand hex color.
4.  **Vertex AI Image Generation (The 2x2 Grid Guarantee):**
    *   Attempt to generate base 1:1 images using Vertex Imagen 3 (`generateBrandHero`) using `cleanPromptA` and `cleanPromptB`.
    *   **CRITICAL FALLBACK:** If Vertex AI throws any safety flags, quota limits, or crashes, the system *must* fall back to using the highest-resolution scraped images from step 2.
    *   *The Pomelli Output Standard:* 4 Images strictly generated (Wait 2.5s between API calls to prevent rate limits):
        *   Image 1: Clean Variant A (`fit: 'cover'` to 640x640).
        *   Image 2: Text Variant A (Clean A + dynamically overlaid `taglineA`).
        *   Image 3: Clean Variant B (`fit: 'cover'` to 640x640).
        *   Image 4: Text Variant B (Clean B + dynamically overlaid `taglineB`).
5.  **Autonomous Vision API (Mathematical Placement):**
    *   Before rendering text on the images, perform mathematical variance/entropy analysis (`sharp.stats()`) on the top, middle, and bottom thirds of the 1:1 image.
    *   Choose the region with the lowest visual variance to anchor the SVG text overlay to prevent obscuring human faces/products. Ensure text uses a heavy white font with a dark drop shadow for maximum readability.
6.  **Persistence:** Write the final computed payload (including relative paths to the 4 generated 640x640 JPEGs) to an aggregated `history.json` file to power a dashboard history tab, and return it to the frontend via the REST endpoint. Include a direct route to serve static output files (`/outputs`).

## 3. Frontend UI / Experience Rules (`App.jsx` & `index.css`)
Design a breathtaking, modern interface using pure responsive CSS grid.
*   **Theme:** Dark mode by default (`#1e1e20` background). The primary accent color must be dynamic based on the extracted brand DNA, defaulting to Minfo Orange (`#f99d32`).
*   **Layout Structure:**
    *   A cohesive glassmorphism card for the main URL input.
    *   A loading state that clearly visualizes the exact pipeline steps occurring (Scraping DOM... Calling Gemini... Generating Images...).
*   **Data Visualization Rules:**
    *   A "Top Header" glass panel displaying the extracted Logo on the left and the Gemini-summarized campaign description on the right.
    *   A "Social Media" section categorizing links into distinct, stylized pills for Facebook, Twitter, LinkedIn, etc., with click-to-copy functionality.
    *   A "Button Interaction" section rendering literal HTML buttons matching the exact extracted hex codes, demonstrating hover states.
*   **The Pomelli 2x2 Image Grid (CRITICAL):**
    *   The 4 generated hero images (640x640) must be displayed in a strict `grid-template-columns: 1fr 1fr`.
    *   The images must fill the container perfectly (`aspect-ratio: 1`, `object-fit: cover`), rounded corners, with a subtle hover zoom effect.
    *   The **Download Buttons** overlaid on these images must be ultra-minimalist bottom-center pills: translucent dark background (`rgba(0,0,0,0.5)`), thin solid orange border, orange text, and a clean feather-style SVG download icon. The emoji `⬇️` is strictly forbidden.
*   **History Sidebar:** Implement a sidebar fetching data from `GET /api/history` displaying past extractions as clickable cards to instantly reload old states to the main view.

## 4. Deployment Pipeline Configuration
*   Containerize the entire repository so it can be deployed on Render/AWS AppRunner mapping the frontend Vite build inside the Node environment. 
*   Use `ghcr.io/puppeteer/puppeteer:latest` as the base Docker image so that the 200MB Chromium binaries are properly bundled securely, skipping post-install downloads. 
*   Ensure `server.js` uses `app.use(express.static('frontend/dist'))` and catches wildcard routes `app.get('*')` to serve the fully compiled SPA correctly.

Build the Node server, puppeteer scraping logic, image pipeline, React UI, CSS styling, and deployment scripts exactly as defined to fulfill these criteria.
