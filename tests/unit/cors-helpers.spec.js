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

  function freshCors(origins, options = {}) {
    jest.resetModules();
    if (options.unset === true) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      const value = typeof origins === 'string' && origins.trim().length > 0
        ? origins
        : 'https://edgescraperpro.com,https://*.netlify.app';
      process.env.ALLOWED_ORIGINS = value;
    }
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

  test('falls back to first configured origin when pattern misses', () => {
    const { resolveOrigin } = freshCors();
    expect(resolveOrigin('https://malicious.example')).toBe('https://edgescraperpro.com');
  });

  test('headersForEvent normalizes Origin casing', () => {
    const { headersForEvent } = freshCors();
    const preview = 'https://deploy-preview-55--edgescraperpro.netlify.app';
    const headers = headersForEvent({ headers: { Origin: preview } });
    expect(headers['Access-Control-Allow-Origin']).toBe(preview);
  });

  test('headersForEvent handles lowercase origin header', () => {
    const { headersForEvent } = freshCors();
    const preview = 'https://deploy-preview-88--edgescraperpro.netlify.app';
    const headers = headersForEvent({ headers: { origin: preview } });
    expect(headers['Access-Control-Allow-Origin']).toBe(preview);
  });

  test('headersForOrigin merges Vary headers with Origin', () => {
    const { headersForOrigin } = freshCors();
    const headers = headersForOrigin('https://edgescraperpro.com', { Vary: 'Accept-Encoding' });
    expect(headers.Vary.split(/,\s*/)).toEqual(expect.arrayContaining(['Accept-Encoding', 'Origin']));
  });

  test('normalizeVary deduplicates tokens and preserves order', () => {
    const { headersForOrigin } = freshCors();
    const headers = headersForOrigin('https://edgescraperpro.com', { Vary: 'Origin, Accept-Encoding, Origin' });
    expect(headers.Vary).toBe('Origin, Accept-Encoding');
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

  test('falls back to wildcard when ALLOWED_ORIGINS unset', () => {
    const { headersForOrigin } = freshCors(undefined, { unset: true });
    const headers = headersForOrigin('https://any-origin.example');
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
