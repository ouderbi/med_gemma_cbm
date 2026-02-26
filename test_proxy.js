const fs = require('fs');
async function test() {
    console.log("Fetching proxy...");
    const response = await fetch('https://medgemma-proxy-927344461840.us-central1.run.app/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{role:"user", content:"Ola"}], max_tokens: 50, temperature: 0.3 })
    });
    const text = await response.text();
    fs.writeFileSync('proxy_response_body.json', text, 'utf8');
    console.log("Saved to proxy_response_body.json");
}
test().catch(console.error);
