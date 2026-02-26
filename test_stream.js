const fetch = require('node-fetch'); // We might need to use dynamic import if it's ESM, or just native fetch in Node 18+

async function testStream() {
    console.log("Starting stream test...");
    try {
        const response = await fetch('http://localhost:8080/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Explique em tópicos as vantagens da ressonância magnética no cérebro. Teste de formatação.' }],
                max_tokens: 500,
                temperature: 0.3,
                stream: true
            })
        });

        console.log("Response status:", response.status);
        console.log("Headers:", response.headers.get('content-type'));

        const decoder = new TextDecoder("utf-8");
        for await (const chunk of response.body) {
            const text = decoder.decode(chunk);
            console.log("CHUNK RECEIVED:", text);
            // We only need to see a few chunks to verify streaming
            if (text.includes('ressonância') || text.includes('magnética') || text.length > 50) {
                console.log("Test successful: Stream is working.");
                process.exit(0);
            }
        }
        console.log("Stream ended.");
    } catch (err) {
        console.error("Test failed:", err);
    }
}

testStream();
