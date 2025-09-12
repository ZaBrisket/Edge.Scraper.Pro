/**
 * Headless browser renderer using Playwright
 * Provides HTML rendering for JavaScript-driven (SPA) routes.
 */

const { chromium } = require('playwright');

/**
 * Render a SPA route and return the raw HTML.
 * @param {string} url - URL to render
 * @returns {Promise<string>} Rendered HTML string
 */
async function renderSpaPage(url) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const content = await page.content();
    return content;
  } finally {
    await browser.close();
  }
}

module.exports = { renderSpaPage };
