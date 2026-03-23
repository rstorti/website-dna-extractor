const axios = require('axios');

async function test() {
    try {
        console.log('Sending request to http://localhost:3001/api/extract with url: https://example.com');
        const res = await axios.post('http://localhost:3001/api/extract', { url: 'https://example.com' }, { timeout: 120000 });
        console.log('✅ Extraction Success!');
        console.log(JSON.stringify(res.data, null, 2));

        console.log('\nFetching history to verify Supabase storage...');
        const hist = await axios.get('http://localhost:3001/api/history');
        console.log(`History length: ${hist.data.length}`);
        if (hist.data.length > 0) {
            console.log(JSON.stringify(hist.data[0], null, 2));
        }

    } catch (e) {
        console.error('❌ Test failed:', e.message);
        if (e.response) {
            console.error(e.response.data);
        }
    }
}

test();
