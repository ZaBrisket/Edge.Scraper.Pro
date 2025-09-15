/* eslint-env jest */
const fetch = require('node-fetch');

const BASE = process.env.LOCAL_FN_BASE || 'http://localhost:8888/.netlify/functions';

describe('InsuranceJournal article extraction (smoke)', () => {
  const samples = [
    'https://www.insurancejournal.com/news/national/2025/01/27/809603.htm',
    'https://www.insurancejournal.com/news/international/2025/01/24/809519.htm',
    'https://www.insurancejournal.com/news/national/2025/01/23/809288.htm'
  ];

  test('extracts readable article text', async () => {
    for (const url of samples) {
      const r = await fetch(`${BASE}/fetch-url?url=${encodeURIComponent(url)}`, {
        headers: { 'X-API-Key': process.env.PUBLIC_API_KEY || 'public-2024' }
      });
      const j = await r.json();
      expect(j.ok).toBe(true);
      expect(j.article).toBeTruthy();
      expect(j.article.text && j.article.text.length).toBeGreaterThan(400);
      expect(j.article.title).toBeTruthy();
    }
  }, 60000);
});