const { TextEncoder } = require('node:util');

const mockSafeParseUrl = jest.fn();
const mockIsBlockedHostname = jest.fn();
const mockFollowRedirectsSafely = jest.fn();
const mockEnvInt = jest.fn();
const mockBuildUA = jest.fn();
const mockReadBodyWithLimit = jest.fn();
const mockDiscover = jest.fn();
const mockExtractFromHTML = jest.fn();
const mockGetSourceByUrl = jest.fn();

jest.mock('../../netlify/functions/_lib/http.js', () => {
  function createHeaders(origin = '*', extra = {}) {
    const base = {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, Range',
      Vary: 'Origin',
      ...extra,
    };
    return {
      ...base,
      forEach(callback) {
        Object.entries(base).forEach(([key, value]) => callback(value, key));
      },
    };
  }

  return {
    corsHeaders: jest.fn((extra = {}) => createHeaders('*', extra)),
    jsonForEvent: jest.fn((event, body, status = 200, extra = {}) => ({
      statusCode: status,
      headers: {
        ...createHeaders(event?.headers?.origin || event?.headers?.Origin || '*', extra),
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    })),
    safeParseUrl: mockSafeParseUrl,
    isBlockedHostname: mockIsBlockedHostname,
    followRedirectsSafely: mockFollowRedirectsSafely,
    envInt: mockEnvInt,
    buildUA: mockBuildUA,
    readBodyWithLimit: mockReadBodyWithLimit,
  };
});

jest.mock('../../src/lib/discovery/ma-url-discovery', () =>
  jest.fn().mockImplementation(() => ({ discover: mockDiscover })),
);

jest.mock('../../src/lib/extractors/ma-news-extractor', () =>
  jest.fn().mockImplementation(() => ({ extractFromHTML: mockExtractFromHTML })),
);

jest.mock('../../src/config/ma-news-sources', () => ({
  getAllSources: jest.fn(() => ['reuters', 'prnewswire']),
  getSource: jest.fn((key) => {
    if (key === 'reuters') return { key: 'reuters', name: 'Reuters' };
    if (key === 'prnewswire') return { key: 'prnewswire', name: 'PR Newswire' };
    return undefined;
  }),
  getSourceByUrl: mockGetSourceByUrl,
}));

jest.mock('p-queue', () => ({
  default: jest.fn().mockImplementation(() => ({
    add: (fn) => Promise.resolve().then(fn),
  })),
}));

// Require after mocks are set up
// eslint-disable-next-line global-require
const { handler } = require('../../netlify/functions/ma-news-scraper.js');

const encoder = new TextEncoder();

beforeEach(() => {
  jest.clearAllMocks();

  mockEnvInt.mockImplementation((name, fallback) => fallback);
  mockBuildUA.mockReturnValue('EdgeScraperPro-Test');
  mockSafeParseUrl.mockImplementation((raw) => {
    if (!raw || typeof raw !== 'string' || !/^https?:\/\//i.test(raw)) {
      throw new Error('INVALID_URL');
    }
    return new URL(raw);
  });
  mockIsBlockedHostname.mockReturnValue(false);
  mockFollowRedirectsSafely.mockImplementation(async (parsed) => {
    const url = parsed instanceof URL ? parsed : new URL(parsed);
    return {
      response: { status: 200, body: {} },
      finalUrl: url,
    };
  });
  const defaultBody = encoder.encode('<html><body>Test</body></html>');
  mockReadBodyWithLimit.mockResolvedValue({ body: defaultBody, bytesRead: defaultBody.byteLength });
  mockDiscover.mockResolvedValue([]);
  mockExtractFromHTML.mockReturnValue({ confidence: 60 });
  mockGetSourceByUrl.mockImplementation((url) => {
    if (url.includes('reuters')) return { key: 'reuters' };
    if (url.includes('prnewswire')) return { key: 'prnewswire' };
    return null;
  });
});

function parseBody(response) {
  expect(response).toBeDefined();
  const payload = JSON.parse(response.body);
  expect(payload).toHaveProperty('results');
  return payload;
}

describe('ma-news-scraper handler', () => {
  test('returns INVALID_URL for malformed input', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ urls: ['notaurl'] }),
    });

    expect(response.statusCode).toBe(200);
    const payload = parseBody(response);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toMatchObject({ success: false, error: 'INVALID_URL' });
    expect(mockDiscover).toHaveBeenCalledTimes(1);
  });

  test('blocks requests to private hosts', async () => {
    mockIsBlockedHostname.mockImplementation((hostname) => hostname === '127.0.0.1');

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ urls: ['https://127.0.0.1/internal'] }),
    });

    const payload = parseBody(response);
    const entry = payload.results.find((item) => item.url.includes('127.0.0.1'));
    expect(entry).toBeDefined();
    expect(entry.success).toBe(false);
    expect(entry.error).toBe('BLOCKED_HOST');
    expect(mockFollowRedirectsSafely).not.toHaveBeenCalled();
  });

  test('bubbles up byte-cap errors as SIZE_LIMIT', async () => {
    const sizeError = new Error('SIZE_LIMIT');
    sizeError.code = 'SIZE_LIMIT';
    mockReadBodyWithLimit.mockRejectedValueOnce(sizeError);

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ urls: ['https://example.com/large'] }),
    });

    const payload = parseBody(response);
    const entry = payload.results.find((item) => item.url === 'https://example.com/large');
    expect(entry).toBeDefined();
    expect(entry.success).toBe(false);
    expect(entry.error).toBe('SIZE_LIMIT');
    expect(entry.detail).toBe('SIZE_LIMIT');
  });

  test('runs discovery, dedupes URLs, and computes stats', async () => {
    mockDiscover.mockResolvedValue([
      { url: 'https://reuters.com/deal-a', source: 'reuters', title: 'Deal A', date: '2025-09-20' },
      { url: 'https://example.com/a', source: 'custom', title: 'Duplicate A', date: '2025-09-21' },
      { url: 'https://example.com/a', source: 'custom', title: 'Duplicate A Again', date: '2025-09-22' },
    ]);

    const extractionByUrl = new Map([
      ['https://example.com/a', { confidence: 82, dealValue: { display: '$100M' } }],
      ['https://reuters.com/deal-a', { confidence: 65 }],
    ]);
    mockExtractFromHTML.mockImplementation((html, finalUrl) => extractionByUrl.get(finalUrl) || { confidence: 10 });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        urls: ['https://example.com/a'],
        discover: true,
        minConfidence: 70,
      }),
    });

    const payload = parseBody(response);
    expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({
      sources: expect.arrayContaining(['reuters', 'prnewswire']),
      useRSS: true,
    }));

    expect(payload.results).toHaveLength(2);
    const manual = payload.results.find((item) => item.url === 'https://example.com/a');
    const discovered = payload.results.find((item) => item.url === 'https://reuters.com/deal-a');
    expect(manual).toBeDefined();
    expect(discovered).toBeDefined();
    expect(manual.discovered).toBe(false);
    expect(discovered.discovered).toBe(true);
    expect(discovered.source).toBe('reuters');

    expect(payload.stats).toMatchObject({
      total: 2,
      successful: 2,
      failed: 0,
      ma_detected: 1,
      deals_with_value: 1,
    });
    expect(payload.minConfidence).toBe(70);
  });
});
