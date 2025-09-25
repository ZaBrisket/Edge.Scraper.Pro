const path = require('node:path');

jest.mock('../../netlify/functions/_lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
}));

const { checkRateLimit } = require('../../netlify/functions/_lib/rate-limit');

describe('nda-telemetry handler', () => {
  const modulePath = path.join(__dirname, '..', '..', 'netlify', 'functions', 'nda-telemetry.js');
  let handler;

  beforeAll(() => {
    process.env.ALLOWED_ORIGINS = 'https://client.test';
    // eslint-disable-next-line global-require, import/no-dynamic-require
    handler = require(modulePath).handler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 429 with Retry-After when rate limit is hit', async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false, retryAfter: 60 });

    const response = await handler({
      httpMethod: 'POST',
      headers: { origin: 'https://client.test' },
      body: JSON.stringify({ correlationId: 'abc', event: 'ping' }),
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['Retry-After']).toBe('60');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('https://client.test');
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  test('mirrors origin and returns ok when allowed', async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: true });
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    const response = await handler({
      httpMethod: 'POST',
      headers: { ORIGIN: 'https://client.test' },
      body: JSON.stringify({ correlationId: 'def', event: 'heartbeat', payload: { foo: 'bar' } }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['Access-Control-Allow-Origin']).toBe('https://client.test');
    expect(response.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(JSON.parse(response.body)).toEqual({ ok: true });

    infoSpy.mockRestore();
  });
});
