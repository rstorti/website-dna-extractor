const http = require('http');

const data = JSON.stringify({
  url: 'https://www.scaramucci.net/',
  youtubeUrl: 'https://www.youtube.com/watch?v=qHMEWxMMpiE',
  profileUrl: 'https://linktr.ee/anthonyscaramucci'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/extract',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Sending request to /api/extract...');
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`STATUS: ${res.statusCode}`);
    if (res.statusCode !== 200) {
       console.error(`Received error: ${body}`);
    } else {
       console.log('Extraction Success!');
       console.log(body.substring(0, 500) + '... (truncated)');
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(data);
req.end();
