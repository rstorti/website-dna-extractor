const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testLib() {
    if (!process.env.GEMINI_API_KEY) {
        console.log("No GEMINI_API_KEY");
        return;
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", generationConfig: { responseMimeType: "application/json" } });
    try {
        const result = await model.generateContent("Return JSON with test: true");
        console.log("Success AI key:", result.response.text());
    } catch (e) {
        console.log("Failed AI key:", e.message);
    }
}
testLib();
