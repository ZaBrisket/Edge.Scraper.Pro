import { test, expect } from '@playwright/test';

async function stubFetchUrl(page) {
  await page.route('**/.netlify/functions/fetch-url**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const targetUrl = requestUrl.searchParams.get('url') || 'https://example.com';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        url: targetUrl,
        article: {
          title: `Stubbed content for ${targetUrl}`,
          content: `Stubbed body for ${targetUrl}`,
        },
        html: '<html><body><main>Stub</main></body></html>',
        strategy: 'stubbed',
        ms: 120,
      }),
    });
  });
}

test.describe('Scrape Flow', () => {
  test('should complete scrape flow without CORS/auth errors', async ({ page }) => {
    await stubFetchUrl(page);

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/EdgeScraperPro/i);

    await page.getByRole('link', { name: 'Scrape', exact: true }).click();

    const iframe = page.frameLocator('#app');
    const urlInput = iframe.locator('#urlInput');
    await urlInput.waitFor({ state: 'visible' });
    await urlInput.fill('https://example.com');

    await iframe.locator('#startButton').click();

    await expect(iframe.locator('#resultsTable tbody tr')).toHaveCount(1, { timeout: 20000 });
    await expect(page.getByRole('link', { name: 'Scrape', exact: true })).toHaveAttribute('aria-current', 'page');

    const corsErrors = errors.filter((e) => /CORS|401|403/i.test(e));
    expect(corsErrors).toHaveLength(0);
  });

  test('should handle authentication flow', async ({ page }) => {
    await page.goto('/');

    const loginLink = page.locator('a[href="/login"], a[href="/login/"]');
    if (await loginLink.isVisible().catch(() => false)) {
      await loginLink.click();
      const emailInput = page.locator('input[name="email"]');
      const passwordInput = page.locator('input[name="password"]');
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill('test@example.com');
        await passwordInput.fill('testpassword123');
        const loginButton = page.locator('button[type="submit"]');
        await loginButton.click();
        await page.waitForLoadState('networkidle');
      }
    }

    await page.goto('/scrape/');
    await expect(page).not.toHaveURL(/login/);
    const iframe = page.frameLocator('#app');
    await expect(iframe.locator('#startButton')).toBeVisible();
  });

  test('should allow toggling sports mode preset', async ({ page }) => {
    await page.goto('/scrape/');

    const iframe = page.frameLocator('#app');
    const sportsToggle = iframe.locator('#sportsMode');
    await sportsToggle.waitFor({ state: 'visible' });
    await sportsToggle.check({ force: true });
    await expect(sportsToggle).toBeChecked();
    await sportsToggle.uncheck({ force: true });
    await expect(sportsToggle).not.toBeChecked();
  });
});
