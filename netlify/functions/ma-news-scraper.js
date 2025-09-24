const { TextDecoder } = require('node:util');
const PQueue = require('p-queue').default;
const {
  corsHeaders,
  safeParseUrl,
  isBlockedHostname,
  followRedirectsSafely,
  envInt,
  buildUA,
  readBodyWithLimit,
} = require('./_lib/http.js');

const MANewsExtractor = require('../../src/lib/extractors/ma-news-extractor');
const MAUrlDiscovery = require('../../src/lib/discovery/ma-url-discovery');
const newsSources = require('../../src/config/ma-news-sources');

const extractor = new MANewsExtractor();
const discovery = new MAUrlDiscovery();
const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

const DEFAULT_TIMEOUT = envInt('HTTP_DEADLINE_MS', 18000, { min: 5000, max: 30000 });
const MAX_BYTES = envInt('MA_NEWS_MAX_BYTES', 1_500_000, { min: 100_000, max: 4_000_000 });
const DEFAULT_CONCURRENCY = 3;

function headersToObject(headers) {
  const obj = {};
  headers.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

function baseHeaders(extra = {}) {
  return corsHeaders({
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...extra,
  });
}

function jsonResponse(body, status = 200) {
  const headers = baseHeaders({ 'Content-Type': 'application/json; charset=utf-8' });
  return {
    statusCode: status,
    headers: headersToObject(headers),
    body: JSON.stringify(body),
  };
}

function normalizeSources(rawSources) {
  if (!Array.isArray(rawSources) || rawSources.length === 0) {
    return newsSources.getAllSources();
  }
  return rawSources
    .map((s) => String(s || '').toLowerCase().trim())
    .filter((token) => newsSources.getSource(token));
}

async function discoverUrls(options) {
  try {
    return await discovery.discover(options);
  } catch (err) {
    console.warn('M&A discovery failed', err);
    return [];
  }
}

async function fetchArticle(task) {
  let parsed;
  try {
    parsed = safeParseUrl(task.url);
  } catch (err) {
    const error = new Error('INVALID_URL');
    error.code = 'INVALID_URL';
    error.detail = err?.message;
    throw error;
  }

  if (isBlockedHostname(parsed.hostname)) {
    const error = new Error('BLOCKED_HOST');
    error.code = 'BLOCKED_HOST';
    error.detail = parsed.hostname;
    throw error;
  }

  const { response, finalUrl } = await followRedirectsSafely(parsed, {
    method: 'GET',
    headers: {
      'User-Agent': buildUA(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    timeout: DEFAULT_TIMEOUT,
  }, {
    maxRedirects: 4,
    blockDowngrade: true,
  });

  const { body, bytesRead } = await readBodyWithLimit(response.body, MAX_BYTES);
  const html = decoder.decode(body);
  return { html, status: response.status, finalUrl: finalUrl?.href || parsed.href, bytesRead };
}

async function scrapeTask(task) {
  try {
    const fetched = await fetchArticle(task);
    const data = extractor.extractFromHTML(fetched.html, fetched.finalUrl || task.url);
    return {
      success: true,
      url: task.url,
      finalUrl: fetched.finalUrl,
      source: task.source,
      discovered: Boolean(task.discovered),
      status: fetched.status,
      bytes: fetched.bytesRead,
      data,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      url: task.url,
      source: task.source,
      discovered: Boolean(task.discovered),
      error: err?.code || err?.message || 'SCRAPE_FAILED',
      detail: err?.detail || null,
      timestamp: new Date().toISOString(),
    };
  }
}

function normalizeConcurrency(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(6, Math.floor(value)));
}

function normalizeMaxUrls(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

exports.handler = async (event) => {
  const headers = headersToObject(baseHeaders());

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed. Use POST.' }, 405);
  }

  let payload = {};
  if (event.body) {
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
      payload = JSON.parse(raw || '{}');
    } catch (err) {
      return jsonResponse({ success: false, error: 'INVALID_JSON', detail: err?.message || null }, 400);
    }
  }

  const {
    urls = [],
    discover = false,
    sources = [],
    keywords = '',
    dateRange = {},
    concurrency = DEFAULT_CONCURRENCY,
    maxUrls = 50,
    useRSS = true,
    minConfidence = 0,
    mode = 'ma',
  } = payload;

  const normalizedSources = normalizeSources(sources);
  const limit = normalizeMaxUrls(maxUrls);
  const queue = new PQueue({ concurrency: normalizeConcurrency(concurrency) });

  const initialResults = [];
  const tasksMap = new Map();

  if (Array.isArray(urls)) {
    for (const rawUrl of urls) {
      const original = String(rawUrl || '').trim();
      if (!original) continue;
      try {
        const parsed = safeParseUrl(original);
        const sourceInfo = newsSources.getSourceByUrl(parsed.href);
        tasksMap.set(parsed.href, {
          url: parsed.href,
          source: sourceInfo?.key || 'custom',
          discovered: false,
        });
      } catch (err) {
        initialResults.push({
          success: false,
          url: original,
          source: 'custom',
          discovered: false,
          error: 'INVALID_URL',
          detail: err?.message || null,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  if (discover || tasksMap.size === 0) {
    const discovered = await discoverUrls({
      sources: normalizedSources,
      keywords,
      maxUrls: limit,
      useRSS: useRSS !== false,
      useSearch: Boolean(keywords),
      useSitemap: false,
    });
    for (const item of discovered) {
      const link = String(item.url || '').trim();
      if (!link) continue;
      if (!tasksMap.has(link)) {
        tasksMap.set(link, {
          url: link,
          source: item.source || (newsSources.getSourceByUrl(link)?.key || 'discovered'),
          discovered: true,
          title: item.title || null,
          date: item.date || item.publishedAt || null,
        });
      }
    }
  }

  const tasks = Array.from(tasksMap.values()).slice(0, limit);

  if (tasks.length === 0) {
    return jsonResponse({
      success: true,
      mode,
      stats: { total: initialResults.length, successful: 0, failed: initialResults.length, ma_detected: 0, deals_with_value: 0 },
      results: initialResults,
      timestamp: new Date().toISOString(),
    });
  }

  const queuedResults = await Promise.all(tasks.map((task) => queue.add(() => scrapeTask(task))));
  const combinedResults = [...initialResults, ...queuedResults];

  const successful = combinedResults.filter((item) => item.success);
  const detected = successful.filter((item) => (item.data?.confidence || 0) >= Number(minConfidence || 0));
  const dealsWithValue = successful.filter((item) => item.data?.dealValue);

  return jsonResponse({
    success: true,
    mode,
    stats: {
      total: combinedResults.length,
      successful: successful.length,
      failed: combinedResults.length - successful.length,
      ma_detected: detected.length,
      deals_with_value: dealsWithValue.length,
    },
    dateRange,
    minConfidence: Number(minConfidence || 0),
    results: combinedResults,
    timestamp: new Date().toISOString(),
  });
};
