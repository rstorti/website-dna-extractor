const axios = require('axios');
const fs = require('fs/promises');

async function runTest() {
  console.log("Running Extraction Test for Scaramucci...");
  try {
    const response = await axios.post('http://localhost:3001/api/extract', {
      url: 'https://www.scaramucci.net/',
      youtubeUrl: 'https://www.youtube.com/watch?v=qHMEWxMMpiE',
      profileUrl: 'https://linktr.ee/anthonyscaramucci'
    }, { timeout: 300000 });
    console.log("Success! Status:", response.status);
    console.log("Received AI Data for:", response.data?.mappedData?.name);
    console.log("Saving full response to test_scaramucci_output.json");
    await fs.writeFile('test_scaramucci_output.json', JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error("Test failed:", err.message);
    if (err.response) {
      console.error(err.response.data);
    }
  }
}
runTest();
