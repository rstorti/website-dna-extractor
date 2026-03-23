const { aiplatform } = require('@google-cloud/aiplatform');
const { helpers, PredictionServiceClient } = require('@google-cloud/aiplatform');
require('dotenv').config();

const LOCATION = process.env.GCP_LOCATION || 'us-central1';

async function testBison() {
    const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` };
    const client = new PredictionServiceClient(clientOptions);
    const projectId = process.env.GCP_PROJECT_ID;
    const endpoint = `projects/${projectId}/locations/${LOCATION}/publishers/google/models/text-bison@001`;

    const parameters = helpers.toValue({
        temperature: 0.2,
        maxOutputTokens: 256,
        topP: 0.95,
        topK: 40,
    });
    const instanceValue = helpers.toValue({ prompt: "Hello" });

    try {
        const [response] = await client.predict({
            endpoint,
            instances: [instanceValue],
            parameters
        });
        console.log("Success text-bison");
    } catch (e) {
        console.log("Failed bison", e.message);
    }
}
testBison();
