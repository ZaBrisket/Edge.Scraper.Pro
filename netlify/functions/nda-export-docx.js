// Netlify Function: Apply selected edits as tracked changes and return .docx
const { exportTrackedChanges } = require('./_lib/docx-export-shim');
const { checkRateLimit } = require('./_lib/rate-limit');

exports.handler = async (event) => {
try {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const { correlationId, base64, edits, author, tz } = JSON.parse(event.body || '{}');
  const rate = checkRateLimit(event, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) {
    return json(429, { error: 'Too many export attempts. Please retry shortly.', correlationId }, { 'Retry-After': String(rate.retryAfter) });
  }
  if (!base64 || !Array.isArray(edits)) return json(400, { error: 'Missing base64 or edits', correlationId });
  const res = await exportTrackedChanges({ base64, edits, author, tz });
  return json(200, res);
} catch (e) {
  return json(500, { error: 'Export failed', detail: String(e && e.message || e) });
}
};

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

/**
* Lightweight shim to reuse logic inline without TypeScript build.
* Implements only the `exportTrackedChanges` used above.
*/
