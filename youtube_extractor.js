const axios = require('axios');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

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
 */
async function extractYoutubeDetails(url) {
    try {
        const videoId = extractVideoId(url);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        const response = await axios.get(apiUrl);

        if (!response.data.items || response.data.items.length === 0) {
            throw new Error('Video not found or is private');
        }

        const item = response.data.items[0].snippet;
        
        return {
            title: item.title,
            channel: item.channelTitle,
            description: item.description,
            publishedAt: item.publishedAt
        };
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
        return { error: errorMessage };
    }
}

module.exports = { extractYoutubeDetails };
