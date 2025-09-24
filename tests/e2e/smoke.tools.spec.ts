import { test, expect, Page } from '@playwright/test';

test.describe('EdgeScraperPro tools hub & wrappers', () => {
  test.describe.configure({ timeout: 120_000 });

  async function visit(page: Page, path: string) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    } catch (error) {
      if (String(error).includes('ERR_ABORTED')) {
        await page.waitForTimeout(1500);
      } else {
        throw error;
      }
    }
  }

  test('Home shows five tool cards', async ({ page }) => {
    await visit(page, '/');
    await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(5);
    await expect(page.getByRole('link', { name: 'Open Scraper' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Sports' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Companies' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Target Lists' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open NDA Reviewer' })).toBeVisible();
  });

  test('Scrape wrapper loads original app', async ({ page }) => {
    await visit(page, '/scrape');
    const iframe = page.frameLocator('#app');
    await expect(iframe.getByRole('heading', { name: /Extraction Settings/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('link', { name: 'Scrape', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('Sports wrapper attempts to preselect Sports mode', async ({ page }) => {
    await visit(page, '/sports');
    await expect(page.locator('body')).toHaveAttribute('data-mode', /sports|fallback|error/);
    const iframe = page.frameLocator('#app');
    await expect(iframe.getByText(/Sports/i).first()).toBeVisible();
  });

  test('Companies wrapper attempts to preselect Companies mode', async ({ page }) => {
    await visit(page, '/companies');
    await expect(page.locator('body')).toHaveAttribute('data-mode', /companies|fallback|error/);
    const iframe = page.frameLocator('#app');
    await expect(iframe.getByText(/Compan(y|ies)/i).first()).toBeVisible();
  });

  test('Targets & NDA wrappers show unified header and iframe', async ({ page }) => {
    await visit(page, '/targets');
    await expect(page.getByRole('banner').getByText('EdgeScraperPro')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('iframe[title="Target Lists App"]')).toBeVisible();
    await visit(page, '/nda');
    await expect(page.getByRole('banner').getByText('EdgeScraperPro')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('iframe[title="NDA Reviewer App"]')).toBeVisible();
  });
});
