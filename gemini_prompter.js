const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('./config/env');

// Module-level singleton — the SDK is designed to be created once and reused.
const _genAI = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY) : null;

async function generateHeroPrompts(dnaData) {
    if (!_genAI) {
        console.warn("⚠️  [Gen AI] GEMINI_API_KEY is missing from env. Skipping prompt generation.");
        return null;
    }

    const model = _genAI.getGenerativeModel({
        model: 'gemini-3.1-pro-preview',
        generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.8,
            topP: 0.95,
            responseMimeType: "application/json",
        },
    });

    const aiPrompt = `
You are a master prompt engineer and creative director.
Based on the following website DNA extracted from a brand's actual website, your job is to write TWO highly detailed, photorealistic prompts for an image generation AI (Imagen 3) to generate square (1:1) ad images, AND write two short marketing taglines.

Website DNA:
- Name/Brand: ${dnaData.title}
- Description: ${dnaData.description}
- Primary Colors (Backgrounds): ${dnaData.colors?.background ? dnaData.colors.background.join(', ') : ''}
- Accent Colors (Buttons): ${dnaData.colors?.buttons ? dnaData.colors.buttons.map(b => b.background).join(', ') : ''}

CRITICAL QUALITY INSTRUCTION (POMELLI STYLE):
All image prompts MUST demand raw, hyper-realistic, award-winning 35mm DSLR photography. DO NOT generate illustrations, 3D renders, vector art, or video game graphics. The images must look like bright, inviting, premium commercial lifestyle photos or studio product shots directly relevant to the brand's business. DO NOT generate dark, moody, abstract, or sci-fi scenes (unless the brand is strictly a sci-fi game). The aesthetic should feel like a multi-million-dollar bright, clean Google Pomelli photo ad campaign. Use the brand colors elegantly.

CRITICAL LAYOUT INSTRUCTION:
The images MUST NOT contain any text, typography, or logos natively. The background should have some negative space in the center/upper area for us to overlay text later.

Concept A:
Write a prompt for a stunning, bright, photorealistic, premium lifestyle or commercial ad image (Concept A).
Also, write a compelling, punchy short marketing tagline (2-5 words) related to this concept and the brand.

Concept B:
Write a prompt for a completely distinct second concept (Concept B) that also reflects the brand, keeping the bright, premium Pomelli commercial aesthetic.
Also, write a compelling, punchy short marketing tagline (2-5 words) for this second concept.

Return ONLY a JSON object exactly matching this format:
{
  "cleanPromptA": "prompt Concept A Clean...",
  "taglineA": "Short tagline for A...",
  "cleanPromptB": "prompt Concept B Clean...",
  "taglineB": "Short tagline for B..."
}
`;

    try {
        const result = await model.generateContent(aiPrompt);
        let text = result.response.text();
        if (text.startsWith("\`\`\`json")) text = text.slice(7);
        if (text.startsWith("\`\`\`")) text = text.slice(3);
        if (text.endsWith("\`\`\`")) text = text.slice(0, -3);

        return JSON.parse(text.trim());
    } catch (e) {
        console.error("❌ Gemini failed to generate prompts:", e.message);
        return null;
    }
}

async function analyzeImageForTextPlacement(imageBuffer) {
    if (!_genAI) {
        return "TOP";
    }

    try {
        const model = _genAI.getGenerativeModel({
            model: 'gemini-3.1-pro-preview',
            generationConfig: {
                maxOutputTokens: 10,
                temperature: 0.2,
            },
        });

        const imagePart = {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: "image/jpeg"
            }
        };

        const aiPrompt = `Analyze this ad background. I need to overlay text at a horizontal zone safely without obscuring the main subject/product. Which vertical zone is LEAST likely to obscure the focal product: TOP, MIDDLE, or LOWER_MIDDLE? Respond with exactly one of those words. (Never pick BOTTOM).`;
        const result = await model.generateContent([aiPrompt, imagePart]);
        let text = result.response.text().trim().toUpperCase();

        if (["TOP", "MIDDLE", "LOWER_MIDDLE"].includes(text)) {
            return text;
        }
        return "TOP";
    } catch (e) {
        console.log("⚠️ Vision analysis fallback triggered (defaulting to TOP).");
        return "TOP";
    }
}

module.exports = { generateHeroPrompts, analyzeImageForTextPlacement };
