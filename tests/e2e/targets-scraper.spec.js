const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('M&A Targets Scraper E2E', () => {
  test('loads with file upload working', async ({ page }) => {
    await page.goto('/targets/');
    
    const iframe = page.frameLocator('iframe.app-frame');
    
    // Check main elements are visible
    await expect(iframe.locator('h1')).toContainText('M&A Target List Builder');
    await expect(iframe.locator('#fileInput')).toBeVisible();
    
    // Test file upload
    const testCsvPath = path.join(__dirname, '../fixtures/test-companies.csv');
    await iframe.locator('#fileInput').setInputFiles(testCsvPath);
    
    // Should show mapping summary
    await expect(iframe.locator('#mappingSummary')).not.toContainText('Waiting for file');
  });

  test('export buttons enabled after file processing', async ({ page }) => {
    await page.goto('/targets/');
    
    const iframe = page.frameLocator('iframe.app-frame');
    
    // Initially disabled
    await expect(iframe.locator('#btnExportCsv')).toBeDisabled();
    await expect(iframe.locator('#btnExportXlsx')).toBeDisabled();
    
    // Upload file
    const testCsvPath = path.join(__dirname, '../fixtures/test-companies.csv');
    await iframe.locator('#fileInput').setInputFiles(testCsvPath);
    
    // Wait for processing
    await page.waitForTimeout(2000);
    
    // Should be enabled after processing
    await expect(iframe.locator('#btnExportCsv')).toBeEnabled();
    await expect(iframe.locator('#btnExportXlsx')).toBeEnabled();
  });
});
