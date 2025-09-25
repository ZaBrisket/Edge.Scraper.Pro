const ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ORIGIN_PATTERNS = ORIGINS.map(tokenToRegex);

function tokenToRegex(token) {
  if (!token || token === '*') {
    return /^.*$/i;
  }
  const escaped = token
    .split('*')
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function resolveOrigin(originHeader = '') {
  const origin = String(originHeader || '').trim();
  if (origin) {
    for (const pattern of ORIGIN_PATTERNS) {
      if (pattern.test(origin)) {
        return origin;
      }
    }
  }
  return ORIGINS[0] || '*';
}

function normalizeVary(value) {
  const set = new Set();
  const raw = Array.isArray(value) ? value : [value];
  for (const token of raw) {
    if (!token) continue;
    const pieces = String(token)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const piece of pieces) {
      if (piece) set.add(piece);
    }
  }
  if (set.size === 0) return undefined;
  return Array.from(set).join(', ');
}

function headersForOrigin(originHeader = '', extra = {}) {
  const extraHeaders = { ...(extra || {}) };
  const vary = normalizeVary([extraHeaders.Vary, extraHeaders.vary, 'Origin']);
  delete extraHeaders.Vary;
  delete extraHeaders.vary;

  const base = {
    'Access-Control-Allow-Origin': resolveOrigin(originHeader),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (vary) {
    base.Vary = vary;
  }

  return { ...base, ...extraHeaders };
}

function headersForEvent(event = {}, extra = {}) {
  const headers = event?.headers || {};
  const origin = headers.origin || headers.Origin || headers.ORIGIN || '';
  return headersForOrigin(origin, extra);
}

function preflight(event = {}, extra = {}) {
  const method = (event?.httpMethod || '').toUpperCase();
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: headersForEvent(event, { 'Access-Control-Max-Age': '86400', ...extra }),
      body: '',
    };
  }
  return null;
}

module.exports = {
  ORIGINS,
  ORIGIN_PATTERNS,
  resolveOrigin,
  headersForOrigin,
  headersForEvent,
  preflight,
};
