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
} = require('./_lib/http.js');

const DEFAULT_HTTP_DEADLINE_MS = envInt('HTTP_DEADLINE_MS', 15000, { min: 1000, max: 30000 });
const MAX_BYTES = envInt('FETCH_URL_MAX_BYTES', 2 * 1024 * 1024, { min: 64 * 1024, max: 16 * 1024 * 1024 });
const CDN_MAX_AGE = envInt('NETLIFY_CDN_MAX_AGE', 120, { min: 0, max: 86400 });
const CDN_SWR = envInt('NETLIFY_CDN_SWR', 600, { min: 0, max: 604800 });
const HEAD_TIMEOUT_MS = Math.min(5000, DEFAULT_HTTP_DEADLINE_MS);
const PUBLIC_API_KEY = (process.env.PUBLIC_API_KEY ?? '').trim();
const BYPASS_AUTH = envBool('BYPASS_AUTH', false);

const COMMON_HEADERS = {
  'User-Agent': buildUA(),
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

function errorJson(status, code, message, extra = {}) {
  return json(
    { error: { code, message }, ...extra },
    status,
    { 'Netlify-CDN-Cache-Control': 'private, max-age=0, no-store' },
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

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (!BYPASS_AUTH) {
    const incomingKey = (request.headers.get('x-api-key') || '').trim();
    if (!PUBLIC_API_KEY || incomingKey !== PUBLIC_API_KEY) {
      return errorJson(401, 'UNAUTHORIZED', 'Missing or invalid X-API-Key header');
    }
  }

  const requestUrl = new URL(request.url);
  const urlParam = requestUrl.searchParams.get('url');
  if (!urlParam) {
    return errorJson(400, 'MISSING_URL', 'Query param "url" is required');
  }

  let target;
  try {
    target = safeParseUrl(urlParam);
  } catch {
    return errorJson(400, 'INVALID_URL', 'URL must be absolute and begin with http(s)://');
  }

  if (isBlockedHostname(target.hostname)) {
    return errorJson(403, 'BLOCKED_HOST', `Hostname "${target.hostname}" is not allowed`);
  }

  const urlHash = hash32(target.href);

  try {
    const headStart = Date.now();
    const headResponse = await fetchWithTimeout(target.href, {
      method: 'HEAD',
      redirect: 'manual',
      timeout: HEAD_TIMEOUT_MS,
      headers: COMMON_HEADERS,
    });
    const headDuration = Date.now() - headStart;
    console.info(
      'metric=fetch_url_head outcome=success status=%d duration_ms=%d url_hash=%s',
      headResponse.status,
      headDuration,
      urlHash,
    );
    const clHeader = headResponse.headers.get('content-length');
    const contentLength = clHeader ? Number(clHeader) : NaN;
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      return errorJson(
        413,
        'CONTENT_TOO_LARGE',
        `Content-Length ${contentLength}B exceeds cap ${MAX_BYTES}B`,
        { url: target.href, contentLength, maxBytes: MAX_BYTES },
      );
    }
  } catch (error) {
    console.info(
      'metric=fetch_url_head outcome=error reason=%s url_hash=%s',
      error?.message || 'unknown',
      urlHash,
    );
  }

  let upstreamResponse;
  try {
    const getStart = Date.now();
    upstreamResponse = await fetchWithTimeout(target.href, {
      method: 'GET',
      redirect: 'follow',
      timeout: DEFAULT_HTTP_DEADLINE_MS,
      headers: COMMON_HEADERS,
    });
    const getDuration = Date.now() - getStart;
    console.info(
      'metric=fetch_url outcome=fetch status=%d duration_ms=%d url_hash=%s',
      upstreamResponse.status,
      getDuration,
      urlHash,
    );
  } catch (error) {
    const reason = (error?.message || '').toLowerCase();
    const timeout = error?.name === 'AbortError' || reason.includes('timeout');
    console.error(
      'metric=fetch_url outcome=fail kind=%s url_hash=%s message="%s"',
      timeout ? 'timeout' : 'network',
      urlHash,
      error?.message || 'unknown',
    );
    return errorJson(timeout ? 504 : 502, timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR', error?.message || 'Fetch failed');
  }

  const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';

  let bodyBuffer;
  let bytesRead = 0;
  try {
    const { body, bytesRead: read } = await readBodyWithLimit(upstreamResponse.body, MAX_BYTES);
    bodyBuffer = body;
    bytesRead = read;
  } catch (error) {
    if (error?.code === 'SIZE_LIMIT') {
      return errorJson(
        413,
        'CONTENT_TOO_LARGE',
        `Response exceeded ${MAX_BYTES}B limit`,
        { url: target.href, maxBytes: MAX_BYTES },
      );
    }
    console.error('metric=fetch_url outcome=fail kind=read_error url_hash=%s', urlHash);
    return errorJson(502, 'READ_ERROR', 'Failed to read upstream response');
  }

  const responseHeaders = corsHeaders({
    'Content-Type': contentType,
    'Content-Length': String(bodyBuffer.byteLength),
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Netlify-CDN-Cache-Control': `public, max-age=${CDN_MAX_AGE}, stale-while-revalidate=${CDN_SWR}`,
  });

  for (const key of ['etag', 'last-modified']) {
    const value = upstreamResponse.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }

  responseHeaders.delete('set-cookie');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  const status = upstreamResponse.status;
  const totalDuration = Date.now() - start;
  console.info(
    'metric=fetch_url outcome=success status=%d bytes=%d duration_ms=%d url_hash=%s',
    status,
    bytesRead,
    totalDuration,
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
