// Netlify Function: Parse .docx → paragraphs with validation & clean errors.
const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');
const { checkRateLimit } = require('./_lib/rate-limit');
const { headersForEvent, preflight } = require('./_lib/cors');

const MAX_MB = Number(process.env.NDA_MAX_DOCX_MB || 5);
const MAX_BYTES = MAX_MB * 1024 * 1024;

exports.handler = async (event) => {
try {
  const baseHeaders = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) return preflightResponse;
  if (event.httpMethod !== 'POST') return json(event, 405, { error: 'Method Not Allowed' });
  const { correlationId, filename, mime, base64 } = JSON.parse(event.body || '{}');
  const ctx = { correlationId: safeId(correlationId), t: Date.now() };

  // Validate inputs
  if (!base64 || typeof base64 !== 'string') {
    return json(event, 400, { error: 'Invalid base64 data', correlationId: ctx.correlationId });
  }
  if (correlationId && correlationId.length > 24) {
    return json(event, 400, { error: 'Invalid correlation ID', correlationId: ctx.correlationId });
  }
  try {
    Buffer.from(base64, 'base64');
  } catch {
    return json(event, 400, { error: 'Malformed base64 encoding', correlationId: ctx.correlationId });
  }

  const rate = checkRateLimit(event, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return json(event, 429, { error: 'Too many requests. Please retry shortly.', correlationId: ctx.correlationId }, { 'Retry-After': String(rate.retryAfter) });
  }
  if (!filename || !base64) return json(event, 400, { error: 'Missing filename or base64', correlationId: ctx.correlationId });

  if (!/\.docx$/i.test(filename)) return json(event, 400, { error: 'Only .docx files are accepted', correlationId: ctx.correlationId });
  if (/\.docm$/i.test(filename)) return json(event, 400, { error: 'Macro-enabled files (.docm) are not allowed', correlationId: ctx.correlationId });

  const buf = Buffer.from(String(base64), 'base64');
  if (buf.byteLength > MAX_BYTES) return json(event, 413, { error: `File too large. Limit ${MAX_MB} MB.`, correlationId: ctx.correlationId });

  // Quick macro content type check in [Content_Types].xml
  const zip = await JSZip.loadAsync(buf);
  const ct = await safeText(zip, '[Content_Types].xml');
  if (ct && /vnd\.ms-word\.vbaProject/i.test(ct)) {
    return json(event, 400, { error: 'Macros detected and blocked', correlationId: ctx.correlationId });
  }

  // Pages count from docProps/app.xml
  let pages;
  const appXml = await safeText(zip, 'docProps/app.xml');
  if (appXml) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      const j = parser.parse(appXml);
      const p = j.Properties && j.Properties.Pages; // schema varies; best-effort
      if (typeof p === 'number') pages = p;
    } catch (_) {}
  }

  // Extract paragraph text from word/document.xml
  const docXml = await safeText(zip, 'word/document.xml');
  if (!docXml) return json(event, 400, { error: 'Invalid .docx: missing word/document.xml', correlationId: ctx.correlationId });
  const pTexts = [];
  const chunks = docXml.split(/<w:p\b/); chunks.shift();
  chunks.forEach(chunk => {
    const seg = "<w:p " + chunk;
    const ts = Array.from(seg.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => decodeXml(m[1]));
    const joined = ts.join('');
    const cleaned = joined.replace(/\s+/g, ' ').trim();
    if (cleaned) pTexts.push(cleaned);
  });

  return json(event, 200, { paragraphs: pTexts, meta: { pages }, notes: [], correlationId: ctx.correlationId });
} catch (e) {
  const body = JSON.parse(event.body || '{}');
  return json(event, 500, { error: 'Parser error', detail: String(e && e.message || e), correlationId: safeId(body.correlationId) });
}
};

function json(event, statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: headersForEvent(event, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      ...(extraHeaders || {})
    }),
    body: JSON.stringify(body)
  };
}
function safeId(id) { return String(id || '').slice(0, 24) || Math.random().toString(36).slice(2, 10).toUpperCase(); }
async function safeText(zip, path) { const f = zip.file(path); if (!f) return null; return f.async('text'); }
function decodeXml(s) { return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&"); }
