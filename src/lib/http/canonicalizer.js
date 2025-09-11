const { JSDOM } = require('jsdom');
const createLogger = require('./logging');
const { fetchWithPolicy } = require('./enhanced-client');
const { ValidationError } = require('./errors');

/**
 * Generate ordered URL variants to try for canonicalization
 * @param {string} inputUrl
 * @returns {string[]} variants in priority order
 */
function resolveUrlVariants(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw new ValidationError('resolveUrlVariants requires a URL string', { inputUrl });
  }
  const u = new URL(inputUrl);
  const variants = new Set();

  const hostNoWww = u.hostname.replace(/^www\./, '');
  const ensureTrailingSlash = (urlObj) => {
    if (!urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname + '/';
    }
    return urlObj;
  };

  // 1) Force HTTPS
  const https = new URL(u.href);
  https.protocol = 'https:';
  variants.add(https.href);

  // 2) https + www.
  const httpsWww = new URL(https.href);
  httpsWww.hostname = httpsWww.hostname.startsWith('www.') ? httpsWww.hostname : `www.${hostNoWww}`;
  variants.add(httpsWww.href);

  // 3) https + trailing slash
  const httpsSlash = new URL(https.href);
  variants.add(ensureTrailingSlash(httpsSlash).href);

  // 4) https + www + trailing slash
  const httpsWwwSlash = new URL(httpsWww.href);
  variants.add(ensureTrailingSlash(httpsWwwSlash).href);

  // Also include the original as last resort for completeness
  variants.add(u.href);

  return Array.from(variants);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Minimal robots.txt check. Returns true if blocked for User-agent: *
 * @param {URL} url
 */
async function isBlockedByRobots(url, correlationId) {
  try {
    const robotsUrl = new URL(url.origin + '/robots.txt');
    const res = await fetchWithPolicy(robotsUrl.href, { method: 'GET', correlationId });
    if (!res.ok) return false;
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    let applies = false;
    let disallows = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        const agent = trimmed.split(':')[1].trim();
        applies = agent === '*' ? true : false;
      } else if (applies && trimmed.toLowerCase().startsWith('disallow:')) {
        const rule = trimmed.split(':')[1].trim();
        disallows.push(rule);
      } else if (trimmed === '') {
        applies = false;
      }
    }
    const path = url.pathname;
    return disallows.some((rule) => rule !== '' && path.startsWith(rule));
  } catch {
    return false;
  }
}

/**
 * Attempt HEAD then GET for the provided URL. Records redirect chain and headers.
 */
async function headThenGet(url, options) {
  const { correlationId } = options || {};
  const headRes = await fetchWithPolicy(url, { method: 'HEAD', correlationId });
  const finalUrl = headRes.url || url;
  const headers = {
    'cache-control': headRes.headers.get('cache-control') || '',
    'server': headRes.headers.get('server') || ''
  };
  // Some servers may not support HEAD correctly; follow with GET for content or to verify status
  const getRes = await fetchWithPolicy(url, { method: 'GET', correlationId });
  return { head: headRes, get: getRes, finalUrl, headers, redirectChain: [url, finalUrl].filter((v, i, a) => a.indexOf(v) === i) };
}

/**
 * Fetch a URL with canonicalization fallback on 404s.
 * Tries variants with backoff 0.5s/1s/2s and stops on first 2xx/3xx.
 * Records structured info for logging.
 */
async function fetchWithCanonicalization(inputUrl, options = {}) {
  const logger = createLogger(options.correlationId);
  const start = Date.now();
  const variants = resolveUrlVariants(inputUrl);
  const attemptBackoffs = [500, 1000, 2000];
  let attemptIndex = 0;
  let lastError = null;

  for (const variant of variants) {
    const variantUrl = new URL(variant);

    // robots.txt guard
    if (await isBlockedByRobots(variantUrl, options.correlationId)) {
      const responseTimeMs = Date.now() - start;
      const error = new Error('Blocked by robots.txt');
      error.error_class = 'blocked_by_robots';
      return { ok: false, error, meta: { original_url: inputUrl, resolved_url: variant, attempts: attemptIndex + 1, redirect_chain: [], response_time_ms: responseTimeMs } };
    }

    try {
      const { head, get, finalUrl, headers, redirectChain } = await headThenGet(variant, options);
      const status = get.status;
      if (status >= 200 && status < 400) {
        const responseTimeMs = Date.now() - start;
        return {
          ok: true,
          response: get,
          meta: {
            status,
            original_url: inputUrl,
            resolved_url: finalUrl,
            redirect_chain: redirectChain,
            headers,
            response_time_ms: responseTimeMs
          }
        };
      }
      if (status === 404) {
        // Try next variant after backoff
        const backoff = attemptBackoffs[Math.min(attemptIndex, attemptBackoffs.length - 1)];
        attemptIndex++;
        logger.warn({ variant, status, backoff }, '404 encountered, trying next variant');
        await sleep(backoff);
        continue;
      }
      // For other statuses, return immediately
      const responseTimeMs = Date.now() - start;
      return { ok: false, response: get, meta: { status, original_url: inputUrl, resolved_url: finalUrl, redirect_chain: redirectChain, headers, response_time_ms: responseTimeMs } };
    } catch (err) {
      lastError = err;
      const backoff = attemptBackoffs[Math.min(attemptIndex, attemptBackoffs.length - 1)];
      attemptIndex++;
      logger.warn({ variant, error: err.message, backoff }, 'Error during variant attempt');
      await sleep(backoff);
      continue;
    }
  }

  // All variants failed
  const responseTimeMs = Date.now() - start;
  const error = lastError || new Error('All variants failed');
  error.error_class = 'http_404';
  return { ok: false, error, meta: { original_url: inputUrl, resolved_url: null, attempts: variants.length, redirect_chain: [], response_time_ms: responseTimeMs } };
}

module.exports = {
  resolveUrlVariants,
  fetchWithCanonicalization,
};

