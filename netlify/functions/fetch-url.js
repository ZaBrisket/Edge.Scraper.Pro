// netlify/functions/fetch-url.js
// CommonJS for Netlify Functions
const { request } = require('undici');
const setCookie = require('set-cookie-parser');
const { extractArticle } = require('../../src/article-extractor');

const MAX_TOTAL_MS = Math.min(
  parseInt(process.env.HTTP_DEADLINE_MS || '28000', 10),
  29000
);
const DEFAULT_TIMEOUT_MS = Math.min(12000, MAX_TOTAL_MS - 4000);
const REFERER = process.env.REQUEST_REFERER || 'https://news.google.com/';

const BROWSER_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

const BASE_HEADERS = () => ({
  'User-Agent': BROWSER_UAS[Math.floor(Math.random() * BROWSER_UAS.length)],
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Referer': REFERER,
  'Connection': 'keep-alive',
});

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Vary': 'Origin',
  };
}

function ok(body, origin, extra = {}) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    body: JSON.stringify({ ok: true, ...body, ...extra }),
  };
}

function err(statusCode, message, origin, extra = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    body: JSON.stringify({ ok: false, error: message, ...extra }),
  };
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) throw new Error('Invalid protocol');
    return url.toString();
  } catch {
    if (/^[-a-z0-9.]+\/.+/i.test(u)) return `https://${u}`;
    throw new Error('Invalid URL');
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label || 'timeout'} after ${ms}ms`)), ms)),
  ]);
}

async function fetchHttp(url, cookieJar = {}) {
  const headers = BASE_HEADERS();
  if (cookieJar.cookie) headers['Cookie'] = cookieJar.cookie;

  const { body, statusCode, headers: respHeaders } = await request(url, {
    method: 'GET',
    headers,
    maxRedirections: 5,
    bodyTimeout: DEFAULT_TIMEOUT_MS,
    headersTimeout: DEFAULT_TIMEOUT_MS,
  });

  const buf = await body.arrayBuffer();
  const text = Buffer.from(buf).toString('utf8');

  // Capture cookies correctly (map mode requires using keys as names)
  const sc = respHeaders['set-cookie'];
  if (sc) {
    const parsed = setCookie.parse(sc, { map: true });
    const cookie = Object.entries(parsed)
      .map(([name, c]) => `${name}=${c.value}`)
      .join('; ');
    if (cookie) cookieJar.cookie = cookie;
  }

  return { statusCode, headers: respHeaders, text, cookieJar };
}

function guessAmpUrls(url) {
  const u = new URL(url);
  const candidates = new Set();
  candidates.add(url + (u.search ? '&' : '?') + 'amp=1');
  candidates.add(url + (u.search ? '&' : '?') + 'output=amp');
  if (u.pathname.endsWith('.html') || u.pathname.endsWith('.htm')) {
    const ampPath = u.pathname.replace(/\.html?$/, '/amp/');
    candidates.add(`${u.origin}${ampPath}${u.search || ''}`);
  } else {
    candidates.add(`${u.origin}${u.pathname.replace(/\/?$/, '/amp/')}${u.search || ''}`);
  }
  return [...candidates];
}

async function tryAmp(url, cookieJar) {
  for (const candidate of guessAmpUrls(url)) {
    try {
      const r = await fetchHttp(candidate, cookieJar);
      const ct = r.headers['content-type'] || '';
      if (r.statusCode >= 200 && r.statusCode < 300 && /text\/html/i.test(ct)) {
        return { ...r, used: candidate };
      }
    } catch {/* ignore */}
  }
  return null;
}

async function tryVendor(url) {
  const zen = process.env.ZENROWS_API_KEY;
  if (zen) {
    const zenUrl = `https://api.zenrows.com/v1/?url=${encodeURIComponent(url)}&apikey=${zen}&js_render=true&premium_proxy=true`;
    const r = await withTimeout(fetchHttp(zenUrl), DEFAULT_TIMEOUT_MS, 'zenrows');
    if (r.statusCode >= 200 && r.statusCode < 300) return { ...r, used: 'zenrows' };
  }
  const bee = process.env.SCRAPINGBEE_API_KEY;
  if (bee) {
    const sbUrl = `https://app.scrapingbee.com/api/v1/?url=${encodeURIComponent(url)}&api_key=${bee}&render_js=false&premium_proxy=true`;
    const r = await withTimeout(fetchHttp(sbUrl), DEFAULT_TIMEOUT_MS, 'scrapingbee');
    if (r.statusCode >= 200 && r.statusCode < 300) return { ...r, used: 'scrapingbee' };
  }
  const bl = process.env.BROWSERLESS_URL; // e.g. https://chrome.browserless.io/content?token=...
  if (bl) {
    const blUrl = `${bl}${bl.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`;
    const r = await withTimeout(fetchHttp(blUrl), DEFAULT_TIMEOUT_MS, 'browserless');
    if (r.statusCode >= 200 && r.statusCode < 300) return { ...r, used: 'browserless' };
  }
  return null;
}

async function getPageWithStrategies(url) {
  const start = Date.now();
  const cookieJar = {};

  // 1) Direct fetch
  try {
    const r = await withTimeout(fetchHttp(url, cookieJar), DEFAULT_TIMEOUT_MS, 'direct');
    const ct = r.headers['content-type'] || '';
    if (r.statusCode >= 200 && r.statusCode < 300 && /text\/html/i.test(ct)) {
      return { strategy: 'direct', ...r, ms: Date.now() - start };
    }
    if ([403, 406, 429, 503].includes(r.statusCode)) {
      throw Object.assign(new Error('blocked'), { blockStatus: r.statusCode });
    }
  } catch {/* fall through */}

  // 2) AMP heuristic fallback
  try {
    const amp = await withTimeout(tryAmp(url, cookieJar), Math.min(8000, MAX_TOTAL_MS - (Date.now() - start)), 'amp');
    if (amp) return { strategy: `amp(${amp.used})`, ...amp, ms: Date.now() - start };
  } catch {/* ignore */}

  // 3) Vendor fallback (optional)
  try {
    const vend = await withTimeout(tryVendor(url), Math.min(10000, MAX_TOTAL_MS - (Date.now() - start)), 'vendor');
    if (vend) return { strategy: `vendor(${vend.used})`, ...vend, ms: Date.now() - start };
  } catch {/* ignore */}

  throw new Error('All strategies failed');
}

function shouldParseArticle(qs) {
  return (qs.get('parse') || 'article') === 'article';
}

function getOrigin(event) {
  return event.headers?.origin || event.headers?.Origin || '*';
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(getOrigin(event)) };
  }

  const origin = getOrigin(event);

  try {
    // Optional API key gate
    const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
    if (process.env.BYPASS_AUTH !== 'true') {
      if (!apiKey || apiKey !== process.env.PUBLIC_API_KEY) {
        return err(401, 'Unauthorized', origin);
      }
    }

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const rawUrl = qs.get('url');
    if (!rawUrl) return err(400, 'Missing url parameter', origin);

    let url;
    try {
      url = normalizeUrl(rawUrl);
    } catch {
      return err(400, 'Invalid URL format', origin);
    }

    const t0 = Date.now();
    let attempt = 0;
    let lastError = null;

    while (Date.now() - t0 < MAX_TOTAL_MS && attempt < 3) {
      attempt++;
      try {
        const res = await getPageWithStrategies(url);
        const finalUrl = url; // undici follows redirects; final URL not exposed
        const contentType = res.headers['content-type'] || 'text/html';

        let article = null;
        if (shouldParseArticle(qs)) {
          try {
            article = extractArticle(res.text, finalUrl);
          } catch { article = null; }
        }

        return ok({
          url: finalUrl,
          status: res.statusCode,
          contentType,
          strategy: res.strategy,
          ms: res.ms,
          article,
          html: qs.get('raw') === '1' ? res.text : undefined,
        }, origin);
      } catch (e) {
        lastError = e;
        await new Promise(r => setTimeout(r, 300 * attempt + Math.floor(Math.random() * 200)));
      }
    }

    return err(502, `Fetch failed: ${lastError?.message || 'unknown'}`, origin, { attempts: attempt });
  } catch (e) {
    return err(500, e.message || 'Internal error', origin);
  }
};