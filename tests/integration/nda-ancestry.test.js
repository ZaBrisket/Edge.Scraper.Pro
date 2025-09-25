const { test, expect } = require('@playwright/test');

test.describe('NDA frame guard integration', () => {
  test('blocks unapproved parent origins and reports telemetry', async ({ page }) => {
    await page.addInitScript(() => {
      window.telemetryEvents = [];
      window.sendTelemetry = function(event, data) {
        window.telemetryEvents.push({ event, data });
      };
      if (window.location.pathname.endsWith('/nda/app.html')) {
        try {
          Object.defineProperty(window, 'top', {
            configurable: true,
            get: () => ({ stub: true })
          });
        } catch (err) {
          window.__frameGuardTopStub = { stub: true };
        }
        Object.defineProperty(document, 'referrer', {
          configurable: true,
          get: () => 'https://evil.example.com/'
        });
      }
    });

    await page.goto('/nda/app.html');

    await expect(page.locator('[data-frame-guard="blocked"]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-frame-blocked', 'true');

    const telemetry = await page.evaluate(() => window.telemetryEvents || []);
    const blockedEvent = telemetry.find((entry) => entry.event === 'iframe_blocked');
    expect(blockedEvent).toBeDefined();
    expect(blockedEvent.data.origin).toBe('https://evil.example.com');
  });
});
