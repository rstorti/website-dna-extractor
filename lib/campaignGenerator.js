'use strict';

const env = require('../config/env');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, removeAdditional: false });

const genAI = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY) : null;

// Minfo Campaign Payload Schema from MINFO_JSON_IMPORT_BRIEF.md
const campaignImportSchema = {
  type: "object",
  properties: {
    campaign: {
      type: "object",
      properties: {
        campaignName: { type: "string", maxLength: 100 },
        campaignDescription: { type: "string", maxLength: 4000 }, // HTML description
        campaignType: { type: "integer", enum: [1] },
        brand: {
          type: "object",
          properties: {
            name: { type: "string" },
            logo: { type: ["string", "null"] }
          },
          required: ["name"]
        }
      },
      required: ["campaignName", "campaignDescription", "campaignType", "brand"]
    },
    campaignItemButtons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          buttonName: { type: "string", maxLength: 80 },
          type: { type: "integer" }, // e.g., 1 = URL redirect
          url: { type: "string" },
          order: { type: "integer" },
          action: { type: "integer" }
        },
        required: ["buttonName", "type", "url"]
      }
    },
    idempotencyKey: { type: "string" }
  },
  required: ["campaign", "campaignItemButtons"]
};

const validateCampaign = ajv.compile(campaignImportSchema);

/**
 * Validates a campaign payload against the Minfo schema.
 */
function validateMinfoCampaign(payload) {
  const valid = validateCampaign(payload);
  if (!valid) {
    return { valid: false, errors: validateCampaign.errors };
  }
  return { valid: true };
}

/**
 * Parses tone-of-voice and guidelines documents into structured brand rules.
 */
async function parseStyleGuide(documentText, sourceFileName) {
  if (!genAI) {
    throw new Error('Gemini API key is not configured.');
  }

  const modelName = "gemini-1.5-pro";
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `
You are an expert brand analyst. Parse the following brand guidelines / style guide / document text and extract the visual and editorial rules.

Return a JSON object matching this structure:
{
  "themeColors": [
    { "colorName": "Primary Red", "hex": "#E50914", "context": "Main brand color, logos, links" }
  ],
  "brandFonts": {
    "headings": "Helvetica Neue",
    "body": "Arial"
  },
  "visualGuidelines": [
    "Do not overlay text on logos",
    "Use a clean white background where possible"
  ],
  "toneOfVoice": "Professional, informative, inviting",
  "approvedCtas": [
    "Get Started",
    "Start Free Trial"
  ],
  "keyMessaging": [
    "We simplify digital workflows"
  ]
}

Document Text:
${documentText}
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    // Track the source file for traceability
    const rulesWithSource = {
      ...parsed,
      sourceFile: sourceFileName
    };
    return rulesWithSource;
  } catch (error) {
    console.error(`[STYLE-GUIDE-PARSER] Failed to parse guide using ${modelName}:`, error.message);
    throw new Error(`Failed to parse brand guidelines: ${error.message}`, { cause: error });
  }
}

/**
 * Merges website DNA with style-guide rules to generate a campaign object with decision provenance.
 */
async function generateCampaignFromDna(brandDna, styleGuideRules = null) {
  if (!genAI) {
    throw new Error('Gemini API key is not configured.');
  }

  const modelName = "gemini-1.5-pro";
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `
You are an expert campaign designer. You need to generate a complete, structured campaign payload matching the Minfo style guide and import schema, based on the provided website DNA and optional style guide rules.

The final output MUST contain:
1. "campaign": with campaignName, campaignDescription (HTML format suitable for rendering, up to 4000 characters), campaignType (always 1), and brand name/logo.
2. "campaignItemButtons": list of action buttons mapped from calls-to-action (CTA) with buttonName, type (1 = URL link), url, and action (1 = external redirect).
3. "imagePrompts": 2 distinct concepts (Concept A and Concept B) demanding hyper-realistic, DSLR commercial photography relevant to the campaign, matching the Pomelli standard.
4. "decisionProvenance": A dictionary mapping key campaign decisions (primaryColor, fontHeadings, tagline, logo, campaignDescription, ctas) to their chosen values, source ("style-guide" or "website-dna" or "ai-synthesized"), and a specific rationale detailing why this choice was made (especially tracking if a style guide rule overrode a website DNA scraped value).

Provided Inputs:
- Website DNA:
${JSON.stringify(brandDna, null, 2)}

- Style Guide Rules:
${JSON.stringify(styleGuideRules, null, 2)}

Return a JSON object matching this structure:
{
  "campaign": {
    "campaignName": "...",
    "campaignDescription": "...",
    "campaignType": 1,
    "brand": {
      "name": "...",
      "logo": "..."
    }
  },
  "campaignItemButtons": [
    { "buttonName": "...", "type": 1, "url": "...", "order": 1, "action": 1 }
  ],
  "imagePrompts": {
    "conceptA": "...",
    "conceptB": "..."
  },
  "decisionProvenance": {
    "primaryColor": { "value": "...", "source": "...", "rationale": "..." },
    "tagline": { "value": "...", "source": "...", "rationale": "..." },
    "logo": { "value": "...", "source": "...", "rationale": "..." },
    "description": { "value": "...", "source": "...", "rationale": "..." },
    "fontHeadings": { "value": "...", "source": "...", "rationale": "..." }
  }
}
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const campaignOutput = JSON.parse(responseText);

    return campaignOutput;
  } catch (error) {
    console.error(`[CAMPAIGN-GEN] Generation failed using ${modelName}:`, error.message);
    throw new Error(`Failed to generate campaign assets: ${error.message}`, { cause: error });
  }
}

module.exports = {
  validateMinfoCampaign,
  parseStyleGuide,
  generateCampaignFromDna
};
