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

describe('fetch-url redirect handling', () => {
  test('follows allowed redirect chain and proxies final body', async () => {
    const handler = await loadHandler();
    const responses = [
      () => new Response(null, { status: 200, headers: { 'content-length': '12' } }),
      (input, init) => {
        expect(init.method).toBe('GET');
        expect(input).toBe('https://start.example.com/');
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://cdn.example.com/final' },
        });
      },
      (input, init) => {
        expect(init.method).toBe('GET');
        expect(input).toBe('https://cdn.example.com/final');
        return new Response('final payload', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      },
    ];
    global.fetch = jest.fn((input, init = {}) => {
      const producer = responses.shift();
      if (!producer) throw new Error('Unexpected fetch call');
      const result = producer(input, init);
      return result instanceof Promise ? result : Promise.resolve(result);
    });

    const res = await handler(makeRequest('https://start.example.com/'));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const timing = res.headers.get('Server-Timing');
    expect(timing).toContain('redirects;desc="1"');
    const text = await res.text();
    expect(text).toBe('final payload');
  });

  test('blocks redirect to localhost/loopback host', async () => {
    const handler = await loadHandler();
    const responses = [
      () => new Response(null, { status: 200 }),
      () => new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/internal' },
      }),
    ];
    global.fetch = jest.fn((input, init = {}) => {
      const producer = responses.shift();
      if (!producer) throw new Error('Unexpected fetch call');
      return Promise.resolve(producer(input, init));
    });

    const res = await handler(makeRequest('https://safe.example.com/'));
    expect(res.status).toBe(403);
    const payload = await res.json();
    expect(payload.error.code).toBe('BLOCKED_HOST_REDIRECT');
    const timing = res.headers.get('Server-Timing');
    expect(timing).toContain('t_head;dur');
    expect(timing).toContain('t_get;dur');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('fails when redirect response lacks Location header', async () => {
    const handler = await loadHandler();
    const responses = [
      () => new Response(null, { status: 200 }),
      () => new Response(null, { status: 302 }),
    ];
    global.fetch = jest.fn((input, init = {}) => {
      const producer = responses.shift();
      if (!producer) throw new Error('Unexpected fetch call');
      return Promise.resolve(producer(input, init));
    });

    const res = await handler(makeRequest('https://noloc.example.com/'));
    expect(res.status).toBe(502);
    const payload = await res.json();
    expect(payload.error.code).toBe('REDIRECT_NO_LOCATION');
    expect(res.headers.get('Server-Timing')).toContain('t_get;dur');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('honors max redirect cap and errors when exceeded', async () => {
    const handler = await loadHandler({ FETCH_URL_MAX_REDIRECTS: '1' });
    const responses = [
      () => new Response(null, { status: 200 }),
      () => new Response(null, { status: 302, headers: { Location: 'https://example.com/step2' } }),
      (input, init) => new Response(null, { status: 302, headers: { Location: 'https://example.com/step3' } }),
    ];
    global.fetch = jest.fn((input, init = {}) => {
      const producer = responses.shift();
      if (!producer) throw new Error('Unexpected fetch call');
      return Promise.resolve(producer(input, init));
    });

    const res = await handler(makeRequest('https://example.com/start'));
    expect(res.status).toBe(502);
    const payload = await res.json();
    expect(payload.error.code).toBe('TOO_MANY_REDIRECTS');
    const timing = res.headers.get('Server-Timing');
    expect(timing).toContain('redirects;desc="1"');
  });

  test('blocks HTTPS to HTTP downgrade when configured', async () => {
    const handler = await loadHandler({ FETCH_URL_BLOCK_DOWNGRADE: 'true' });
    const responses = [
      () => new Response(null, { status: 200 }),
      () => new Response(null, {
        status: 302,
        headers: { Location: 'http://downgrade.example.com/path' },
      }),
    ];
    global.fetch = jest.fn((input, init = {}) => {
      const producer = responses.shift();
      if (!producer) throw new Error('Unexpected fetch call');
      return Promise.resolve(producer(input, init));
    });

    const res = await handler(makeRequest('https://secure.example.com/'));
    expect(res.status).toBe(502);
    const payload = await res.json();
    expect(payload.error.code).toBe('DOWNGRADE_BLOCKED');
    expect(res.headers.get('Server-Timing')).toContain('t_get;dur');
  });

  test('supports relative redirect resolution', async () => {
    const handler = await loadHandler();
    const responses = [
      () => new Response(null, { status: 200, headers: { 'content-length': '5' } }),
      (input, init) => new Response(null, { status: 302, headers: { Location: '/next' } }),
      (input, init) => {
        expect(input).toBe('https://rel.example.com/next');
        return new Response('ok!!!', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      },
    ];
    global.fetch = jest.fn((input, init = {}) => {
      const producer = responses.shift();
      if (!producer) throw new Error('Unexpected fetch call');
      return Promise.resolve(producer(input, init));
    });

    const res = await handler(makeRequest('https://rel.example.com/'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('ok!!!');
    expect(res.headers.get('Server-Timing')).toContain('redirects;desc="1"');
  });
});
