// Load dot-env keys dynamically
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const { extractDNA, scrapeYoutubeFallback } = require('./extractor.js');
const { verifyDNA } = require('./ai_verifier.js');
const { extractYoutubeDetails } = require('./youtube_extractor.js');
const { supabase } = require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 3001;
const HISTORY_FILE = path.join(__dirname, 'outputs', 'history.json');

app.use(cors());
app.use(express.json());

// Explicitly serve local outputs folder natively to prevent 404 proxy loops
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// Proxy Download Endpoint to fix CORS extension issues
app.get('/api/download', async (req, res) => {
    try {
        const { url, filename } = req.query;
        if (!url) return res.status(400).send('URL missing');
        
        // Handle fallback paths if Supabase Cloud Upload failed
        if (url.startsWith('/outputs/')) {
            const localFileName = path.basename(url);
            const localFilePath = path.join(__dirname, 'outputs', localFileName);
            return res.download(localFilePath, filename || localFileName, (err) => {
                if (err) res.status(500).send('Local File Download Failed: Could not locate fallback file on disk.');
            });
        }

        // Handle external HTTP Cloud URLs securely using buffered byte transfer
        const axios = require('axios');
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer' // Buffer entirely before sending to prevent corrupt partials
        });
        res.setHeader('Content-Disposition', `attachment; filename="${filename || 'download.png'}"`);
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        res.end(response.data);
    } catch (e) {
        res.status(500).send('Proxy Download Failed: ' + e.message);
    }
});

// Main extraction endpoint
app.post('/api/extract', async (req, res) => {
    const { url, youtubeUrl, profileUrl } = req.body;

    if (!url && !profileUrl && !youtubeUrl) {
        return res.status(400).json({ error: 'At least one URL (Website, Profile, or YouTube) is required' });
    }

    let targetUrl = url ? url.trim() : null;
    if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }

    try {
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ error: 'Process timed out after 150 seconds. The target website may be blocking access or slow.' }), 150000));
        
        const extractPromises = [];
        let pMainIndex = -1;
        let pProfIndex = -1;

        if (targetUrl) {
            console.log(`\n================================`);
            console.log(`🧬 STARTING API EXTRACTION: ${targetUrl}`);
            console.log(`================================`);
            pMainIndex = extractPromises.length;
            extractPromises.push(Promise.race([
                extractDNA(targetUrl),
                timeoutPromise
            ]));
        }

        let targetProfileUrl = null;
        if (profileUrl) {
            targetProfileUrl = profileUrl.trim();
            if (!targetProfileUrl.startsWith('http://') && !targetProfileUrl.startsWith('https://')) {
                targetProfileUrl = 'https://' + targetProfileUrl;
            }
            console.log(`\n================================`);
            console.log(`🧬 STARTING SECONDARY PROFILE EXTRACTION: ${targetProfileUrl}`);
            console.log(`================================`);
            pProfIndex = extractPromises.length;
            extractPromises.push(Promise.race([
                extractDNA(targetProfileUrl),
                timeoutPromise
            ]));
        }

        const extractions = await Promise.all(extractPromises);
        const extractionResult = pMainIndex !== -1 ? extractions[pMainIndex] : null;
        const profileExtractionResult = pProfIndex !== -1 ? extractions[pProfIndex] : null;

        if (extractionResult && extractionResult.error) {
            return res.status(500).json({ error: `Extraction Failed: ${extractionResult.error}` });
        }
        if (profileExtractionResult && profileExtractionResult.error) {
            return res.status(500).json({ error: `Profile Extraction Failed: ${profileExtractionResult.error}` });
        }
        
        if (profileExtractionResult && profileExtractionResult.error) {
            console.warn(`⚠️ Profile Extraction Failed: ${profileExtractionResult.error}`);
        }

        console.log("\n✅ Stage 1 Complete: Data Extracted & Screenshot Saved.");



        let rawYoutubeData = null;
        let aiYoutubeData = null;
        if (youtubeUrl) {
            rawYoutubeData = await extractYoutubeDetails(youtubeUrl.trim());
            if (rawYoutubeData && rawYoutubeData.error) {
                console.warn("⚠️ YouTube API failed: ", rawYoutubeData.error);
                console.log("🚀 Agent Fallback: Booting Puppeteer to visually extract YouTube DOM...");
                
                const fallbackData = await scrapeYoutubeFallback(youtubeUrl.trim());
                
                if (fallbackData && !fallbackData.error) {
                    console.log(`✅ Puppeteer Fallback Succeeded! (Title: ${fallbackData.title})`);
                    rawYoutubeData = { ...fallbackData, error: rawYoutubeData.error }; // Erase the API error and replace with clean data, but preserve the original error message for the frontend
                    aiYoutubeData = fallbackData; // Feed clean data to Gemini!
                } else {
                    console.warn("⚠️ Puppeteer Fallback also failed: ", fallbackData?.error);
                    aiYoutubeData = null; // Hide error from AI
                }
            } else if (rawYoutubeData) {
                console.log(`✅ YouTube data extracted (Title: ${rawYoutubeData.title})`);
                aiYoutubeData = rawYoutubeData; // Give clean string to AI
            }
        }

        // 2. Run AI Verification with a super-extended 90-second fail-safe timeout
        const verifyTimeout = new Promise((resolve) => setTimeout(() => {
            console.warn("⚠️ Gemini AI Verification timed out after 90s. Networking is too slow, bypassing verification.");
            resolve({
                verified_data: {
                    website_summary: "⚠️ Gemini API Error: Hard timeout exceeded (>90 seconds) waiting for Google API. The server connection or limits may be overwhelmed.",
                    youtube_summary: "⚠️ Gemini API Error: Hard timeout exceeded (>90 seconds) waiting for Google API.",
                    combined_summary: ""
                }
            });
        }, 90000));

        const verifyPromises = [];
        let vMainIndex = -1;
        let vProfIndex = -1;

        if (extractionResult || aiYoutubeData) {
            console.log(`\n⏳ Submitting data to Gemini Vision Pro...`);
            vMainIndex = verifyPromises.length;
            verifyPromises.push(Promise.race([
                verifyDNA(extractionResult ? extractionResult.mappedData : {}, extractionResult ? extractionResult.screenshotPath : null, extractionResult ? extractionResult.logoPath : null, aiYoutubeData),
                verifyTimeout
            ]));
        }

        if (profileExtractionResult && !profileExtractionResult.error) {
             console.log(`\n⏳ Submitting Profile data to Gemini Vision Pro...`);
             vProfIndex = verifyPromises.length;
             verifyPromises.push(Promise.race([
                 verifyDNA(profileExtractionResult.mappedData, profileExtractionResult.screenshotPath, profileExtractionResult.logoPath, null),
                 verifyTimeout
             ]));
        }

        const verifications = await Promise.all(verifyPromises);
        const verificationResult = vMainIndex !== -1 ? verifications[vMainIndex] : null;
        const profileVerificationResult = vProfIndex !== -1 ? verifications[vProfIndex] : null;

        let finalResult = null;
        let isVerified = true;
        let activeMainResult = extractionResult || profileExtractionResult;
        let activeVerificationResult = verificationResult || profileVerificationResult;

        let baseData = activeMainResult ? activeMainResult.mappedData : {};
        if (!activeMainResult && aiYoutubeData) {
            baseData.name = activeVerificationResult?.verified_data?.name || aiYoutubeData.channel || "Unknown Brand";
            baseData.image = aiYoutubeData.thumbnail || null;
            if (aiYoutubeData.thumbnail) baseData.featuredImages = [aiYoutubeData.thumbnail];
        }

        if (activeMainResult || activeVerificationResult) {
            if (!activeVerificationResult || !activeVerificationResult.verified_data) {
                console.warn("\n⚠️ AI Verification failed. Returning raw extracted data.");
                finalResult = baseData;
                isVerified = false;
            } else {
                console.log("\n✅ Stage 2 Complete: AI Vision Certification applied.");
                finalResult = { 
                    ...baseData, 
                    ...activeVerificationResult.verified_data 
                };
            }
        }

        // Handle Profile Assembly
        let finalProfilePayload = null;
        if (profileExtractionResult && !profileExtractionResult.error) {
             let profileData = profileExtractionResult.mappedData;
             let isProfileVerified = false;
             if (profileVerificationResult && profileVerificationResult.verified_data) {
                 profileData = { ...profileData, ...profileVerificationResult.verified_data };
                 isProfileVerified = true;
             }
             finalProfilePayload = {
                 success: true,
                 isVerified: isProfileVerified,
                 data: profileData,
                 youtubeData: null,
                 screenshotUrl: profileExtractionResult.screenshotUrl || `/outputs/${path.basename(profileExtractionResult.screenshotPath)}`,
                 buttonStyles: profileExtractionResult.buttonStyles || null,
                 ctas: profileExtractionResult.ctas || [],
                 socialMediaLinks: profileExtractionResult.socialMediaLinks || [],
                 featuredImages: profileExtractionResult.featuredImages || []
             };
        }

        // Merge YouTube social links into the main socialMediaLinks array and naturally deduplicate
        let combinedSocialLinks = activeMainResult ? [...(activeMainResult.socialMediaLinks || [])] : [];
        if (activeVerificationResult && activeVerificationResult.verified_data && Array.isArray(activeVerificationResult.verified_data.youtube_social_links)) {
            const ytLinks = activeVerificationResult.verified_data.youtube_social_links.filter(link => typeof link === 'string');
            ytLinks.forEach(ytLink => {
                if (!combinedSocialLinks.some(sLink => sLink.toLowerCase() === ytLink.toLowerCase())) {
                    combinedSocialLinks.push(ytLink);
                }
            });
        }

        const finalPayload = {
            success: true,
            isVerified,
            data: finalResult || {},
            youtubeData: rawYoutubeData, // Pass raw debug data to client directly
            screenshotUrl: activeMainResult ? (activeMainResult.screenshotUrl || `/outputs/${path.basename(activeMainResult.screenshotPath)}`) : null,
            buttonStyles: activeMainResult ? (activeMainResult.buttonStyles || null) : null,
            ctas: activeMainResult ? (activeMainResult.ctas || []) : [],
            socialMediaLinks: combinedSocialLinks,
            featuredImages: activeMainResult ? (activeMainResult.featuredImages || []) : [],
            profilePayload: finalProfilePayload // Secondary Minfo profile!
        };

        // Save to history in Supabase
        // Save to Local History securely to bypass Cloud 504 errors
        try {
            const historyItem = {
                id: new Date().getTime().toString(),
                target_url: targetUrl || targetProfileUrl,
                timestamp: new Date().toISOString(),
                success: true,
                payload: finalPayload
            };

            let localHistory = [];
            try {
                const historyData = await fs.readFile(HISTORY_FILE, 'utf-8');
                localHistory = JSON.parse(historyData);
            } catch (e) {
                // File doesn't exist or is invalid, start fresh
            }

            localHistory.unshift(historyItem);
            // Cap history to 100 items to prevent massive disk usage
            if (localHistory.length > 100) localHistory = localHistory.slice(0, 100);
            
            await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
            await fs.writeFile(HISTORY_FILE, JSON.stringify(localHistory, null, 2));
            console.log('✅ Synchronized to local history.json database.');
        } catch (e) {
            console.error('Exception during local history insert:', e);
        }

        // Return the final data and screenshot path
        res.json(finalPayload);

    } catch (error) {
        console.error('Error during extraction:', error);
        res.status(500).json({ error: error.message || 'An unexpected error occurred.' });
    }
});

// History endpoint mapped purely to Local Database (bypassing Supabase networking errors)
app.get('/api/history', async (req, res) => {
    try {
        let localHistory = [];
        try {
            const fileData = await fs.readFile(HISTORY_FILE, 'utf-8');
            localHistory = JSON.parse(fileData);
        } catch (e) {
            // No history yet or file invalid, start fresh
            localHistory = [];
        }

        const formattedHistory = localHistory.map(row => ({
            id: row.id,
            url: row.target_url,
            timestamp: row.timestamp,
            success: row.success,
            payload: row.payload
        }));
        res.json(formattedHistory);
    } catch (error) {
        console.error('Failed to fetch history:', error);
        res.status(500).json({ error: 'Failed to fetch local history' });
    }
});

// Endpoint to securely delete targeted items from local history
app.delete('/api/history', async (req, res) => {
    try {
        const { domain, timestamp } = req.body;
        
        let localHistory = [];
        try {
            const historyData = await fs.readFile(HISTORY_FILE, 'utf-8');
            localHistory = JSON.parse(historyData);
        } catch (e) {
            return res.json({ success: true, message: 'History already empty' });
        }

        if (domain) {
            localHistory = localHistory.filter(item => {
                let itemDomain = item.target_url;
                try { itemDomain = new URL(item.target_url).hostname; } catch (e) { }
                return itemDomain !== domain;
            });
        } else if (timestamp) {
            localHistory = localHistory.filter(item => item.timestamp !== timestamp);
        }

        await fs.writeFile(HISTORY_FILE, JSON.stringify(localHistory, null, 2));
        res.json({ success: true, message: 'History successfully deleted' });
    } catch (error) {
        console.error('Failed to delete targeted history item:', error);
        res.status(500).json({ error: 'Failed to delete local history fragment' });
    }
});

// Serve the screenshots directly so the frontend can preview them
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// Serve the compiled React frontend for production
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Extractor API server running on http://localhost:${PORT}`);
});
