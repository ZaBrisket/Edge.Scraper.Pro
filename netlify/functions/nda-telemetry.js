// Netlify Function: Anonymized telemetry (console-only)
exports.handler = async (event) => {
try {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  const { correlationId, event: name, payload } = JSON.parse(event.body || '{}');
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    kind: 'nda.telemetry',
    correlationId: String(correlationId || '').slice(0,24),
    event: name,
    payload: sanitize(payload)
  }));
  return json(200, { ok: true });
} catch {
  return json(200, { ok: true });
}
};
function sanitize(x) {
try {
  const s = JSON.stringify(x || {});
  if (s && s.length > 2048) return { note: 'truncated' };
  return JSON.parse(s);
} catch { return {}; }
}
function json(statusCode, body) {
return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
