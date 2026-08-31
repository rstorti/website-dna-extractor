# Website DNA Extractor: Overview & UX Vision

## 1. What the App Does Today (Standalone Tool)
The **Website DNA Extractor** is a powerful, standalone intelligence tool designed to eliminate the manual data-entry friction typically required to create digital campaigns. By providing the app with a simple source URL (a company website, YouTube video, Link-in-Bio, or LinkedIn profile), it acts as an automated brand scraper and AI analyzer. 

**Core Capabilities:**
*   **Visual DNA Extraction:** Autonomously scrapes and determines the brand's exact color palette (primary, secondary, background, foreground) and typography/button styles.
*   **Asset Harvesting:** Detects, downloads, and intelligently crops high-resolution logos and hero/product images.
*   **Content Synthesis:** Utilizes generative AI (Gemini) to read the context of the website, video, or profile, and synthesizes a concise, professional "Campaign Description" summarizing the brand.
*   **Call-to-Action (CTA) & Social Mapping:** Scrapes all valid buttons and links, categorizing them into relevant social media channels and actionable campaign buttons.
*   **JSON Payload Generation:** Assembles all extracted "DNA" into a structured, highly complex JSON payload that strictly adheres to the Minfo Backend Schema, ready for immediate import.

Currently, this requires a user to open the standalone web dashboard, wait for the AI to finish, manually verify the visual results, and explicitly download the JSON to import elsewhere.

---

## 2. The Vision: Automated UX/UI Integration (Minfo App)
To dramatically improve the User Experience (UX), the goal is to shift this technology from a "standalone developer tool" into an **invisible, automated engine** embedded natively within the Minfo Flutter App. 

By integrating the DNA Extractor API directly into the mobile application, we transition the user journey from manual data-entry to an intuitive **"Review & Publish"** workflow.

### The Automated Workflow Experience:
1.  **The "One-Tap" Entry:** When a company representative taps "Create Minfo Page" in the Flutter app, they are presented with a single, simple input field: *"What is your website URL?"* (with optional fields for YouTube or LinkedIn).
2.  **Invisible Processing:** The user taps "Generate" and is met with a sleek, animated loading screen ("Scanning your brand DNA..."). In the background, the Flutter app securely communicates with the DNA Extractor API. 
3.  **The Pre-Filled Draft:** Instead of forcing the user to type descriptions, upload logos, and guess hex color codes, the app receives the Extractor's payload and instantly pre-fills the entire Campaign Creation form.
4.  **Human-in-the-Loop Review:** The user is dropped into an interactive "Review Screen". They see their brand already fully built. They can easily:
    *   Swap out the AI-selected images using a visual carousel of all scraped images.
    *   Tweak the generated summary text.
    *   Toggle scraped social links or CTAs on/off.
5.  **Instant Publish:** Once verified, a single "Publish" button securely posts the validated campaign to the Minfo backend. 

### Why this improves UX/UI:
*   **Eliminates Friction:** Reduces a 30-minute manual setup process down to 60 seconds of AI processing and 30 seconds of human review.
*   **Maintains Quality Control:** By acting as a "Draft Generator," it prevents the AI from publishing mistakes autonomously, keeping the brand owner in complete control.
*   **Increases Adoption:** A "magical" onboarding experience where the app already knows what the brand looks like significantly lowers the barrier to entry for new business clients creating Minfo pages.
