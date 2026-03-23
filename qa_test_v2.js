const { extractDNA } = require('./extractor.js');

async function test() {
    console.log("Running extraction...");
    const result = await extractDNA('https://mazda.com');
    if (result.error) {
        console.error("Extraction failed:", result.error);
    } else {
        console.log("\n--- Extraction Results ---");
        console.log("Brand Name:", result.mappedData.name);
        console.log("Extracted Logo:", result.mappedData.image);
        console.log("\nGenerated Featured Images:");
        console.log(result.featuredImages);
    }
}

test();
