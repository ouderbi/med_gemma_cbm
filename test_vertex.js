require('dotenv').config();
const { GoogleAuth } = require('google-auth-library');

async function test() {
    console.log("Starting test...");
    const authClient = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
    const token = await authClient.getAccessToken();
    const apiUrl = process.env.MEDGEMMA_ENDPOINT_URL + ':predict';
    console.log('Fetching:', apiUrl);
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ instances: [{ "@requestFormat": "chatCompletions", messages: [{role:"user", content:"Ola"}], max_tokens: 50, temperature: 0.3 }] })
        });
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch(err) {
        console.error("Fetch error:", err);
    }
}
test().catch(console.error);
