const { TextDecoder } = require('node:util');
const PQueue = require('p-queue').default;
const {
  safeParseUrl,
  isBlockedHostname,
  followRedirectsSafely,
  envInt,
  buildUA,
  readBodyWithLimit,
  jsonForEvent,
} = require('./_lib/http.js');
const MANewsExtractor = require('../../src/lib/extractors/ma-news-extractor');
const MAUrlDiscovery = require('../../src/lib/discovery/ma-url-discovery');
const newsSources = require('../../src/config/ma-news-sources');
const { preflight } = require('./_lib/cors');

const extractor = new MANewsExtractor();
const discovery = new MAUrlDiscovery();

const DEFAULT_TIMEOUT = envInt('HTTP_DEADLINE_MS', 18_000, { min: 5_000, max: 30_000 });
const MAX_BYTES = envInt('MA_NEWS_MAX_BYTES', 1_500_000, { min: 100_000, max: 4_000_000 });
const DEFAULT_CONCURRENCY = 3;
const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

function normalizeSources(rawSources) {
  const seen = new Set();
  const normalized = [];
  if (Array.isArray(rawSources)) {
    for (const token of rawSources) {
      const lower = String(token || '').trim().toLowerCase();
      if (!lower) continue;
      if (newsSources.getSource(lower)) {
        if (!seen.has(lower)) {
          seen.add(lower);
          normalized.push(lower);
        }
        continue;
      }
      for (const key of newsSources.getAllSources()) {
        const cfg = newsSources.getSource(key);
        if (cfg?.name && cfg.name.toLowerCase() === lower && !seen.has(key)) {
          seen.add(key);
          normalized.push(key);
          break;
        }
      }
    }
  }
  if (normalized.length === 0) {
    return newsSources.getAllSources();
  }
  return normalized;
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

function resolveSourceKey(url, hint) {
  const normalizedHint = String(hint || '').trim().toLowerCase();
  if (normalizedHint && newsSources.getSource(normalizedHint)) {
    return normalizedHint;
  }
  if (normalizedHint) {
    for (const key of newsSources.getAllSources()) {
      const cfg = newsSources.getSource(key);
      if (cfg?.name && cfg.name.toLowerCase() === normalizedHint) {
        return key;
      }
    }
  }
  if (url) {
    const sourceInfo = newsSources.getSourceByUrl(url);
    if (sourceInfo?.key) {
      return sourceInfo.key;
    }
  }
  return 'custom';
}

async function processTask(task) {
  const now = () => new Date().toISOString();
  const baseMeta = {
    url: task.url,
    source: task.source || 'custom',
    discovered: Boolean(task.discovered),
    title: task.title ?? null,
    date: task.date ?? null,
  };
  let parsed;
  try {
    parsed = safeParseUrl(task.url);
  } catch (err) {
    return {
      success: false,
      ...baseMeta,
      error: 'INVALID_URL',
      detail: err?.detail || null,
      timestamp: now(),
    };
  }

  if (isBlockedHostname(parsed.hostname)) {
    return {
      success: false,
      ...baseMeta,
      error: 'BLOCKED_HOST',
      detail: parsed.hostname,
      timestamp: now(),
    };
  }

  try {
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
    const finalHref = finalUrl?.href || parsed.href;
    const data = extractor.extractFromHTML(html, finalHref);

    return {
      success: true,
      ...baseMeta,
      finalUrl: finalHref,
      status: response.status,
      bytes: bytesRead,
      data,
      timestamp: now(),
    };
  } catch (err) {
    return {
      success: false,
      ...baseMeta,
      error: err?.code || err?.message || 'SCRAPE_FAILED',
      detail: err?.detail || err?.message || null,
      timestamp: now(),
    };
  }
}

exports.handler = async (event = {}) => {
  const baseHeaders = {};
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (event.httpMethod !== 'POST') {
    return jsonForEvent(event, { success: false, error: 'Method not allowed. Use POST.' }, 405, baseHeaders);
  }

  let payload = {};
  if (event.body) {
    try {
      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
      payload = JSON.parse(rawBody || '{}');
    } catch (err) {
      return jsonForEvent(event, { success: false, error: 'INVALID_JSON', detail: err?.message || null }, 400, baseHeaders);
    }
  }

  const {
    urls = [],
    discover = false,
    sources = [],
    keywords = '',
    dateRange = {},
    concurrency,
    maxUrls,
    useRSS,
    minConfidence = 0,
    mode = 'ma',
  } = payload || {};

  const normalizedSources = normalizeSources(sources);
  const limit = normalizeMaxUrls(maxUrls);
  const queue = new PQueue({ concurrency: normalizeConcurrency(concurrency) });

  const results = [];
  const tasks = [];
  const taskMap = new Map();

  function addTask(meta) {
    if (!meta?.url) return;
    if (taskMap.has(meta.url)) return;
    taskMap.set(meta.url, true);
    tasks.push(meta);
  }

  if (Array.isArray(urls)) {
    for (const rawUrl of urls) {
      const original = String(rawUrl || '').trim();
      if (!original) continue;
      try {
        const parsed = safeParseUrl(original);
        const href = parsed.href;
        const sourceKey = resolveSourceKey(href);
        addTask({ url: href, source: sourceKey, discovered: false });
      } catch (err) {
        results.push({
          success: false,
          url: original,
          source: 'custom',
          discovered: false,
          error: 'INVALID_URL',
          detail: err?.detail || err?.message || null,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  if (discover === true || tasks.length === 0) {
    try {
      const discovered = await discovery.discover({
        sources: normalizedSources,
        keywords: String(keywords || ''),
        maxUrls: limit,
        useRSS: useRSS !== false,
        useSearch: Boolean(keywords),
      });
      for (const item of discovered || []) {
        if (tasks.length >= limit) break;
        const rawUrl = String(item?.url || '').trim();
        if (!rawUrl) continue;
        try {
          const parsed = safeParseUrl(rawUrl);
          const href = parsed.href;
          const sourceKey = resolveSourceKey(href, item?.source);
          addTask({
            url: href,
            source: sourceKey,
            discovered: true,
            title: item?.title,
            date: item?.date,
          });
        } catch (err) {
          results.push({
            success: false,
            url: rawUrl,
            source: resolveSourceKey(rawUrl, item?.source),
            discovered: true,
            error: 'INVALID_URL',
            detail: err?.detail || err?.message || null,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      results.push({
        success: false,
        url: null,
        source: 'discovery',
        discovered: true,
        error: err?.code || err?.message || 'DISCOVERY_FAILED',
        detail: err?.detail || err?.message || null,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const queued = await Promise.all(tasks.map((task) => queue.add(() => processTask(task))));
  results.push(...queued);

  const minConfidenceNumber = Number(minConfidence) || 0;
  const successes = results.filter((r) => r && r.success);
  const failures = results.length - successes.length;
  const maDetected = successes.filter((r) => Number(r?.data?.confidence || 0) >= minConfidenceNumber).length;
  const dealsWithValue = successes.filter((r) => r?.data?.dealValue).length;

  return jsonForEvent(event, {
    success: true,
    mode,
    stats: {
      total: results.length,
      successful: successes.length,
      failed: failures,
      ma_detected: maDetected,
      deals_with_value: dealsWithValue,
    },
    dateRange: dateRange && typeof dateRange === 'object' ? dateRange : {},
    minConfidence: minConfidenceNumber,
    results,
    timestamp: new Date().toISOString(),
  }, 200, baseHeaders);
};
