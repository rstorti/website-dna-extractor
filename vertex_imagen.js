const { PredictionServiceClient, helpers } = require('@google-cloud/aiplatform');
const sharp = require('sharp');
const env = require('./config/env');

// Default GCP Region and Models for Imagen Vertex AI
const LOCATION = env.GCP_LOCATION;
const MODEL_ID = 'imagen-3.0-generate-001'; // Vision model for native 1:1 text-to-image

/**
 * Automatically authenticates using Google Application Credentials 
 * and sends a prompt to Vertex AI for 1:1 image generation.
 * Returns a new image buffer, or null if auth/API fails.
 */
async function generateBrandHero(prompt) {
    if (!env.GCP_PROJECT_ID) {
        console.warn("⚠️  [Vertex AI] GCP_PROJECT_ID is missing from Lovable environment Secrets. Skipping image generation.");
        return null; // Graceful fallback
    }

    try {
        const t0 = Date.now();
        console.log(`🎨 Requesting Vertex AI Imagen (connector=VertexAI, model=${MODEL_ID}, location=${LOCATION}): ${prompt.substring(0, 60)}...`);

        // The PredictionServiceClient automatically uses GOOGLE_APPLICATION_CREDENTIALS
        const clientOptions = {
            apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`
        };
        const predictionServiceClient = new PredictionServiceClient(clientOptions);

        const projectId = env.GCP_PROJECT_ID;
        // Construct the model endpoint path
        const endpoint = `projects/${projectId}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}`;

        const parameters = helpers.toValue({
            sampleCount: 1,
            aspectRatio: '1:1',
            outputOptions: {
                mimeType: 'image/jpeg',
                compressionQuality: 85
            }
        });

        const instanceValue = helpers.toValue({
            prompt: prompt
        });

        const parameterValue = helpers.toValue(parameters);

        const request = {
            endpoint,
            instances: [instanceValue],
            parameters: parameterValue
        };

        const [response] = await predictionServiceClient.predict(request);
        const callMs = Date.now() - t0;

        if (response.predictions && response.predictions.length > 0) {
            // Unpack the struct value
            const prediction = response.predictions[0].structValue.fields;
            if (prediction.bytesBase64Encoded && prediction.bytesBase64Encoded.stringValue) {
                const outputBase64 = prediction.bytesBase64Encoded.stringValue;
                console.log(`✅ [connector=VertexAI, model=${MODEL_ID}] Imagen Generation successful in ${callMs}ms!`);
                return Buffer.from(outputBase64, 'base64');
            }
        }

        console.error(`❌ [connector=VertexAI, model=${MODEL_ID}] Unexpected response structure from Vertex AI after ${callMs}ms:`, JSON.stringify(response));
        return null;

    } catch (error) {
        console.error(`❌ [connector=VertexAI, model=${MODEL_ID}, location=${LOCATION}] Generation Error: ${error.message}`);
        return null;
    }
}

module.exports = { generateBrandHero };
