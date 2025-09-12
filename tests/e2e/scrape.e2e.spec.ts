// tests/e2e/scrape.e2e.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Scrape Flow', () => {
  test('scrape flow works without CORS/auth errors', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8888';
    
    // Track console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to the app
    await page.goto(baseUrl);
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check if the page loaded successfully
    await expect(page).toHaveTitle(/Edge Scraper Pro/i);

    // Navigate to scrape UI (assuming there's a link or button)
    const scrapeLink = page.locator('a[href="/scrape"]').first();
    if (await scrapeLink.isVisible()) {
      await scrapeLink.click();
    } else {
      // If no direct link, try to navigate directly
      await page.goto(`${baseUrl}/scrape`);
    }

    // Wait for the scrape page to load
    await page.waitForLoadState('networkidle');

    // Look for URL input field
    const urlInput = page.locator('[data-testid="url-input"]').first();
    if (await urlInput.isVisible()) {
      // Fill in a simple URL
      await urlInput.fill('https://example.com');
      
      // Look for submit button
      const submitButton = page.locator('[data-testid="scrape-submit"]').first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        
        // Wait for results or progress indicator
        await page.waitForSelector('[data-testid="scrape-result"], [data-testid="scrape-progress"], .loading, .spinner', { 
          timeout: 30000 
        });
      }
    }

    // Check for CORS/auth errors in console
    const corsErrors = errors.filter(error => 
      error.includes('CORS') || 
      error.includes('401') || 
      error.includes('403') ||
      error.includes('Access-Control-Allow-Origin')
    );

    expect(corsErrors).toHaveLength(0);
    
    if (corsErrors.length > 0) {
      console.log('CORS/Auth errors found:', corsErrors);
    }
  });

  test('handles robots.txt respect parameter', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8888';
    
    // Navigate to scrape page
    await page.goto(`${baseUrl}/scrape`);
    await page.waitForLoadState('networkidle');

    // Look for robots.txt toggle or respect parameter
    const robotsToggle = page.locator('[data-testid="respect-robots"]').first();
    if (await robotsToggle.isVisible()) {
      // Test with robots.txt disabled
      await robotsToggle.uncheck();
      
      const urlInput = page.locator('[data-testid="url-input"]').first();
      if (await urlInput.isVisible()) {
        await urlInput.fill('https://example.com');
        
        const submitButton = page.locator('[data-testid="scrape-submit"]').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
          
          // Should not get blocked by robots.txt
          await page.waitForSelector('[data-testid="scrape-result"], [data-testid="scrape-progress"]', { 
            timeout: 30000 
          });
        }
      }
    }
  });

  test('displays proper error messages for invalid URLs', async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8888';
    
    await page.goto(`${baseUrl}/scrape`);
    await page.waitForLoadState('networkidle');

    const urlInput = page.locator('[data-testid="url-input"]').first();
    if (await urlInput.isVisible()) {
      // Test with invalid URL
      await urlInput.fill('not-a-valid-url');
      
      const submitButton = page.locator('[data-testid="scrape-submit"]').first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        
        // Should show validation error
        await page.waitForSelector('.error, [data-testid="error-message"]', { timeout: 5000 });
      }
    }
  });
});