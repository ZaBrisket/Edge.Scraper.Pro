import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';

test.describe('Targets page', () => {
  test('loads and exports after parsing sample CSV', async ({ page }) => {
    await page.goto('/targets/');
    await expect(page.locator('h1')).toHaveText(/Target List Builder/i);

    const frame = page.frameLocator('iframe[title="Target Lists App"]');
    await frame.locator('#fileInput').waitFor({ state: 'visible' });

    const content = `Company Name,Website,Description,Industries,End Markets\nAcme Testing,https://acme-testing.com,We provide balancing, testing and commissioning for HVAC systems.,HVAC; Building Services,Commercial; Healthcare\nEdge Widgets,edgewidgets.co,Leading provider of edge analytics hardware with global presence.,Electronics,Industrial`;
    const outputDir = path.join(process.cwd(), 'outputs');
    mkdirSync(outputDir, { recursive: true });
    const filePath = path.join(outputDir, 'test_targets_sample.csv');
    writeFileSync(filePath, content);

    const fileInput = frame.locator('#fileInput');
    await fileInput.setInputFiles(filePath);

    await expect(frame.locator('#mappingSummary')).toContainText(/Auto-mapped columns:/i, { timeout: 20000 });
    await expect(frame.locator('#resultsTable tbody tr')).toHaveCount(2, { timeout: 20000 });

    const exportButton = frame.locator('#exportCsvBtn');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportButton.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/ma_targets_standardized\.csv$/i);
  });
});
