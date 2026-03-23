const axios = require('axios');
const fs = require('fs/promises');

async function getLogo() {
    try {
        const url = 'https://logo.clearbit.com/mazda.com';
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        await fs.writeFile('test_mazda_clearbit.png', res.data);
        console.log("Success extracting clearbit logo metadata!");
    } catch (e) {
        console.log("Failed:", e.message);
    }
}
getLogo();
