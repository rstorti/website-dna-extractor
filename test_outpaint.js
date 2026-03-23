const sharp = require('sharp');
const fs = require('fs/promises');
const { PredictionServiceClient, helpers } = require('@google-cloud/aiplatform');
require('dotenv').config();

const LOCATION = process.env.GCP_LOCATION || 'us-central1';
const MODEL_ID = 'imagen-3.0-capability-001';

async function run() {
    const projectId = process.env.GCP_PROJECT_ID;
    const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` };
    const predictionServiceClient = new PredictionServiceClient(clientOptions);
    const endpoint = `projects/${projectId}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}`;

    const inBuf = await fs.readFile('./outputs/screenshot_1771913995509.png');
    // Wait, let's use the local logo we had, or let's download a test image with an aspect ratio of e.g. 16:9
    const testImageUrl = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff';
    const response = await fetch(testImageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Resize to max 640 for speed and cost
    const resizedBuffer = await sharp(imageBuffer).resize(600).toBuffer();

    const metadata = await sharp(resizedBuffer).metadata();
    const size = Math.max(metadata.width, metadata.height);

    // Edge replication or white padding
    const basePaddedBuf = await sharp(resizedBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 255 } })
        .png().toBuffer();

    const shrink = 10;
    const rectX = Math.max(0, Math.round((size - metadata.width) / 2) + shrink);
    const rectY = Math.max(0, Math.round((size - metadata.height) / 2) + shrink);
    const rectW = Math.max(1, metadata.width - shrink * 2);
    const rectH = Math.max(1, metadata.height - shrink * 2);

    const maskBuf = await sharp({
        create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } }
    })
        .composite([{
            input: Buffer.from(`<svg><rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="#000" /></svg>`),
            blend: 'over'
        }]).png().toBuffer();

    await fs.writeFile('debug_base.png', basePaddedBuf);
    await fs.writeFile('debug_mask.png', maskBuf);

    console.log("Sending to Vertex AI...");

    const instanceValue = helpers.toValue({
        prompt: "A seamless continuation of the natural background scenery, wide angle.",
        referenceImages: [
            { referenceId: 1, referenceType: 'REFERENCE_TYPE_RAW', referenceImage: { bytesBase64Encoded: basePaddedBuf.toString('base64'), mimeType: 'image/png' } },
            { referenceId: 2, referenceType: 'REFERENCE_TYPE_MASK', maskImageConfig: { maskMode: 'MASK_MODE_USER_PROVIDED' }, referenceImage: { bytesBase64Encoded: maskBuf.toString('base64'), mimeType: 'image/png' } }
        ]
    });

    try {
        const [apiRes] = await predictionServiceClient.predict({
            endpoint,
            instances: [instanceValue],
            parameters: helpers.toValue({ editConfig: { editMode: 'EDIT_MODE_OUTPAINT' }, sampleCount: 1 })
        });

        const prediction = apiRes.predictions[0].structValue.fields;
        if (prediction.bytesBase64Encoded?.stringValue) {
            await fs.writeFile('debug_outpaint.jpg', Buffer.from(prediction.bytesBase64Encoded.stringValue, 'base64'));
            console.log("Saved debug_outpaint.jpg");
        } else {
            console.log("No base64 returned.");
        }
    } catch (e) {
        console.error(e.message);
    }
}
run();
