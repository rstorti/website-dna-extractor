const { extractDNA } = require('./extractor.js');
const { verifyDNA } = require('./ai_verifier.js');

async function runPipeline(url) {
    if (!url) {
        console.error("❌ Usage: node cli.js <url>");
        process.exit(1);
    }

    console.log(`\n================================`);
    console.log(`🧬 MINFO DNA EXTRACTOR PIPELINE`);
    console.log(`================================`);

    // 1. Run Data Extraction & Screenshot Generation
    const extractionResult = await extractDNA(url);

    if (!extractionResult) {
        console.error("\n❌ Pipeline Terminated: Extraction failed.");
        process.exit(1);
    }

    console.log("\n✅ Stage 1 Complete: Data Extracted & Screenshot Saved.");

    // 2. Run AI Verification
    const verificationResult = await verifyDNA(extractionResult.mappedData, extractionResult.screenshotPath);

    if (!verificationResult) {
        console.warn("\n⚠️ Pipeline Warning: AI Verification could not be completed. Returning raw extracted data.");
        // We still want to output the data even if Gemini failed
        console.log("\n=================================");
        console.log("FINAL OUTPUT (UNVERIFIED):");
        console.log(JSON.stringify(extractionResult.mappedData, null, 2));
        return;
    }

    console.log("\n✅ Stage 2 Complete: AI Vision Certification applied.");

    // 3. Output Final Payload
    console.log("\n=================================");
    console.log("FINAL OUTPUT (CERTIFIED DNA):");
    console.log(JSON.stringify(verificationResult, null, 2));
    console.log(`\n📸 Evidence Artifact: ${extractionResult.screenshotPath}`);
    console.log(`=================================`);
}

const targetUrl = process.argv[2];
runPipeline(targetUrl);
