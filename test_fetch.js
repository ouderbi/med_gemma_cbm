require('dotenv').config();

async function testFetch() {
    console.log("Testing fetch to Gemini API...");
    const model = "gemini-3.1-pro-preview";
    const stream = true;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    
    // We don't even need an API key to test if the DNS/URL parsing works. 
    // If it fails with "fetch failed" before a 403, the URL is bad.
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': 'DUMMY'
            },
            body: JSON.stringify({ contents: [{role: "user", parts: [{text: "Hi"}]}] })
        });
        console.log("Status:", response.status);
    } catch (e) {
        console.error("Caught exception:", e);
    }
}

testFetch();
