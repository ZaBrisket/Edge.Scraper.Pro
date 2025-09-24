/* @jest-environment node */

const ORIGINAL_ENV = { ...process.env };
const realFetch = global.fetch;

async function loadHandler(overrides = {}) {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    BYPASS_AUTH: 'true',
    HTTP_DEADLINE_MS: '200',
    FETCH_URL_MAX_BYTES: String(1024 * 1024),
    NETLIFY_CDN_MAX_AGE: '0',
    NETLIFY_CDN_SWR: '0',
    FETCH_URL_MAX_REDIRECTS: '5',
    FETCH_URL_BLOCK_DOWNGRADE: 'false',
    FETCH_URL_DENYLIST: 'nip.io,sslip.io,localtest.me',
    ...overrides,
  };
  global.fetch = realFetch;
  // eslint-disable-next-line global-require
  const mod = require('../../netlify/functions/fetch-url.js');
  return mod.default || mod;
}

function makeRequest(url) {
  const target = `http://localhost/.netlify/functions/fetch-url?url=${encodeURIComponent(url)}`;
  return new Request(target, {
    method: 'GET',
    headers: { 'X-API-Key': 'ignored' },
  });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = realFetch;
});

describe('fetch-url hostname normalization', () => {
  test('blocks trailing-dot localhost', async () => {
    const handler = await loadHandler();
    global.fetch = jest.fn(() => {
      throw new Error('should not fetch for blocked host');
    });
    const response = await handler(makeRequest('http://localhost./secret'));
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error.code).toBe('BLOCKED_HOST');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('blocks IPv6 link-local with zone identifier', async () => {
    const handler = await loadHandler();
    global.fetch = jest.fn(() => {
      throw new Error('should not fetch for blocked host');
    });
    const response = await handler(makeRequest('http://[fe80::1%25eth0]/secret'));
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error.code).toBe('BLOCKED_HOST');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
