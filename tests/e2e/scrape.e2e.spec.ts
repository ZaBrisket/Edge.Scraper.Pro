import { test, expect } from '@playwright/test';

test.describe('Scrape Flow', () => {
  test('should complete scrape flow without CORS/auth errors', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8888';
    
    // Track console errors
    const errors: string[] = [];
    page.on('console', msg => { 
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to home page
    await page.goto(baseUrl);
    await expect(page).toHaveTitle(/Edge Scraper Pro/i);

    // Navigate to scrape UI
    await page.click('a[href="/scrape"]');
    await page.waitForLoadState('networkidle');

    // Fill in a test URL
    const urlInput = page.locator('[data-testid="url-input"]');
    await urlInput.fill('https://example.com');

    // Submit the scrape request
    const submitButton = page.locator('[data-testid="scrape-submit"]');
    await submitButton.click();

    // Wait for results (with timeout)
    const resultsSelector = '[data-testid="scrape-result"]';
    await page.waitForSelector(resultsSelector, { 
      timeout: 30000,
      state: 'visible' 
    });

    // Verify no CORS or auth errors
    const corsErrors = errors.filter(e => /CORS|401|403/i.test(e));
    expect(corsErrors).toHaveLength(0);

    // Verify results are displayed
    const results = page.locator(resultsSelector);
    await expect(results).toBeVisible();
  });

  test('should handle authentication flow', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8888';
    
    await page.goto(baseUrl);

    // If there's a login link, click it
    const loginLink = page.locator('a[href="/login"]');
    if (await loginLink.isVisible()) {
      await loginLink.click();
      
      // Fill in test credentials if login form exists
      const emailInput = page.locator('input[name="email"]');
      const passwordInput = page.locator('input[name="password"]');
      
      if (await emailInput.isVisible()) {
        await emailInput.fill('test@example.com');
        await passwordInput.fill('testpassword123');
        
        const loginButton = page.locator('button[type="submit"]');
        await loginButton.click();
        
        // Wait for redirect or success message
        await page.waitForLoadState('networkidle');
      }
    }

    // Verify we can access the scrape page
    await page.goto(`${baseUrl}/scrape`);
    await expect(page).not.toHaveURL(/login/);
  });

  test('should respect robots.txt toggle', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8888';
    
    await page.goto(`${baseUrl}/scrape`);

    // Look for robots.txt toggle if it exists
    const robotsToggle = page.locator('[data-testid="robots-toggle"]');
    if (await robotsToggle.isVisible()) {
      // Toggle it off
      await robotsToggle.click();
      
      // Verify it's unchecked
      await expect(robotsToggle).not.toBeChecked();
    }

    // Submit a scrape request
    await page.fill('[data-testid="url-input"]', 'https://example.com/restricted');
    await page.click('[data-testid="scrape-submit"]');

    // Should not get robots.txt error
    const errorMessage = page.locator('[data-testid="error-message"]');
    if (await errorMessage.isVisible()) {
      const errorText = await errorMessage.textContent();
      expect(errorText).not.toContain('robots.txt');
    }
  });
});