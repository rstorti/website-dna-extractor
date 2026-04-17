const { extractDNA } = require("./extractor");
const fs = require("fs");

const testUrls = [
    "https://www.strava.com/",
    "https://www.youtube.com/watch?v=sEgkGynunpY"
];

async function runFullQA() {
    console.log("=== STARTING FULL QA/QC TEST ===");
    const report = {};
    let passed = 0;
    let failed = 0;

    for (const url of testUrls) {
        console.log(`\nTesting extraction on: ${url}`);
        try {
            const startTime = Date.now();
            const result = await extractDNA(url);
            const duration = Date.now() - startTime;

            if (result.error) {
                console.error(`[❌] FAILED for ${url} - Error: ${result.error}`);
                report[url] = { status: "failed", error: result.error };
                failed++;
                continue;
            }

            const data = result.mappedData || result;
            
            // Check essential fields
            const checks = {
                hasBrandName: !!data.name,
                hasColors: Array.isArray(data.colors) && data.colors.length > 0,
                hasImageOrLogo: !!data.image || !!data.logo,
                hasCTAs: Array.isArray(data.callToActions) && data.callToActions.length > 0,
                hasSocials: Array.isArray(data.socialMediaLinks) && data.socialMediaLinks.length > 0,
                hasBusinessDesc: !!data.business_description,
                hasAIAnalysis: !!data.aiAnalysis,
            };

            const allPassed = checks.hasBrandName && checks.hasColors && checks.hasImageOrLogo;
            
            console.log(`[${allPassed ? '✅' : '⚠️'}] Extraction completed for ${url} in ${duration}ms`);
            console.log(`Data highlights:
  - Brand Name: ${data.name || 'Missing'}
  - Logo/Image: ${data.image || data.logo || 'Missing'}
  - Colors extracted: ${checks.hasColors ? data.colors.join(', ') : 'None'}
  - CTAs found: ${checks.hasCTAs ? data.callToActions.length : 0}
  - Socials found: ${checks.hasSocials ? data.socialMediaLinks.length : 0}
  - AI Description: ${data.business_description ? 'Present' : 'Missing'}
            `);

            report[url] = {
                status: allPassed ? "success" : "partial",
                checks,
                dataSummary: {
                    name: data.name,
                    colorsCount: data.colors ? data.colors.length : 0,
                    ctaCount: data.callToActions ? data.callToActions.length : 0,
                    socialCount: data.socialMediaLinks ? data.socialMediaLinks.length : 0
                }
            };

            // Write full output to a file for deeper QC
            const filename = `qa_output_${new URL(url).hostname.replace(/[^a-z0-9]/gi, '_')}.json`;
            fs.writeFileSync(filename, JSON.stringify(data, null, 2));
            console.log(`Saved full extraction output to ${filename}`);

            if (allPassed) passed++;
            else failed++; // Or partial count

        } catch (e) {
            console.error(`[❌] CRASH for ${url}:`, e);
            report[url] = { status: "crashed", error: e.message };
            failed++;
        }
    }

    console.log("\n=== QA/QC SUMMARY ===");
    console.log(`Total Tested: ${testUrls.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Issued/Failed: ${failed}`);
    
    fs.writeFileSync("full_qa_report.json", JSON.stringify(report, null, 2));
    console.log("Detailed report saved to full_qa_report.json");
}

runFullQA();
