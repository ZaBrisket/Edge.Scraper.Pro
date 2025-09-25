const path = require('node:path');

describe('CORS helper utilities', () => {
  const ORIGINAL = process.env.ALLOWED_ORIGINS;

  afterAll(() => {
    if (typeof ORIGINAL === 'undefined') {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = ORIGINAL;
    }
  });

  function freshCors() {
    jest.resetModules();
    process.env.ALLOWED_ORIGINS = 'https://edgescraperpro.com,https://*.netlify.app';
    const modulePath = path.join(__dirname, '..', '..', 'netlify', 'functions', '_lib', 'cors.js');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(modulePath);
  }

  test('matches exact origins', () => {
    const { resolveOrigin } = freshCors();
    expect(resolveOrigin('https://edgescraperpro.com')).toBe('https://edgescraperpro.com');
  });

  test('matches wildcard subdomains', () => {
    const { resolveOrigin } = freshCors();
    const preview = 'https://deploy-preview-17--edgescraperpro.netlify.app';
    expect(resolveOrigin(preview)).toBe(preview);
  });

  test('headersForEvent normalizes Origin casing', () => {
    const { headersForEvent } = freshCors();
    const preview = 'https://deploy-preview-55--edgescraperpro.netlify.app';
    const headers = headersForEvent({ headers: { Origin: preview } });
    expect(headers['Access-Control-Allow-Origin']).toBe(preview);
  });

  test('headersForOrigin merges Vary headers with Origin', () => {
    const { headersForOrigin } = freshCors();
    const headers = headersForOrigin('https://edgescraperpro.com', { Vary: 'Accept-Encoding' });
    expect(headers.Vary.split(/,\s*/)).toEqual(expect.arrayContaining(['Accept-Encoding', 'Origin']));
  });

  test('allowed headers include Range for partial requests', () => {
    const { headersForOrigin } = freshCors();
    const headers = headersForOrigin('https://edgescraperpro.com');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization, X-API-Key, Range');
  });

  test('preflight adds Access-Control-Max-Age hint', () => {
    const { preflight } = freshCors();
    const response = preflight({
      httpMethod: 'OPTIONS',
      headers: { origin: 'https://edgescraperpro.com' },
    });
    expect(response).not.toBeNull();
    expect(response.statusCode).toBe(204);
    expect(response.headers['Access-Control-Allow-Origin']).toBe('https://edgescraperpro.com');
    expect(response.headers['Access-Control-Max-Age']).toBe('86400');
  });
});
