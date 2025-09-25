const { test, expect } = require('@playwright/test');

test.describe('NDA Reviewer E2E', () => {
  test('loads without CSP errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto('/nda/');
    
    // Wait for iframe content
    const iframe = page.frameLocator('iframe.app-frame');
    await expect(iframe.locator('h1')).toBeVisible();
    
    // Check for CSP violations
    const cspErrors = consoleErrors
      .filter(err => err.includes('Content Security Policy') || err.includes('CSP'))
      .filter(err => !err.includes("'frame-ancestors' is ignored when delivered via a <meta> element"));
    expect(cspErrors).toHaveLength(0);
  });

  test('text analysis works', async ({ page }) => {
    await page.goto('/nda/');
    
    const iframe = page.frameLocator('iframe.app-frame');
    
    // Enter sample NDA text
    await iframe.locator('#textInput').fill('This is a confidential agreement with best efforts clause.');
    await iframe.locator('#analyzeBtn').click();
    
    // Wait for analysis
    await expect(iframe.locator('#analysisStatus')).not.toContainText('Idle');
    
    // Check for issues detected (fallback engine should detect "best efforts")
    await expect(iframe.locator('#issues')).toContainText('best efforts', { timeout: 5000 });
  });

  test('policy engine fallback loads on main script error', async ({ page }) => {
    // Block main policy engine
    await page.route('/nda/policyEngine.browser.js', route => route.abort());
    
    await page.goto('/nda/');
    
    const iframe = page.frameLocator('iframe.app-frame');
    
    // Should still be able to analyze with fallback
    await iframe.locator('#textInput').fill('Test text with perpetual term.');
    await iframe.locator('#analyzeBtn').click();
    
    // Fallback should detect "perpetual"
    await expect(iframe.locator('#issues')).toContainText('perpetual', { timeout: 5000 });
  });
});
