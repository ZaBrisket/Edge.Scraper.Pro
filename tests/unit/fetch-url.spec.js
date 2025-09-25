const { Response, Headers, Request } = global;

process.env.BYPASS_AUTH = 'true';
process.env.PUBLIC_API_KEY = '';
process.env.ALLOWED_ORIGINS = 'https://client.test';

jest.mock('../../netlify/functions/_lib/http.js', () => {
  process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'https://client.test';
  const actual = jest.requireActual('../../netlify/functions/_lib/http.js');
  return {
    ...actual,
    headersForEvent: jest.fn((event, extra = {}) => actual.headersForEvent(event, extra)),
    jsonForEvent: jest.fn((event, body, status = 200, extra = {}) => actual.jsonForEvent(event, body, status, extra)),
    fetchWithTimeout: jest.fn(),
    followRedirectsSafely: jest.fn(),
    readBodyWithLimit: jest.fn(),
    buildUA: jest.fn(() => 'EdgeScraperTest/1.0'),
    hash32: jest.fn(() => 'deadbeef'),
    isBlockedHostname: jest.fn(() => false),
  };
});

const httpLib = require('../../netlify/functions/_lib/http.js');

const handleRequest = require('../../netlify/functions/fetch-url.js');

beforeEach(() => {
  jest.clearAllMocks();
  httpLib.isBlockedHostname.mockReturnValue(false);
});

describe('fetch-url CORS hardening', () => {
  test('blocked host returns 403 with mirrored origin and expose headers', async () => {
    httpLib.isBlockedHostname.mockReturnValue(true);

    const request = new Request('https://example.com/.netlify/functions/fetch-url?url=https://blocked.test', {
      method: 'GET',
      headers: new Headers({ Origin: 'https://client.test' }),
    });

    const response = await handleRequest(request);
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://client.test');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Server-Timing, Content-Length, ETag');

    const payload = await response.json();
    expect(payload).toHaveProperty('error.code', 'BLOCKED_HOST');
  });

  test('successful fetch includes expose headers and mirrored origin', async () => {
    httpLib.fetchWithTimeout.mockResolvedValue(new Response(null, {
      status: 200,
      headers: new Headers({ 'content-length': '100' }),
    }));

    httpLib.followRedirectsSafely.mockResolvedValue({
      response: new Response('payload', {
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain', etag: '"abc"' }),
      }),
      finalUrl: new URL('https://example.org/resource'),
      redirects: [],
    });

    httpLib.readBodyWithLimit.mockResolvedValue({
      body: Buffer.from('payload'),
      bytesRead: 7,
    });

    const request = new Request('https://example.com/.netlify/functions/fetch-url?url=https://example.org/resource', {
      method: 'GET',
      headers: new Headers({ Origin: 'https://client.test' }),
    });

    const response = await handleRequest(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://client.test');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Server-Timing, Content-Length, ETag');
    expect(response.headers.get('Content-Length')).toBe('7');

    const body = await response.arrayBuffer();
    expect(Buffer.from(body).toString('utf8')).toBe('payload');
  });
});
