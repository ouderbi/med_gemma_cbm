const http = require('http');

const data = JSON.stringify({
  messages: [{ role: 'user', content: 'Explique em topicos as vantagens do exame de TC.' }],
  stream: true,
  max_tokens: 150
});

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  res.setEncoding('utf8');
  let chunks = 0;
  
  res.on('data', (chunk) => {
    chunks++;
    console.log(`CHUNK ${chunks}:`, chunk);
    if(chunks > 3) process.exit(0);
  });
  
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
