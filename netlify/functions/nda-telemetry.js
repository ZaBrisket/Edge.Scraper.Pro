// Netlify Function: Anonymized telemetry (console-only)
const { checkRateLimit } = require('./_lib/rate-limit');

exports.handler = async (event) => {
try {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const { correlationId, event: name, payload } = JSON.parse(event.body || '{}');
  const rate = checkRateLimit(event, { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return json(429, { error: 'Too many telemetry events.', correlationId }, { 'Retry-After': String(rate.retryAfter) });
  }
  console.info(JSON.stringify({
    ts: new Date().toISOString(),
    kind: 'nda.telemetry',
    correlationId: String(correlationId || '').slice(0,24),
    event: name,
    payload: sanitize(payload)
  }));
  return json(200, { ok: true });
} catch (err) {
  console.warn('Telemetry function error', err);
  return json(200, { ok: false });
}
};
function sanitize(x) {
try {
  const s = JSON.stringify(x || {});
  if (s && s.length > 2048) return { note: 'truncated' };
  return JSON.parse(s);
} catch { return {}; }
}
function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      ...(extraHeaders || {})
    },
    body: JSON.stringify(body)
  };
}
