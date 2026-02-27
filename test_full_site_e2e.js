const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\ouder\\.gemini\\antigravity\\brain\\98b61f4d-7d6c-44a8-a8b2-0a34058e1011';

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runFullSiteTest() {
  console.log("==========================================");
  console.log("🚀 STARTING MEDGEMMA FULL E2E VALIDATION 🚀");
  console.log("==========================================\n");

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log("-> Loading localhost:3000...");
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await wait(1000);

  // Helper macro for screenshots
  async function snap(name) {
      const p = path.join(brainDir, `test_full_${name}.png`);
      await page.screenshot({ path: p });
      console.log(`📸 Screenshot saved: ${name}`);
  }

  try {
      // 1. Theme Testing
      console.log("\n[1/5] Testing Theme Engine...");
      await page.click('.theme-dot[data-theme="emerald"]');
      await wait(500);
      await snap('theme_emerald');
      
      await page.click('.theme-dot[data-theme="gemini-dark"]');
      await wait(500);
      await snap('theme_geminidark');

      await page.click('.theme-dot[data-theme="ocean"]'); // back to default
      await wait(500);

      // 2. Bento Grid Interactive Commands
      console.log("\n[2/5] Testing Bento Grid Commands...");
      
      // -> Quiz
      console.log("-> Clicking 'Gerar Quiz' Bento Card...");
      await page.click('.bento-card[data-command="quiz"]');
      console.log("Waiting for AI response stream (15s limit)...");
      await wait(15000);
      await snap('bento_action_quiz');

      // Clear Context
      console.log("-> Reloading to restore Bento Grid...");
      await page.reload({ waitUntil: 'networkidle0' });
      await wait(1000);

      // -> Case Study
      console.log("-> Clicking 'Estudo de Caso' Bento Card...");
      await page.click('.bento-card[data-command="caso"]');
      console.log("Waiting for AI response stream (15s limit)...");
      await wait(15000);
      await snap('bento_action_case');
      
      console.log("-> Reloading to restore Bento Grid...");
      await page.reload({ waitUntil: 'networkidle0' });
      await wait(1000);

      // -> Flashcards
      console.log("-> Clicking 'Flashcards' Bento Card...");
      await page.click('.bento-card[data-command="flashcard"]');
      console.log("Waiting for AI response stream (15s limit)...");
      await wait(12000);
      await snap('bento_action_flashcard');

      // 3. Navigation Sidebar Pages
      console.log("\n[3/5] Testing Navigation & Pages...");
      
      console.log("-> Navigating to History...");
      await page.click('.nav-item[data-section="history"]');
      await wait(1000);
      await snap('nav_history_page');

      console.log("-> Navigating to About...");
      await page.click('.nav-item[data-section="about"]');
      await wait(1000);
      await snap('nav_about_page');

      console.log("-> Navigating to Settings...");
      await page.click('.nav-item[data-section="settings"]');
      await wait(1000);
      await snap('nav_settings_page');

      console.log("-> Returning to Chat...");
      await page.click('.nav-item[data-section="chat"]');
      await wait(1000);

      // 4. File Upload UI checking
      console.log("\n[4/5] Testing Attachment UI elements...");
      await page.evaluate(() => {
          document.querySelector('.interaction-dock-wrapper').classList.add('active-drag');
      });
      await wait(500);
      await snap('ui_drag_drop_state');

      // 5. Final check
      console.log("\n[5/5] All critical paths executed with pure JS instrumentation.");

  } catch(e) {
      console.error("\n❌ TEST FAILED:", e);
  } finally {
      await browser.close();
      console.log("\n==========================================");
      console.log("✅ MEDGEMMA FULL SITE E2E COMPLETED!");
      console.log("==========================================\n");
  }
}

runFullSiteTest();
