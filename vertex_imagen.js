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
        console.log(`🎨 Requesting Vertex AI Imagen (1:1 Native Generation): ${prompt.substring(0, 60)}...`);

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

        if (response.predictions && response.predictions.length > 0) {
            // Unpack the struct value
            const prediction = response.predictions[0].structValue.fields;
            if (prediction.bytesBase64Encoded && prediction.bytesBase64Encoded.stringValue) {
                const outputBase64 = prediction.bytesBase64Encoded.stringValue;
                console.log("✅ Vertex AI Imagen Generation successful!");
                return Buffer.from(outputBase64, 'base64');
            }
        }

        console.error("❌ Unexpected response structure from Vertex AI:", JSON.stringify(response));
        return null;

    } catch (error) {
        console.error("❌ Vertex AI Generation Error:", error.message);
        return null;
    }
}

module.exports = { generateBrandHero };
