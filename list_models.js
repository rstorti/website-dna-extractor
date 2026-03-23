const { aiplatform } = require('@google-cloud/aiplatform');
require('dotenv').config();

async function listModels() {
    try {
        const clientOptions = { apiEndpoint: `us-central1-aiplatform.googleapis.com` };
        const client = new aiplatform.v1.ModelServiceClient(clientOptions);
        const projectId = process.env.GCP_PROJECT_ID;
        const parent = `projects/${projectId}/locations/us-central1`;

        console.log("Listing models...");
        const [models] = await client.listModels({ parent });
        models.forEach(model => console.log(model.name, model.displayName));
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
listModels();
