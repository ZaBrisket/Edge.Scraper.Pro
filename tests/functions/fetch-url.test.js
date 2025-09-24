/* @jest-environment node */

describe('fetch-url function guardrails', () => {
  const ORIGINAL_ENV = { ...process.env };
  const realFetch = global.fetch;
  let handler;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.BYPASS_AUTH = 'true';
    process.env.HTTP_DEADLINE_MS = '50';
    process.env.FETCH_URL_MAX_BYTES = String(1024);
    process.env.NETLIFY_CDN_MAX_AGE = '0';
    process.env.NETLIFY_CDN_SWR = '0';
    global.fetch = realFetch;
    // eslint-disable-next-line global-require
    const mod = require('../../netlify/functions/fetch-url.js');
    handler = mod.default || mod;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = realFetch;
  });

  function makeRequest(url) {
    const target = `http://localhost/.netlify/functions/fetch-url?url=${encodeURIComponent(url)}`;
    return new Request(target, {
      method: 'GET',
      headers: { 'X-API-Key': 'ignored' },
    });
  }

  test('400 on missing url', async () => {
    const req = new Request('http://localhost/.netlify/functions/fetch-url', { method: 'GET' });
    const res = await handler(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('MISSING_URL');
  });

  test('403 on blocked host (localhost)', async () => {
    const res = await handler(makeRequest('http://localhost:8080/'));
    expect(res.status).toBe(403);
    const payload = await res.json();
    expect(payload.error.code).toBe('BLOCKED_HOST');
  });

  test('413 when HEAD preflight shows over size', async () => {
    global.fetch = jest.fn((input, init = {}) => {
      if (init.method === 'HEAD') {
        return Promise.resolve(new Response(null, {
          status: 200,
          headers: { 'content-length': String(2 * 1024 * 1024) },
        }));
      }
      return Promise.resolve(new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }));
    });

    const res = await handler(makeRequest('https://example.com/too-big'));
    expect(res.status).toBe(413);
    const payload = await res.json();
    expect(payload.error.code).toBe('CONTENT_TOO_LARGE');
  });

  test('504 when GET exceeds deadline', async () => {
    global.fetch = jest.fn((input, init = {}) => {
      if (init.method === 'HEAD') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return new Promise((_, reject) => {
        const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        if (init.signal?.aborted) {
          abort();
        } else {
          init.signal?.addEventListener('abort', abort, { once: true });
        }
      });
    });

    const res = await handler(makeRequest('https://example.com/slow'));
    expect(res.status).toBe(504);
    const payload = await res.json();
    expect(payload.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  test('200 and proxied body on success, with caching & CORS headers', async () => {
    global.fetch = jest.fn((input, init = {}) => {
      if (init.method === 'HEAD') {
        return Promise.resolve(new Response(null, {
          status: 200,
          headers: { 'content-length': '11' },
        }));
      }
      return Promise.resolve(new Response('hello world', {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          etag: '"abc123"',
        },
      }));
    });

    const res = await handler(makeRequest('https://example.com/ok'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toContain('max-age=');
    const text = await res.text();
    expect(text).toBe('hello world');
  });
});
