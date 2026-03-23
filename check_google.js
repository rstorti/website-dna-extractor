const axios = require('axios');
const fs = require('fs/promises');

async function getLogo() {
    try {
        const url = 'https://www.google.com/s2/favicons?domain=mazda.com&sz=256';
        console.log("Fetching", url);
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        await fs.writeFile('test_mazda_google.png', res.data);
        console.log("Success extracting google logo metadata! Size:", res.data.length);
    } catch (e) {
        console.log("Failed:", e.message);
    }
}
getLogo();
