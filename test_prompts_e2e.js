const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\ouder\\.gemini\\antigravity\\brain\\98b61f4d-7d6c-44a8-a8b2-0a34058e1011';

async function runTests() {
  console.log("Launching headless browser for Prompt Engineering E2E tests...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Load the running dev server
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  console.log("Page loaded.");

  // Helper function to send message and wait for response
  async function testPrompt(promptText, testName) {
    console.log(`\n--- Testing [${testName}] ---`);
    console.log(`Prompt: "${promptText}"`);
    
    // Type in the input field
    await page.type('#chat-input', promptText);
    await new Promise(r => setTimeout(r, 500));
    
    // Click send
    await page.click('#chat-send-btn');
    
    console.log("Waiting for AI response stream to finish... (up to 40 seconds)");
    // Wait until the typing indicator goes away and the response seems complete.
    // The UI adds a "typing..." message and then removes it, or stops streaming. Let's wait a fixed generous amount of time or until cursor disappears.
    await new Promise(r => setTimeout(r, 15000)); // 15 seconds to allow full markdown generation

    // Capture screenshot
    const screenshotPath = path.join(brainDir, `${testName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Extract the latest AI message text
    const aiMessages = await page.$$eval('.message.ai .message-content', els => els.map(el => el.innerText));
    if (aiMessages.length > 0) {
      const latestMessage = aiMessages[aiMessages.length - 1];
      console.log(`\n[AI RESPONSE PREVIEW (first 800 chars)]:\n${latestMessage.substring(0, 800)}...\n`);
      fs.writeFileSync(path.join(brainDir, `${testName}_output.txt`), latestMessage);
    } else {
      console.log("No AI message found in DOM.");
    }

    // Start a new conversation for the next test
    await page.evaluate(() => {
        if(window.startNewConversation) window.startNewConversation();
    });
    await new Promise(r => setTimeout(r, 1000));
  }

  try {
    // 1. Test Professor Tools
    await testPrompt(
      "Gere um plano de aula completo usando a Taxonomia de Bloom e uma tabela de rubrica OSCE para uma simulação prática sobre Abdome Agudo",
      "test_professor_tools"
    );

    // 2. Test Exam Factory
    await testPrompt(
      "Crie uma prova nível ENAMED com 2 questões difíceis sobre sepse. No final me dê o gabarito comentado justificando cada alternativa",
      "test_exam_factory"
    );
  } catch(e) {
    console.error("Test failed:", e);
  } finally {
    await browser.close();
    console.log("Tests complete.");
  }
}

runTests();
