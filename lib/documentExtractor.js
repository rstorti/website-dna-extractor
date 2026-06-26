/**
 * Document Extractor — Parses uploaded PDFs/DOCX and extracts structured
 * entity data (people, places, products) using Gemini AI.
 *
 * Supports: PDF (via pdf-parse v2), plain text files
 */
const { PDFParse } = require('pdf-parse');
const path = require('path');

/**
 * Extract raw text content from an uploaded file buffer.
 * @param {Buffer} fileBuffer - The file content
 * @param {string} originalName - Original filename (used for extension detection)
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromDocument(fileBuffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.pdf') {
    const parser = new PDFParse({ verbosity: 0, data: new Uint8Array(fileBuffer) });
    await parser.load();
    const result = await parser.getText();
    const text = result.pages.map(pg => pg.text).join('\n');
    if (!text || text.trim().length < 20) {
      throw new Error('PDF appears to be empty or image-only. Text extraction yielded insufficient content.');
    }
    return text;
  }

  if (ext === '.txt' || ext === '.md') {
    return fileBuffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${ext}. Supported types: .pdf, .txt, .md`);
}

/**
 * Build the Gemini prompt that extracts structured entities from document text.
 * This aligns with the existing DNA Extractor categories: name, description,
 * images, CTAs, social links, etc.
 *
 * @param {string} documentText - The raw text extracted from the document
 * @param {string} [brandWebsiteUrl] - Optional brand website for context
 * @returns {string} The prompt string
 */
function buildExtractionPrompt(documentText, brandWebsiteUrl) {
  return `You are the Minfo Campaign Extraction Agent. Analyze the following document text and extract ALL named entities that could become items in a Minfo campaign page.

DOCUMENT TEXT:
---
${documentText.substring(0, 30000)}
---

${brandWebsiteUrl ? `BRAND WEBSITE: ${brandWebsiteUrl}` : ''}

TASK: Extract every person, place, product, or organization mentioned in this document. For each entity, provide structured data.

Return ONLY a valid JSON object with this exact structure:
{
  "documentTitle": "The title or subject of the document",
  "documentType": "One of: film, tv_series, documentary, youtube_haul, youtube_review, podcast, event, restaurant, product_catalog, company, real_estate, music, fashion, portfolio, book, course, wedding, travel, sports, nonprofit, generic",
  "entities": [
    {
      "name": "Full name of the person/place/product",
      "entityType": "person|place|product|organization",
      "subType": "For people: actor, director, producer, crew, consultant, creator, chef, executive, speaker, musician, other. For places: restaurant, hotel, museum, venue, landmark, filming_location, natural_site, other. For products: physical, digital, menu_item, track, episode, course_module, other",
      "role": "Their specific role in this context (e.g. 'as Omar', 'Director', 'Filming Location')",
      "description": "A 2-4 sentence description combining what the document says about them. Be factual and engaging.",
      "groupSuggestion": "Suggested group name for this entity (e.g. 'Proposed Cast', 'Production Team', 'Locations — Vancouver', 'Menu — Starters')",
      "searchQuery": "The best Google search query to find their official website/profile (e.g. 'Sir Ben Kingsley actor IMDB')",
      "imdbLikely": true,
      "linkedinLikely": false,
      "locationAddress": "For places only: full address or location description if mentioned",
      "ctaSuggestion": "Suggested CTA label (e.g. 'View on IMDB', 'Plan Your Visit', 'Book Now')"
    }
  ],
  "suggestedGroups": [
    {
      "name": "Group display name",
      "entityCount": 0,
      "description": "Brief description of what this group contains"
    }
  ]
}

RULES:
- Include EVERY named person, place, product, or organization from the document
- Do NOT invent entities not present in the document
- Group names should match the document's own section headings where possible
- For people in entertainment (actors, directors): set imdbLikely=true
- For business/corporate people: set linkedinLikely=true
- Description must be factual — only state what the document says
- searchQuery should be specific enough to find the RIGHT person/place (include context like profession, company, or location)
- Return ONLY the JSON object, no markdown fences, no explanation`;
}

/**
 * Send document text to Gemini for entity extraction.
 * @param {string} documentText - Raw text from the document
 * @param {string} [brandWebsiteUrl] - Optional brand website URL
 * @returns {Promise<object>} Parsed extraction result
 */
async function extractEntitiesWithAI(documentText, brandWebsiteUrl) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const env = require('../config/env');

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = buildExtractionPrompt(documentText, brandWebsiteUrl);

  const result = await model.generateContent(prompt);
  const response = result.response;
  let text = response.text();

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(text);
    // Validate structure
    if (!parsed.entities || !Array.isArray(parsed.entities)) {
      throw new Error('AI response missing entities array');
    }
    return parsed;
  } catch (parseErr) {
    console.error('[DOC-EXTRACT] Failed to parse AI response:', text.substring(0, 500));
    throw new Error(`AI returned invalid JSON: ${parseErr.message}`, { cause: parseErr });
  }
}

module.exports = {
  extractTextFromDocument,
  extractEntitiesWithAI,
  buildExtractionPrompt,
};
