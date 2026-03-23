const { extractDNA } = require("./extractor");
const fs = require("fs");

async function runQA() {
    console.log("=== STARTING QA TEST ===");
    try {
        const url = "file:///C:/_Minfo/Dev/_New%20Minfo/Website%20DNA%20extractor/test.html"; // using a reliable site
        console.log(`Testing extraction on: ${url}`);
        const result = await extractDNA(url);

        if (result.error) {
            console.error("QA FAILED - Extraction Error:", result.error);
            return;
        }

        console.log("Extraction successful!");
        const extractedFields = result.mappedData || result;

        console.log("Extracted Data:", JSON.stringify(extractedFields, null, 2));

        // Read target schema
        const originalSchemaStr = fs.readFileSync("fields.json", "utf-8");
        const originalSchema = JSON.parse(originalSchemaStr);

        console.log("\n--- VALIDATION ---");

        let missingKeys = [];
        // Flatten schema slightly for easy checking
        const keysToCheck = Object.keys(originalSchema);

        for (const key of keysToCheck) {
            if (extractedFields[key] === undefined) {
                missingKeys.push(key);
            }
        }

        if (missingKeys.length > 0) {
            console.log("MISSING KEYS in extracted data vs fields.json:");
            console.log(missingKeys);
            console.log("Writing missing keys to missing_keys.json");
            fs.writeFileSync("missing_keys.json", JSON.stringify(missingKeys, null, 2));
        } else {
            console.log("SUCCESS! All root keys from fields.json are present in the exacted output.");
        }

    } catch (e) {
        console.error("QA Test script crashed:", e);
    }
}

runQA();
