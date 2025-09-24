/* @jest-environment node */

const ORIGINAL_ENV = { ...process.env };
const realFetch = global.fetch;

const BASE_ENV = {
  BYPASS_AUTH: 'true',
  HTTP_DEADLINE_MS: '200',
  FETCH_URL_MAX_BYTES: String(1024 * 1024),
  NETLIFY_CDN_MAX_AGE: '0',
  NETLIFY_CDN_SWR: '0',
  FETCH_URL_MAX_REDIRECTS: '5',
  FETCH_URL_BLOCK_DOWNGRADE: 'false',
  FETCH_URL_DENYLIST: 'nip.io,sslip.io,localtest.me',
};

async function loadHandler(overrides = {}) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...BASE_ENV, ...overrides };
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

describe('fetch-url IPv4-mapped IPv6 guard', () => {
  test('rejects ::ffff:127.0.0.1 hostnames', async () => {
    const handler = await loadHandler();
    global.fetch = jest.fn(() => {
      throw new Error('fetch should not be called');
    });

    const res = await handler(makeRequest('http://[::ffff:127.0.0.1]/secret'));
    expect(res.status).toBe(403);
    const payload = await res.json();
    expect(payload.error.code).toBe('BLOCKED_HOST');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
