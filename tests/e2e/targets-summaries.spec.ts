import { test, expect } from '@playwright/test';

test.describe('Targets page', () => {
  test('loads and exports after parsing sample CSV', async ({ page }) => {
    await page.goto('/targets/');
    await expect(page.locator('h1')).toHaveText(/M&A Target List Builder/i);
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();

    const content = `Company Name,Website,Description,Industries,End Markets
Acme Testing,https://acme-testing.com,We provide balancing, testing and commissioning for HVAC systems.,HVAC; Building Services,Commercial; Healthcare
Edge Widgets,edgewidgets.co,Leading provider of edge analytics hardware with global presence.,Electronics,Industrial`;
    const path = 'outputs/test_targets_sample.csv';
    try { const fs = require('fs'); fs.mkdirSync('outputs', { recursive: true }); fs.writeFileSync(path, content); } catch {}

    await fileInput.setInputFiles(path);
    await expect(page.locator('#mappingSummary')).toContainText(/Auto-mapped columns:/, { timeout: 15000 });
    await expect(page.locator('#resultsTable tbody tr')).toHaveCount(2, { timeout: 15000 });

    const btnCsv = page.locator('#btnExportCsv');
    const [ download ] = await Promise.all([
      page.waitForEvent('download'),
      btnCsv.click()
    ]);
    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/ma_targets_standardized\.csv$/i);
  });
});

