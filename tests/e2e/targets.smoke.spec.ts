import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Targets canonical route', () => {
  test('parses sample CSV and validates exports', async ({ page }) => {
    await page.goto('/targets');
    await expect(page).toHaveURL(/\/targets\/$/);

    await expect(page.locator('header .brand')).toContainText('EdgeScraperPro');

    const frame = page.frameLocator('iframe[title="Target Lists App"]');
    const iframeHandle = await page.waitForSelector('iframe[title="Target Lists App"]');
    const targetFrame = await iframeHandle.contentFrame();
    if (!targetFrame) {
      throw new Error('Target Lists App frame not found');
    }
    const fileInput = frame.locator('#fileInput');
    const samplePath = path.join(process.cwd(), 'outputs', 'test_targets_sample.csv');

    await fileInput.setInputFiles(samplePath);

    await expect.poll(async () => frame.locator('#resultsTable tbody tr').count(), {
      message: 'expected parsed target rows',
      timeout: 20_000,
    }).toBeGreaterThan(0);

    const csvButton = frame.locator('#exportCsvBtn');
    await expect(csvButton).toBeEnabled({ timeout: 20_000 });

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      csvButton.click(),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/ma_targets_standardized\.csv$/i);

    const excelButton = frame.locator('#exportExcelBtn');
    await expect(excelButton).toBeEnabled();

    const excelSupport = await targetFrame.evaluate(() => {
      type ExcelGlobal = typeof window & { XLSX?: { utils?: { json_to_sheet?: unknown } } };
      const xlsx = (window as ExcelGlobal).XLSX;
      return Boolean(xlsx && xlsx.utils && typeof xlsx.utils.json_to_sheet === 'function');
    });

    if (excelSupport) {
      const [xlsxDownload] = await Promise.all([
        page.waitForEvent('download'),
        excelButton.click(),
      ]);
      expect(xlsxDownload.suggestedFilename()).toMatch(/ma_targets_standardized\.xlsx$/i);
    } else {
      const pendingDownload = page.waitForEvent('download', { timeout: 2_000 }).catch(() => null);
      await excelButton.click();
      const maybeDownload = await pendingDownload;
      expect(maybeDownload).toBeNull();
      await expect(frame.locator('.toast-banner')).toContainText(/Excel export unavailable/i);
    }
  });
});
