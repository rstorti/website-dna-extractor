require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs/promises');

// Ensure API key is available
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Converts a local file into the format required by the Gemini API.
 */
async function fileToGenerativePart(filePath, mimeType) {
    const data = await fs.readFile(filePath);
    return {
        inlineData: {
            data: Buffer.from(data).toString("base64"),
            mimeType
        },
    };
}

/**
 * Runs the Gemini Vision Pro model to verify the extracted DNA.
 */
async function verifyDNA(mappedData, screenshotPath, logoPath, youtubeData = null) {
    if (!process.env.GEMINI_API_KEY) {
        console.error("❌ Error: GEMINI_API_KEY is missing in .env");
        return null;
    }

    console.log(`\n🤖 Launching Gemini Vision Verification...`);

    try {

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        let imagePart = null;
        if (screenshotPath) {
            try {
                imagePart = await fileToGenerativePart(screenshotPath, "image/png");
            } catch (e) { console.error("Could not load screenshot for AI verification"); }
        }

        const prompt = `
            You are a strict, highly attentive Quality Assurance Engineer for a brand agency.
            I have just run an automated script to extract the visual "DNA" (colors, titles) of the website${screenshotPath ? ' shown in the attached screenshot' : ''}.
            
            Here is the JSON data the script extracted:
            ${JSON.stringify(mappedData, null, 2)}
            
            ${youtubeData ? `
            Additionally, the user provided a YouTube video related to this company.
            YouTube Title: ${youtubeData.title}
            YouTube Description:
            ${youtubeData.description}
            ` : ''}

            INSTRUCTIONS:
            1. Look closely at the attached screenshot of the website.
            2. Compare the visual reality of the website to the extracted JSON data provided above.
            3. Did the script accurately extract the dominant background color? The text color? The primary brand/button colors? 
            4. Is the title accurate, or did it just grab a generic "Home"? 
            5. IMPORTANT: Look at the SECOND attached image (if present), which the script chose as the company's "Logo". Is this image ACTUALLY the company's main brand logo? Look at the screenshot to confirm. If that second image is a generic photo, a banner, a user avatar, or NOT a real logo, state this in your verification notes and FORCIBLY SET the "image" field in "verified_data" to null. If it IS the correct logo, keep the "image" field intact. 
            6. Generate a concise, engaging 'website_summary' of the company based purely on the website JSON provided. If the website JSON lacks sufficient textual context to form a summary, output an empty string ("") instead of hallucinating one.
            ${youtubeData ? `
            7. From the YouTube Description provided above, extract EVERY SINGLE URL, link, or Call to Action (CTA) mentioned (including sources, references, articles, and traditional CTAs like Subscribe/Donate). Format them as descriptive actionable phrases and add them ALL to the 'youtube_ctas' array. Do not leave any URLs behind.
            8. From the YouTube Description provided above, extract any Social Media profile links and add them as an array of strings called 'youtube_social_links'.
            9. Generate a compelling and interesting 'youtube_summary' based ONLY on the YouTube description. This summary should naturally be engaging and subtly encourage people to engage with the CTAs.
            10. Generate a 'combined_summary' that merges the website summary and the youtube summary seamlessly.
            ` : ''}

            If the data is completely wrong (e.g., the script says the background is #FFFFFF but the screenshot is clearly dark mode), YOU MUST CORRECT IT in your output by including that key.
            
            CRITICAL OUTPUT RULES:
            - You MUST ALWAYS generate and include the 'website_summary' key.
            ${youtubeData ? `- You MUST ALWAYS generate and include the 'youtube_ctas', 'youtube_social_links', 'youtube_summary', and 'combined_summary' keys.` : ''}
            - Do NOT modify or output non-visual arrays like 'item_setup', 'selling_item_details', or 'campaign_security_data'.
            - Do NOT modify HTML string fields like 'campaign_description'.
            
            Respond ONLY with a valid JSON object matching this exact structure (NO comments, NO extra text):
            {
               "verified_data": { 
                  "name": "The definitive name of the company or brand (infer from context if missing)",
                  "website_summary": "A concise summary of the company based on the website extraction"${youtubeData ? `,
                  "youtube_ctas": ["Subscribe to our channel", "Link to our latest product..."],
                  "youtube_social_links": ["https://twitter.com/example"],
                  "youtube_summary": "A concise summary based on the YouTube description",
                  "combined_summary": "A merged summary of both the website and YouTube descriptions"
                  ` : ''}
               },
               "ai_confidence_score": 95,
               "ai_verification_notes": "The script correctly identified the dark mode background..."
            }
        `;

        const parts = [prompt];
        if (imagePart) parts.push(imagePart);

        if (logoPath) {
            try {
                const logoPart = await fileToGenerativePart(logoPath, "image/png");
                parts.push(logoPart);
            } catch (e) { console.error("Could not load logo for AI verification"); }
        }

        const result = await model.generateContent(parts);
        const responseText = result.response.text();

        // Strip markdown code blocks if Gemini aggressively formats the JSON
        const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const verificationResult = JSON.parse(cleanJsonString);

        console.log(`✅ AI Verification Complete (Confidence: ${verificationResult.ai_confidence_score}%)`);
        return verificationResult;

    } catch (error) {
        console.error(`❌ Gemini Verification Error:`, error);
        return {
           verified_data: {
              website_summary: `⚠️ Gemini Vision API Error: ${error.message || 'Unknown JSON parsing or connectivity fault.'}`,
              youtube_summary: `⚠️ Gemini Vision API Error: ${error.message || 'Unknown JSON parsing or connectivity fault.'}`,
              combined_summary: ""
           }
        };
    }
}

// Allow standalone testing if called directly
if (require.main === module) {
    // Mock data for standalone testing
    const mockData = {
        name: "Test Site",
        background_color: "#FFFFFF",
        icon_background_color_left: "#000000"
    };

    const mockYoutubeData = {
        title: "Test Video",
        channel: "Test Channel",
        description: "Buy our things at https://test.com/buy"
    };

    // Provide a valid path to a real screenshot to test
    const testImagePath = process.argv[2];
    if (!testImagePath) {
        console.log("Usage: node ai_verifier.js <path_to_test_screenshot.png>");
        process.exit(1);
    }

    verifyDNA(mockData, testImagePath, null, mockYoutubeData).then(result => {
        console.log("FINAL OUTPUT:", JSON.stringify(result, null, 2));
    });
}

module.exports = { verifyDNA };
