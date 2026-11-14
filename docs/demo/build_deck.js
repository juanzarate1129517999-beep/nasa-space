// Builds the 7-slide demo PDF from docs/demo/deck.html (Space Apps allows up to 7 slides, title included).
// Usage: node docs/demo/build_deck.js
const path = require("path");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(__dirname, "deck.html"), { waitUntil: "load" });
  await page.pdf({ path: path.join(__dirname, "Skylab_Phoenix_demo.pdf"), width: "13.333in", height: "7.5in", printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log("docs/demo/Skylab_Phoenix_demo.pdf written");
})();
