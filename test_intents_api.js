const http = require('http');

function testIntent(promptText, intentName) {
  return new Promise((resolve) => {
    console.log(`\n========================================`);
    console.log(`TESTING INTENT: ${intentName}`);
    console.log(`PROMPT: "${promptText}"`);
    console.log(`========================================\n`);

    const data = JSON.stringify({ message: promptText });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/gemini',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          console.log(`[STATUS CODE]: ${res.statusCode}`);
          console.log(`[RESPONSE PREVIEW (first 1000 chars)]:\n`);
          console.log(parsed.reply ? parsed.reply.substring(0, 1000) + '\n\n[TRUNCATED...]' : responseData);
          resolve();
        } catch(e) {
          console.log('Raw Response:', responseData);
          resolve();
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error:', error.message);
      resolve();
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  await testIntent("Crie um plano de aula completo usando metodologias ativas e tabela de rubrica osce para uma simulação prática sobre Abdome Agudo", "PROFESSOR_TOOLS");
  await testIntent("crie uma prova nível enamed com 2 questões difíceis sobre sepse. No final me dê o gabarito comentado justificando cada alternativa", "EXAM_FACTORY");
}
run();
