const axios = require('axios');
const env = require('./config/env');

const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY;

/**
 * Extracts the video ID from various YouTube URL formats.
 */
function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Fetches the description and basic details of a YouTube video using the YouTube Data API.
 * @param {string} url - The YouTube URL to extract from.
 * @param {number} [_depth=0] - Internal recursion depth guard (do not set externally).
 */
async function extractYoutubeDetails(url, _depth = 0) {
    if (!YOUTUBE_API_KEY) {
        throw new Error('No YouTube API key configured (connector=YouTubeDataAPIv3) — using scrape fallback');
    }
    const t0 = Date.now();
    const elapsed = () => `${Date.now() - t0}ms`;
    console.log(`⏱️  [connector=YouTubeDataAPIv3] extractYoutubeDetails starting for: ${url}`);
    try {
        const videoId = extractVideoId(url);
        if (videoId) {
            const apiTimer = Date.now();
            const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
            console.log(`⏱️  [connector=YouTubeDataAPIv3] Fetching video snippet for videoId=${videoId}...`);
            const response = await axios.get(apiUrl, { timeout: 15_000 });
            console.log(`⏱️  [connector=YouTubeDataAPIv3] Video snippet API returned in ${Date.now() - apiTimer}ms`);

            if (!response.data.items || response.data.items.length === 0) {
                throw new Error('Video not found or is private');
            }

            const item = response.data.items[0].snippet;
            const channelId = item.channelId;
            
            let channelAvatar = null;
            try {
                const chTimer = Date.now();
                const channelApiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`;
                console.log(`⏱️  [connector=YouTubeDataAPIv3] Fetching channel avatar for channelId=${channelId}...`);
                const channelResponse = await axios.get(channelApiUrl, { timeout: 15_000 });
                console.log(`⏱️  [connector=YouTubeDataAPIv3] Channel avatar API returned in ${Date.now() - chTimer}ms`);
                if (channelResponse.data.items && channelResponse.data.items.length > 0) {
                    const cSnippet = channelResponse.data.items[0].snippet;
                    // High is typically 240x240 or 256x256, perfect for logo dimensions
                    channelAvatar = cSnippet.thumbnails?.high?.url || cSnippet.thumbnails?.default?.url;
                }
            } catch (e) {
                console.error(`[connector=YouTubeDataAPIv3] Failed to fetch channel secondary data for logo after ${elapsed()}: ${e.message}`);
            }
            
            console.log(`✅ [connector=YouTubeDataAPIv3] Video extract succeeded in ${elapsed()}: "${item.title}"`);
            return {
                title: item.title,
                channel: item.channelTitle,
                description: item.description,
                publishedAt: item.publishedAt,
                channelLogo: channelAvatar,
                thumbnail: item.thumbnails?.maxres?.url || item.thumbnails?.high?.url || item.thumbnails?.default?.url
            };
        }

        // It is not a video URL, let's see if it's a channel URL
        const handleMatch = url.match(/youtube\.com\/@([^#\&\?\/]+)/);
        const idMatch = url.match(/youtube\.com\/channel\/([^#\&\?\/]+)/);

        if (handleMatch || idMatch) {
            let channelApiUrl = '';
            if (handleMatch) {
                channelApiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&forHandle=@${handleMatch[1]}&key=${YOUTUBE_API_KEY}`;
            } else if (idMatch) {
                channelApiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${idMatch[1]}&key=${YOUTUBE_API_KEY}`;
            }

            const chTimer = Date.now();
            console.log(`⏱️  [connector=YouTubeDataAPIv3] Fetching channel info: ${channelApiUrl.substring(0, 80)}...`);
            const channelResponse = await axios.get(channelApiUrl, { timeout: 15_000 });
            console.log(`⏱️  [connector=YouTubeDataAPIv3] Channel info API returned in ${Date.now() - chTimer}ms`);

            if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
                throw new Error('Channel not found or is private');
            }

            // Instead of just looking at the channel description (which has no CTAs), 
            // find the "Uploads" playlist to grab the channel's single newest video.
            const uploadsPlaylistId = channelResponse.data.items[0].contentDetails?.relatedPlaylists?.uploads;
            if (!uploadsPlaylistId) {
                throw new Error('Channel has no uploads playlist.');
            }

            const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=1&key=${YOUTUBE_API_KEY}`;
            const plTimer = Date.now();
            console.log(`⏱️  [connector=YouTubeDataAPIv3] Fetching playlist uploads...`);
            const playlistResponse = await axios.get(playlistUrl, { timeout: 15_000 });
            console.log(`⏱️  [connector=YouTubeDataAPIv3] Playlist API returned in ${Date.now() - plTimer}ms`);
            
            if (!playlistResponse.data.items || playlistResponse.data.items.length === 0) {
                throw new Error('Channel has no uploaded videos.');
            }

            // Extract the latest video ID and recurse to extract it just like a normal video URL.
            // Depth guard prevents infinite loops in edge cases.
            if (_depth >= 1) throw new Error('[connector=YouTubeDataAPIv3] YouTube extraction recursion depth limit reached.');
            const latestVideoId = playlistResponse.data.items[0].snippet.resourceId.videoId;
            console.log(`✅ [connector=YouTubeDataAPIv3] Channel resolved to latest video ${latestVideoId} in ${elapsed()}`);
            return extractYoutubeDetails(`https://www.youtube.com/watch?v=${latestVideoId}`, _depth + 1);
        }

        // None matched
        throw new Error('[connector=YouTubeDataAPIv3] Invalid YouTube URL — could not match video ID, channel handle, or channel ID.');

    } catch (error) {
        let errorMessage;
        if (error.response && error.response.data && error.response.data.error) {
            const apiMsg = error.response.data.error.message;
            if (apiMsg.toLowerCase().includes('quota')) {
                errorMessage = `[connector=YouTubeDataAPIv3] Quota Exceeded after ${elapsed()}: Your YouTube API key has run out of requests for today. (${apiMsg})`;
            } else if (error.response.status === 403) {
                errorMessage = `[connector=YouTubeDataAPIv3] API Key Forbidden (403) after ${elapsed()}: Your API key is likely missing the "YouTube Data API v3" scope in Google Cloud, or has IP/website restrictions blocking it. (${apiMsg})`;
            } else {
                errorMessage = `[connector=YouTubeDataAPIv3] YouTube API Error after ${elapsed()}: ${apiMsg}`;
            }
        } else {
            errorMessage = `[connector=YouTubeDataAPIv3] ${error.message} (elapsed=${elapsed()})`;
        }
        
        console.error('[connector=YouTubeDataAPIv3] Error fetching YouTube details:', errorMessage);
        throw new Error(errorMessage, { cause: error });
    }
}

module.exports = { extractYoutubeDetails };
