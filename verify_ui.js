const puppeteer = require('puppeteer');

(async () => {
    console.log("Launching headless browser...");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const filePath = 'file:///C:/Users/ouder/med_gemma_cbm/public/index.html';
    
    // Test 1: Full Desktop View
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(filePath);
    console.log("Waiting for desktop layout to settle...");
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'C:\\Users\\ouder\\.gemini\\antigravity\\brain\\b1c923a5-0269-4ac5-a38d-243817af3eb2\\desktop_glass_verification.png' });
    console.log("Desktop screenshot saved.");
    
    // Test 2: Mobile View (Closed Menu)
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await page.reload(); // Reload for media queries
    console.log("Waiting for mobile closed layout to settle...");
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'C:\\Users\\ouder\\.gemini\\antigravity\\brain\\b1c923a5-0269-4ac5-a38d-243817af3eb2\\mobile_glass_closed.png' });
    console.log("Mobile closed screenshot saved.");

    // Test 3: Mobile View (Open Menu)
    console.log("Opening mobile menu...");
    await page.click('.menu-btn');
    await new Promise(r => setTimeout(r, 800)); // Wait for animation
    await page.screenshot({ path: 'C:\\Users\\ouder\\.gemini\\antigravity\\brain\\b1c923a5-0269-4ac5-a38d-243817af3eb2\\mobile_glass_open.png' });
    console.log("Mobile open screenshot saved.");

    await browser.close();
    console.log("All verifications complete.");
})();
