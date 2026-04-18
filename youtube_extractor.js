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
        throw new Error('No YouTube API key configured — using scrape fallback');
    }
    try {
        const videoId = extractVideoId(url);
        if (videoId) {
            const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
            const response = await axios.get(apiUrl);

            if (!response.data.items || response.data.items.length === 0) {
                throw new Error('Video not found or is private');
            }

            const item = response.data.items[0].snippet;
            const channelId = item.channelId;
            
            let channelAvatar = null;
            try {
                const channelApiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`;
                const channelResponse = await axios.get(channelApiUrl);
                if (channelResponse.data.items && channelResponse.data.items.length > 0) {
                    const cSnippet = channelResponse.data.items[0].snippet;
                    // High is typically 240x240 or 256x256, perfect for logo dimensions
                    channelAvatar = cSnippet.thumbnails?.high?.url || cSnippet.thumbnails?.default?.url;
                }
            } catch (e) {
                console.error('Failed to fetch channel secondary data for logo:', e.message);
            }
            
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

            const channelResponse = await axios.get(channelApiUrl);

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
            const playlistResponse = await axios.get(playlistUrl);
            
            if (!playlistResponse.data.items || playlistResponse.data.items.length === 0) {
                throw new Error('Channel has no uploaded videos.');
            }

            // Extract the latest video ID and recurse to extract it just like a normal video URL.
            // Depth guard prevents infinite loops in edge cases.
            if (_depth >= 1) throw new Error('YouTube extraction recursion depth limit reached.');
            const latestVideoId = playlistResponse.data.items[0].snippet.resourceId.videoId;
            return extractYoutubeDetails(`https://www.youtube.com/watch?v=${latestVideoId}`, _depth + 1);
        }

        // None matched
        throw new Error('Invalid YouTube URL');

    } catch (error) {
        let errorMessage = error.message;
        if (error.response && error.response.data && error.response.data.error) {
            const apiMsg = error.response.data.error.message;
            if (apiMsg.toLowerCase().includes('quota')) {
                errorMessage = `Quota Exceeded: Your YouTube API key has run out of requests for today. (${apiMsg})`;
            } else if (error.response.status === 403) {
                errorMessage = `API Key Forbidden (403): Your API key is likely missing the "YouTube Data API v3" scope in Google Cloud, or has IP/website restrictions blocking it. (${apiMsg})`;
            } else {
                errorMessage = `YouTube API Error: ${apiMsg}`;
            }
        }
        
        console.error('Error fetching YouTube details:', errorMessage);
        throw new Error(errorMessage);
    }
}

module.exports = { extractYoutubeDetails };
