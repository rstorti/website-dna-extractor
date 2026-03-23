const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function fileToGenerativePart(filePath, mimeType) {
    const data = fs.readFileSync(filePath);
    return {
        inlineData: {
            data: Buffer.from(data).toString("base64"),
            mimeType
        },
    };
}

async function run() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const pdfPart = await fileToGenerativePart("Lovable layout.pdf", "application/pdf");

        const prompt = `You are analyzing a reference PDF document called "Lovable layout.pdf" provided by the user. 
The user states: "There are no details of Button styles, social media icons, we need a minimum of 2 images resized to 640x640. Did you review the sample output file Lovable layout.pdf?? please update extraction data to match the pdf sample"

Please carefully analyze the contents of this PDF file and extract all text, data fields, schemas, structures, or visual elements it shows. What exactly does the PDF describe or contain that our current website DNA extraction is missing? List every single field name, data structure, or visual requirement shown in the PDF so I can write code to match it perfectly.`;

        const result = await model.generateContent([prompt, pdfPart]);
        console.log(result.response.text());
    } catch (e) {
        console.error("Error reading PDF with Gemini:", e);
    }
}
run();
