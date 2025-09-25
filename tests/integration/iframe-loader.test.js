const { test, expect } = require('@playwright/test');

test.describe('Iframe Loader Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock console.log to capture telemetry
    await page.addInitScript(() => {
      window.telemetryEvents = [];
      window.sendTelemetry = (event, data) => {
        window.telemetryEvents.push({ event, data, timestamp: Date.now() });
      };
    });
  });

  test('NDA Reviewer iframe loads successfully', async ({ page }) => {
    await page.goto('/nda/');
    
    // Wait for iframe to load
    const iframe = page.frameLocator('iframe.app-frame');
    await expect(iframe.locator('h1')).toContainText('NDA Reviewer 2.0');
    
    // Verify no error state
    const frameElement = page.locator('iframe.app-frame');
    await expect(frameElement).not.toHaveAttribute('data-error');
    await expect(frameElement).not.toHaveAttribute('data-loading');
    
    // Check telemetry
    const events = await page.evaluate(() => window.telemetryEvents);
    const loadEvent = events.find(e => e.event === 'iframe_loaded');
    expect(loadEvent).toBeDefined();
    expect(loadEvent.data.app).toBe('NDA Reviewer');
  });

  test('M&A Target Lists iframe loads successfully', async ({ page }) => {
    await page.goto('/targets/');
    
    // Wait for iframe to load
    const iframe = page.frameLocator('iframe.app-frame');
    await expect(iframe.locator('h1')).toContainText('M&A Target List Builder');
    
    // Verify no error state
    const frameElement = page.locator('iframe.app-frame');
    await expect(frameElement).not.toHaveAttribute('data-error');
    await expect(frameElement).not.toHaveAttribute('data-loading');
  });

  test('Retry mechanism works on load failure', async ({ page }) => {
    await page.goto('/nda/');

    const iframe = page.frameLocator('iframe.app-frame');
    await expect(iframe.locator('h1')).toContainText('NDA Reviewer 2.0');

    await page.evaluate(() => {
      const loader = window.__iframeLoader;
      if (!loader) return;
      loader.forceError();
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const loader = window.__iframeLoader;
      if (!loader) return;
      loader.forceError();
    });
    await page.waitForTimeout(2000);
    await expect(iframe.locator('h1')).toContainText('NDA Reviewer 2.0', { timeout: 15000 });

    const events = await page.evaluate(() => window.telemetryEvents);
    const retryEvents = events.filter(e => e.event === 'iframe_retry');
    const errorEvents = events.filter(e => e.event === 'iframe_error');
    expect(retryEvents.length).toBeGreaterThanOrEqual(1);
    expect(errorEvents.length).toBeGreaterThanOrEqual(2);
  });

  test('Max retries respected on persistent failure', async ({ page }) => {
    await page.goto('/targets/');

    const frameElement = page.locator('iframe.app-frame');
    await expect(frameElement).not.toHaveAttribute('data-error');

    await page.evaluate(() => {
      const loader = window.__iframeLoader;
      if (!loader) return;
      for (let i = 0; i < 4; i += 1) {
        setTimeout(() => loader.forceError(), i * 50);
      }
    });

    await page.waitForTimeout(1000);
    await expect(frameElement).toHaveAttribute('data-error', 'true', { timeout: 15000 });

    const events = await page.evaluate(() => window.telemetryEvents);
    const failedEvent = events.find(e => e.event === 'iframe_failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.data.totalAttempts).toBe(4); // 1 initial + 3 retries
    const errorEvents = events.filter(e => e.event === 'iframe_error');
    expect(errorEvents.length).toBeGreaterThanOrEqual(4);
  });
});
