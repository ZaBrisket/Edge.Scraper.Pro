const path = require('node:path');

describe('nda-parse-docx CORS handling', () => {
  const ORIGINAL = process.env.ALLOWED_ORIGINS;

  afterAll(() => {
    if (typeof ORIGINAL === 'undefined') {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = ORIGINAL;
    }
  });

  function freshHandler() {
    jest.resetModules();
    process.env.ALLOWED_ORIGINS = 'https://edgescraperpro.com,https://*.netlify.app';
    const modulePath = path.join(__dirname, '..', '..', 'netlify', 'functions', 'nda-parse-docx.js');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(modulePath).handler;
  }

  test('GET request is rejected with wildcard-aware CORS header', async () => {
    const handler = freshHandler();
    const preview = 'https://deploy-preview-17--edgescraperpro.netlify.app';
    const response = await handler({
      httpMethod: 'GET',
      headers: { Origin: preview },
    });
    expect(response.statusCode).toBe(405);
    expect(response.headers['Access-Control-Allow-Origin']).toBe(preview);
    expect((response.headers.Vary || response.headers.vary || '')).toMatch(/Origin/);
  });

  test('OPTIONS preflight advertises cache lifetime and mirrors origin', async () => {
    const handler = freshHandler();
    const response = await handler({
      httpMethod: 'OPTIONS',
      headers: {
        origin: 'https://edgescraperpro.com',
        'access-control-request-method': 'POST',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['Access-Control-Allow-Origin']).toBe('https://edgescraperpro.com');
    expect(response.headers['Access-Control-Max-Age']).toBe('86400');
  });
});
