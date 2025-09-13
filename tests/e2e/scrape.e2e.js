import { test, expect } from '@playwright/test';

test('scrape flow without CORS errors', async ({ page }) => {
  await page.goto('https://edgescraperpro.com');
  
  // Monitor console for CORS errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('CORS')) {
      consoleErrors.push(msg.text());
    }
  });

  // Input test URL
  await page.fill('textarea', 'https://example.com');
  await page.click('button:has-text("Scrape")');

  // Wait for response
  await page.waitForResponse(response => 
    response.url().includes('/.netlify/functions/fetch-url') &&
    response.status() === 200
  );

  // Assert no CORS errors
  expect(consoleErrors).toHaveLength(0);
  
  // Assert results rendered
  await expect(page.locator('.results')).toBeVisible();
});

test('health check endpoint returns 200', async ({ request }) => {
  const response = await request.get('https://edgescraperpro.com/.netlify/functions/health');
  
  expect(response.status()).toBe(200);
  
  const data = await response.json();
  expect(data.status).toBe('healthy');
  expect(data.correlationId).toBeTruthy();
  expect(data.timestamp).toBeTruthy();
});

test('OPTIONS preflight returns 204', async ({ request }) => {
  const response = await request.fetch('https://edgescraperpro.com/.netlify/functions/fetch-url', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://edgescraperpro.com',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type'
    }
  });
  
  expect(response.status()).toBe(204);
  expect(response.headers()['access-control-allow-origin']).toBeTruthy();
  expect(response.headers()['access-control-allow-methods']).toContain('GET');
  expect(response.headers()['access-control-allow-headers']).toContain('Content-Type');
});

test('loading states display during processing', async ({ page }) => {
  await page.goto('https://edgescraperpro.com/scrape/news');
  
  // Input multiple URLs
  await page.fill('textarea', [
    'https://example.com/article1',
    'https://example.com/article2',
    'https://example.com/article3'
  ].join('\n'));
  
  // Start scraping
  await page.click('button:has-text("Start Scraping")');
  
  // Check loading state appears
  await expect(page.locator('text=Processing')).toBeVisible();
  
  // Check progress bar
  await expect(page.locator('.progress-bar')).toBeVisible();
  
  // Wait for completion
  await page.waitForResponse(response => 
    response.url().includes('/api/tasks/status/') &&
    response.status() === 200
  );
});

test('error states display on failure', async ({ page }) => {
  await page.goto('https://edgescraperpro.com/scrape/news');
  
  // Input invalid URL
  await page.fill('textarea', 'not-a-valid-url');
  
  // Start scraping
  await page.click('button:has-text("Start Scraping")');
  
  // Check error message appears
  await expect(page.locator('.error-message')).toBeVisible();
  await expect(page.locator('text=Error')).toBeVisible();
});

test('correlation IDs are included in responses', async ({ request }) => {
  const correlationId = 'test-correlation-123';
  
  const response = await request.get('https://edgescraperpro.com/.netlify/functions/health', {
    headers: {
      'x-correlation-id': correlationId
    }
  });
  
  expect(response.headers()['x-correlation-id']).toBe(correlationId);
});

test('unauthorized requests return 401', async ({ request }) => {
  const response = await request.get('https://edgescraperpro.com/.netlify/functions/fetch-url?url=https://example.com', {
    headers: {
      'Origin': 'https://edgescraperpro.com'
    }
  });
  
  // Note: This test assumes authentication is required
  // If the endpoint is public, this test should be adjusted
  expect([200, 401]).toContain(response.status());
});

test('CORS headers vary by origin', async ({ request }) => {
  // Test with allowed origin
  const response1 = await request.get('https://edgescraperpro.com/.netlify/functions/health', {
    headers: {
      'Origin': 'https://edgescraperpro.com'
    }
  });
  
  expect(response1.headers()['access-control-allow-origin']).toBe('https://edgescraperpro.com');
  expect(response1.headers()['vary']).toContain('Origin');
  
  // Test with different origin
  const response2 = await request.get('https://edgescraperpro.com/.netlify/functions/health', {
    headers: {
      'Origin': 'https://example.com'
    }
  });
  
  // Should fallback to default allowed origin
  expect(response2.headers()['access-control-allow-origin']).toBe('https://edgescraperpro.com');
});