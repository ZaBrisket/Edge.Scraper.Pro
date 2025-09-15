import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('M&A Target List Builder', () => {
  test.beforeEach(async ({ page }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8888';
    await page.goto(`${baseUrl}/targets`);
  });

  test('should load the page correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('M&A Target List Builder');
    await expect(page.locator('#uploader')).toBeVisible();
    await expect(page.locator('#fileInput')).toBeAttached();
  });

  test('should upload and process SourceScrub CSV', async ({ page }) => {
    // Upload the test CSV
    const filePath = path.resolve(__dirname, '../fixtures/sourcescrub_sample.csv');
    await page.setInputFiles('#fileInput', filePath);
    
    // Wait for processing
    await expect(page.locator('#uploadStatus')).toContainText('Successfully loaded');
    
    // Check summary panel
    await expect(page.locator('#summaryPanel')).toBeVisible();
    await expect(page.locator('#statCompanies')).toContainText('3');
    
    // Check table rendering
    await expect(page.locator('#tablePanel')).toBeVisible();
    await expect(page.locator('#targetTbody tr')).toHaveCount(3);
    
    // Verify company names
    await expect(page.locator('#targetTbody tr:first-child')).toContainText('Summit Industries');
    await expect(page.locator('#targetTbody tr:nth-child(2)')).toContainText('Reina Imaging');
    await expect(page.locator('#targetTbody tr:nth-child(3)')).toContainText('PACSHealth');
  });

  test('should filter by state', async ({ page }) => {
    // Upload file first
    const filePath = path.resolve(__dirname, '../fixtures/sourcescrub_sample.csv');
    await page.setInputFiles('#fileInput', filePath);
    await expect(page.locator('#uploadStatus')).toContainText('Successfully loaded');
    
    // Apply state filter
    await page.selectOption('#stateFilter', 'IL');
    
    // Check filtered results
    await expect(page.locator('#targetTbody tr')).toHaveCount(2);
    await expect(page.locator('#statCompanies')).toContainText('2');
  });

  test('should search companies', async ({ page }) => {
    // Upload file first
    const filePath = path.resolve(__dirname, '../fixtures/sourcescrub_sample.csv');
    await page.setInputFiles('#fileInput', filePath);
    await expect(page.locator('#uploadStatus')).toContainText('Successfully loaded');
    
    // Search for PACS
    await page.fill('#searchBox', 'PACS');
    
    // Check search results
    await expect(page.locator('#targetTbody tr')).toHaveCount(1);
    await expect(page.locator('#targetTbody')).toContainText('PACSHealth');
  });

  test('should sort table columns', async ({ page }) => {
    // Upload file first
    const filePath = path.resolve(__dirname, '../fixtures/sourcescrub_sample.csv');
    await page.setInputFiles('#fileInput', filePath);
    await expect(page.locator('#uploadStatus')).toContainText('Successfully loaded');
    
    // Click on State column to sort
    await page.click('th[data-column="state"]');
    
    // First row should be AZ (ascending)
    await expect(page.locator('#targetTbody tr:first-child')).toContainText('AZ');
    
    // Click again for descending
    await page.click('th[data-column="state"]');
    
    // First row should be IL (descending)
    await expect(page.locator('#targetTbody tr:first-child')).toContainText('IL');
  });

  test('should export CSV', async ({ page }) => {
    // Upload file first
    const filePath = path.resolve(__dirname, '../fixtures/sourcescrub_sample.csv');
    await page.setInputFiles('#fileInput', filePath);
    await expect(page.locator('#uploadStatus')).toContainText('Successfully loaded');
    
    // Set up download promise
    const downloadPromise = page.waitForEvent('download');
    
    // Click export CSV
    await page.click('#exportCsvBtn');
    
    // Verify download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('target-universe.csv');
  });

  test('should persist data in localStorage', async ({ page }) => {
    // Upload file
    const filePath = path.resolve(__dirname, '../fixtures/sourcescrub_sample.csv');
    await page.setInputFiles('#fileInput', filePath);
    await expect(page.locator('#uploadStatus')).toContainText('Successfully loaded');
    
    // Reload page
    await page.reload();
    
    // Check data is restored
    await expect(page.locator('#uploadStatus')).toContainText('Previous session restored');
    await expect(page.locator('#statCompanies')).toContainText('3');
    await expect(page.locator('#targetTbody tr')).toHaveCount(3);
  });

  test('should clear all data', async ({ page }) => {
    // Upload file first
    const filePath = path.resolve(__dirname, '../fixtures/sourcescrub_sample.csv');
    await page.setInputFiles('#fileInput', filePath);
    await expect(page.locator('#uploadStatus')).toContainText('Successfully loaded');
    
    // Click clear and confirm
    page.on('dialog', dialog => dialog.accept());
    await page.click('#clearBtn');
    
    // Check data is cleared
    await expect(page.locator('#uploadStatus')).toContainText('All data cleared');
    await expect(page.locator('#summaryPanel')).not.toBeVisible();
    await expect(page.locator('#tablePanel')).not.toBeVisible();
  });
});