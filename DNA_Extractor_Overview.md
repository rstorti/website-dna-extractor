# Website DNA Extractor: Overview & Architecture

## Core Purpose
The Website DNA Extractor is an advanced reconnaissance and content extraction tool. Its primary benefit is automating what would otherwise be hours of manual brand auditing: it ingests a target website, YouTube video, or Profile link, and autonomously digests the site's visual identity, campaign messaging, primary assets, and calls to action, generating a fully compatible schema mapped perfectly for the Minfo platform ecosystem.

## Inputs
The application accepts three primary data inputs via a simplified UI form:
1. **Target URL (Website):** A standard HTTP/HTTPS web address. This is crawled via Puppeteer (and optionally Firecrawl) to map the brand's DOM tree, analyze stylesheets, and locate hero images.
2. **YouTube Video URL:** A link to a YouTube asset. This triggers a dedicated extraction pipeline that circumvents standard scrape protections to retrieve the video title, description, and channel provenance.
3. **Link-in-Bio / Profile URL:** An aggregator link (e.g., Linktree) which is traversed to identify critical outbound routing strategies for the campaign's calls-to-action.

## Outputs
The app distills chaos into a structured `Minfo JSON payload` consisting of the following computed values:
1. **Brand Identity Tokens:** Background, foreground, and accent palette colors extracted safely via CSS analysis.
2. **Visual Assets:**
   - **Logo:** AI-isolated and padded target brand logo suitable for campaign identity.
   - **Campaign Images:** Perfectly 640x640 cropped hero images derived from the page DOM.
   - **Variant Imagery (Safety Net):** If usable photography is absent, Vertex AI automatically synthesizes context-aware product imagery and applies strict typographic overlays (clean/tagged variants).
3. **Calls to Action (CTAs):** Actionable, contextually aware buttons analyzed through semantic HTML tags, mapped to real URLs.
4. **Social Graph:** Linked entity accounts (LinkedIn, Twitter, Facebook) cleanly isolated from footers.
5. **AI Summarization:** A `Gemini 3.1 Pro Piewview` analyzed description of the target brand's core mission statement and SEO relevance.

## Benefits & Value Proposition
- **Turnkey Onboarding:** Reduces campaign creation latency from days to minutes.
- **Fail-Fast Defense:** Designed to gracefully manage unstable targets via "retry/fallback/archive" handling. If a site's SSL fails, it switches to `www.`. If the DOM drops, it utilizes Wayback Machine archives.
- **Format Consistency:** Enforces strict adherence to Minfo's precise JSON schema and datatype requirements, ensuring seamless end-to-end integrability.
- **Brand Protection:** Automated Vision Models ensure logos and overlay type don't obscure focal products, while strict UI validators enforce schema rules before any processing takes place.
