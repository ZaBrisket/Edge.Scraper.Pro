const ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function resolveOrigin(originHeader = '') {
  const origin = String(originHeader || '').trim();
  if (origin && ORIGINS.includes(origin)) {
    return origin;
  }
  return ORIGINS[0] || '*';
}

function headersForOrigin(originHeader = '', extra = {}) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(originHeader),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...extra,
  };
}

function headersForEvent(event = {}, extra = {}) {
  const origin = event?.headers?.origin || '';
  return headersForOrigin(origin, extra);
}

function preflight(event = {}, extra = {}) {
  const method = (event?.httpMethod || '').toUpperCase();
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: headersForEvent(event, extra),
      body: '',
    };
  }
  return null;
}

module.exports = {
  ORIGINS,
  resolveOrigin,
  headersForOrigin,
  headersForEvent,
  preflight,
};
