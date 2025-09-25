const {
  envBool,
  envInt,
  corsHeaders,
  json,
  safeParseUrl,
  isBlockedHostname,
  fetchWithTimeout,
  readBodyWithLimit,
  buildUA,
  hash32,
  followRedirectsSafely,
} = require('./_lib/http.js');

const DEFAULT_HTTP_DEADLINE_MS = envInt('HTTP_DEADLINE_MS', 15000, { min: 1000, max: 30000 });
const MAX_BYTES = envInt('FETCH_URL_MAX_BYTES', 2 * 1024 * 1024, { min: 64 * 1024, max: 16 * 1024 * 1024 });
const CDN_MAX_AGE = envInt('NETLIFY_CDN_MAX_AGE', 120, { min: 0, max: 86400 });
const CDN_SWR = envInt('NETLIFY_CDN_SWR', 600, { min: 0, max: 604800 });
const HEAD_TIMEOUT_MS = Math.min(5000, DEFAULT_HTTP_DEADLINE_MS);
const MAX_REDIRECTS = envInt('FETCH_URL_MAX_REDIRECTS', 5, { min: 0, max: 10 });
const BLOCK_DOWNGRADE = envBool('FETCH_URL_BLOCK_DOWNGRADE', false);
const PUBLIC_API_KEY = (process.env.PUBLIC_API_KEY ?? '').trim();
const BYPASS_AUTH = envBool('BYPASS_AUTH', false);
const ACCESS_CONTROL_EXPOSE = 'Server-Timing, Content-Length, ETag';

const COMMON_HEADERS = {
  'User-Agent': buildUA(),
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

function buildServerTiming({ head, get, redirects }) {
  const parts = [];
  if (Number.isFinite(head)) {
    parts.push(`t_head;dur=${Math.max(0, Math.round(head))}`);
  }
  if (Number.isFinite(get)) {
    parts.push(`t_get;dur=${Math.max(0, Math.round(get))}`);
  }
  if (typeof redirects === 'number' && redirects > 0) {
    parts.push(`redirects;desc="${redirects}"`);
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function errorJson(status, code, message, extra = {}, headers = {}, originHeader = '') {
  return json(
    { error: { code, message }, ...extra },
    status,
    {
      'Netlify-CDN-Cache-Control': 'private, max-age=0, no-store',
      'Access-Control-Expose-Headers': ACCESS_CONTROL_EXPOSE,
      ...headers,
    },
    originHeader,
  );
}

function headersToObject(headers) {
  const obj = {};
  headers.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

function buildRequestFromEvent(event) {
  const headers = new Headers(event.headers || {});
  const scheme = headers.get('x-forwarded-proto') || 'https';
  const host = headers.get('host') || 'localhost';
  const rawPath = event.rawPath || event.path || '/.netlify/functions/fetch-url';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const url = event.rawUrl || `${scheme}://${host}${rawPath}${query}`;
  const init = { method: event.httpMethod || 'GET', headers };
  if (event.body) {
    const bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
    init.body = bodyBuffer;
  }
  return new Request(url, init);
}

async function handleRequest(request) {
  const start = Date.now();
  let headDuration;
  let getDuration;
  let redirectCount = 0;
  const origin = request.headers.get('origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders({}, origin) });
  }

  if (!BYPASS_AUTH) {
    const incomingKey = (request.headers.get('x-api-key') || '').trim();
    if (!PUBLIC_API_KEY || incomingKey !== PUBLIC_API_KEY) {
      return errorJson(401, 'UNAUTHORIZED', 'Missing or invalid X-API-Key header', {}, {}, origin);
    }
  }

  const requestUrl = new URL(request.url);
  const urlParam = requestUrl.searchParams.get('url');
  if (!urlParam) {
    return errorJson(400, 'MISSING_URL', 'Query param "url" is required', {}, {}, origin);
  }

  let target;
  try {
    target = safeParseUrl(urlParam);
  } catch {
    return errorJson(400, 'INVALID_URL', 'URL must be absolute and begin with http(s)://', {}, {}, origin);
  }

  if (isBlockedHostname(target.hostname)) {
    return errorJson(403, 'BLOCKED_HOST', `Hostname "${target.hostname}" is not allowed`, {}, {}, origin);
  }

  const urlHash = hash32(target.href);

  const headStart = Date.now();
  try {
    const headResponse = await fetchWithTimeout(target.href, {
      method: 'HEAD',
      redirect: 'manual',
      timeout: HEAD_TIMEOUT_MS,
      headers: COMMON_HEADERS,
    });
    headDuration = Date.now() - headStart;
    console.info(
      'metric=fetch_url_head outcome=success status=%d duration_ms=%d url_hash=%s',
      headResponse.status,
      headDuration,
      urlHash,
    );
    const clHeader = headResponse.headers.get('content-length');
    const contentLength = clHeader ? Number(clHeader) : NaN;
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      const serverTiming = buildServerTiming({ head: headDuration });
      return errorJson(
        413,
        'CONTENT_TOO_LARGE',
        `Content-Length ${contentLength}B exceeds cap ${MAX_BYTES}B`,
        { url: target.href, contentLength, maxBytes: MAX_BYTES },
        serverTiming ? { 'Server-Timing': serverTiming } : {},
        origin,
      );
    }
  } catch (error) {
    headDuration = Date.now() - headStart;
    console.info(
      'metric=fetch_url_head outcome=error reason=%s url_hash=%s',
      error?.message || 'unknown',
      urlHash,
    );
  }

  let upstreamResponse;
  let finalUrl = target;
  const getStart = Date.now();
  try {
    const result = await followRedirectsSafely(
      target,
      {
        method: 'GET',
        timeout: DEFAULT_HTTP_DEADLINE_MS,
        headers: COMMON_HEADERS,
      },
      {
        maxRedirects: MAX_REDIRECTS,
        blockDowngrade: BLOCK_DOWNGRADE,
        isBlockedHostname,
      },
    );
    upstreamResponse = result.response;
    finalUrl = result.finalUrl || target;
    redirectCount = Array.isArray(result.redirects) ? result.redirects.length : 0;
    getDuration = Date.now() - getStart;
    console.info(
      'metric=fetch_url outcome=fetch status=%d duration_ms=%d redirects=%d url_hash=%s',
      upstreamResponse.status,
      getDuration,
      redirectCount,
      urlHash,
    );
  } catch (error) {
    getDuration = Date.now() - getStart;
    if (Array.isArray(error?.redirects)) {
      redirectCount = error.redirects.length;
    }
    const serverTiming = buildServerTiming({ head: headDuration, get: getDuration, redirects: redirectCount });
    const headers = serverTiming ? { 'Server-Timing': serverTiming } : {};
    const reason = (error?.message || '').toLowerCase();
    const timeout = error?.name === 'AbortError' || reason.includes('timeout');

    if (error?.code === 'BLOCKED_HOST_REDIRECT') {
      console.error(
        'metric=fetch_url outcome=fail kind=blocked_redirect url_hash=%s location="%s"',
        urlHash,
        error?.location || 'unknown',
      );
      return errorJson(
        403,
        'BLOCKED_HOST_REDIRECT',
        'Redirect target host is not allowed',
        { location: error?.location },
        headers,
        origin,
      );
    }

    if (error?.code === 'REDIRECT_NO_LOCATION') {
      console.error('metric=fetch_url outcome=fail kind=redirect_no_location url_hash=%s', urlHash);
      return errorJson(502, 'REDIRECT_NO_LOCATION', 'Redirect response missing Location header', {}, headers, origin);
    }

    if (error?.code === 'TOO_MANY_REDIRECTS') {
      console.error(
        'metric=fetch_url outcome=fail kind=too_many_redirects redirects=%d url_hash=%s',
        redirectCount,
        urlHash,
      );
      return errorJson(502, 'TOO_MANY_REDIRECTS', 'Exceeded redirect limit', {}, headers, origin);
    }

    if (error?.code === 'DOWNGRADE_BLOCKED') {
      console.error('metric=fetch_url outcome=fail kind=downgrade_blocked url_hash=%s', urlHash);
      return errorJson(502, 'DOWNGRADE_BLOCKED', 'HTTPS to HTTP redirect blocked', { location: error?.location }, headers, origin);
    }

    if (error?.code === 'INVALID_SCHEME' || error?.code === 'INVALID_URL') {
      console.error('metric=fetch_url outcome=fail kind=redirect_invalid url_hash=%s', urlHash);
      return errorJson(502, error.code, 'Redirect target URL is invalid', {}, headers, origin);
    }

    console.error(
      'metric=fetch_url outcome=fail kind=%s url_hash=%s message="%s"',
      timeout ? 'timeout' : 'network',
      urlHash,
      error?.message || 'unknown',
    );
    return errorJson(timeout ? 504 : 502, timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR', error?.message || 'Fetch failed', {}, headers, origin);
  }

  const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';

  let bodyBuffer;
  let bytesRead = 0;
  try {
    const { body, bytesRead: read } = await readBodyWithLimit(upstreamResponse.body, MAX_BYTES);
    bodyBuffer = body;
    bytesRead = read;
  } catch (error) {
    const serverTiming = buildServerTiming({ head: headDuration, get: getDuration, redirects: redirectCount });
    const headers = serverTiming ? { 'Server-Timing': serverTiming } : {};
    if (error?.code === 'SIZE_LIMIT') {
      return errorJson(
        413,
        'CONTENT_TOO_LARGE',
        `Response exceeded ${MAX_BYTES}B limit`,
        { url: finalUrl.href || finalUrl.toString(), maxBytes: MAX_BYTES },
        headers,
        origin,
      );
    }
    console.error('metric=fetch_url outcome=fail kind=read_error url_hash=%s', urlHash);
    return errorJson(502, 'READ_ERROR', 'Failed to read upstream response', {}, headers, origin);
  }

  const responseHeaders = corsHeaders({
    'Content-Type': contentType,
    'Content-Length': String(bodyBuffer.byteLength),
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Netlify-CDN-Cache-Control': `public, max-age=${CDN_MAX_AGE}, stale-while-revalidate=${CDN_SWR}`,
    'Access-Control-Expose-Headers': ACCESS_CONTROL_EXPOSE,
  }, origin);

  for (const key of ['etag', 'last-modified']) {
    const value = upstreamResponse.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }

  responseHeaders.delete('set-cookie');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  const serverTiming = buildServerTiming({ head: headDuration, get: getDuration, redirects: redirectCount });
  if (serverTiming) {
    responseHeaders.set('Server-Timing', serverTiming);
  }

  const status = upstreamResponse.status;
  const totalDuration = Date.now() - start;
  console.info(
    'metric=fetch_url outcome=success status=%d bytes=%d duration_ms=%d redirects=%d url_hash=%s',
    status,
    bytesRead,
    totalDuration,
    redirectCount,
    urlHash,
  );

  return new Response(bodyBuffer, { status, headers: responseHeaders });
}

async function netlifyHandler(event, context) {
  const request = buildRequestFromEvent(event);
  const response = await handleRequest(request, context);
  const headersObj = headersToObject(response.headers);
  const arrayBuffer = await response.arrayBuffer();
  const bodyBuffer = Buffer.from(arrayBuffer);
  return {
    statusCode: response.status,
    headers: headersObj,
    body: bodyBuffer.toString('base64'),
    isBase64Encoded: true,
  };
}

handleRequest.handler = netlifyHandler;
handleRequest.default = handleRequest;
handleRequest.isBlockedHostname = isBlockedHostname;
handleRequest.hash32 = hash32;

module.exports = handleRequest;
