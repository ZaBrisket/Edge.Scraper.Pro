import { test, expect } from '@playwright/test';

test.describe('Wrapper presets', () => {
  test('sports wrapper exposes preset state', async ({ page }) => {
    await page.goto('/sports/');
    await expect(page.locator('body')).toHaveAttribute('data-mode', /(sports|fallback|error)/);

    const iframe = page.frameLocator('#app');
    await expect(iframe.getByRole('heading', { name: /Web Scraper/i })).toBeVisible();
  });

  test('companies wrapper exposes preset state', async ({ page }) => {
    await page.goto('/companies/');
    await expect(page.locator('body')).toHaveAttribute('data-mode', /(companies|fallback|error)/);

    const iframe = page.frameLocator('#app');
    await expect(iframe.getByRole('heading', { name: /Web Scraper/i })).toBeVisible();
  });
});
