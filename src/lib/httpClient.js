// src/lib/httpClient.js
// Hardened HTTP fetcher with browser-like headers + retries.

const axios = require('axios');
const pRetry = require('p-retry').default;
const url = require('node:url');

const DEFAULT_TIMEOUT = Number(process.env.HTTP_DEADLINE_MS || 20000);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 2);

const CHROME_UAS = [
  // A few stable, recent Chrome desktop UAs (rotate to reduce fingerprinting)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

function buildHeaders(targetUrl) {
  const u = new URL(targetUrl);
  return {
    'User-Agent': CHROME_UAS[Math.floor(Math.random() * CHROME_UAS.length)],
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'document',
    'Upgrade-Insecure-Requests': '1',
    'Referer': `${u.protocol}//${u.hostname}/`,
    'Connection': 'keep-alive'
  };
}

function shouldRetry(err, attempt) {
  const status = err?.response?.status;
  if (!status) return true; // network/DNS/TLS
  // Retry on soft blocks / transient
  return [429, 403, 503, 520, 522, 523, 524].includes(status) && attempt <= MAX_RETRIES + 1;
}

async function fetchHtml(targetUrl) {
  const headers = buildHeaders(targetUrl);

  const task = async () => {
    const response = await axios({
      method: 'GET',
      url: targetUrl,
      headers,
      timeout: DEFAULT_TIMEOUT,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Don't throw on 4xx
      responseType: 'text',
      decompress: true
    });

    // Check for client errors
    if (response.status >= 400) {
      const error = new Error(`HTTP ${response.status}`);
      error.response = { statusCode: response.status };
      throw error;
    }

    // Basic sanity check: reject tiny bodies
    if (!response.data || response.data.length < 512) {
      const e = new Error('Empty/too-small body');
      e.response = { statusCode: response.status || 520 };
      throw e;
    }

    return { 
      status: response.status, 
      body: response.data, 
      finalUrl: response.request.res.responseUrl || targetUrl 
    };
  };

  return pRetry(task, {
    retries: MAX_RETRIES,
    minTimeout: 500,
    maxTimeout: 2000,
    factor: 2,
    randomize: true,
    onFailedAttempt: (e) => {
      // Useful debugging without leaking secrets
      console.warn(`[fetchHtml] ${targetUrl} attempt ${e.attemptNumber} failed: ${e.message}`);
    },
    retry: (e) => shouldRetry(e, e.attemptNumber)
  });
}

module.exports = { fetchHtml };