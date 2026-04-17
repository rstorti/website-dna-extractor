const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'outputs', 'history.json');

async function run() {
  const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  let updatedCount = 0;

  for (const item of data) {
    let changed = false;

    // Fix youtube_url if missing
    if (!item.youtube_url) {
      if (item.payload && item.payload.youtubeData && item.payload.youtubeData.thumbnail) {
        // Thumbnail is like https://i.ytimg.com/vi/sEgkGynunpY/maxresdefault.jpg
        const match = item.payload.youtubeData.thumbnail.match(/vi\/([^\/]+)\//);
        if (match && match[1]) {
          item.youtube_url = `https://www.youtube.com/watch?v=${match[1]}`;
          changed = true;
        }
      }
    }

    // Fix target_url if missing but url is available and not a youtube link.
    // In original code, url was saved as target_url unless it was youtube.
    if (!item.target_url && item.url) {
       if (!item.url.includes('youtube.com') && !item.url.includes('youtu.be')) {
         item.target_url = item.url;
         changed = true;
       }
    }

    if (changed) {
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
    console.log(`Updated ${updatedCount} history records with missing youtube URLs/target URLs.`);
  } else {
    console.log(`No records needed updating.`);
  }
}

run().catch(console.error);
