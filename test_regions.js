const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

async function testGeminiRegions() {
    const project = process.env.GCP_PROJECT_ID;
    const regions = ['us-central1', 'us-east4', 'us-west1', 'us-west4', 'europe-west1', 'europe-west4'];

    for (const location of regions) {
        console.log(`Testing region: ${location}`);
        try {
            const vertex_ai = new VertexAI({ project, location });
            const model = vertex_ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const result = await model.generateContent("Hello");
            console.log(`✅ Success in ${location}`);
            return;
        } catch (e) {
            console.log(`❌ Failed in ${location}: ${e.message}`);
        }
    }
}
testGeminiRegions();
