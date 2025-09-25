'use strict';

const { checkRateLimit } = require('./_lib/rate-limit');
const { headersForEvent, preflight } = require('./_lib/cors');

let exportTrackedChanges;
try {
  ({ exportTrackedChanges } = require('../../build/nda/docx.js'));
} catch (err) {
  throw new Error(
    'nda-export-docx: missing compiled NDA docx bundle. Run "npm run build" before deploying.'
  );
}

exports.handler = async (event) => {
  const started = Date.now();
  try {
    const baseHeaders = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    const preflightResponse = preflight(event, baseHeaders);
    if (preflightResponse) return preflightResponse;
    if (event.httpMethod !== 'POST') return json(event, 405, { error: 'Method Not Allowed' });

    const { correlationId, base64, edits, author, tz } = JSON.parse(event.body || '{}');

    const rate = checkRateLimit(event, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return json(
        event,
        429,
        { error: 'Too many export attempts. Please retry shortly.', correlationId },
        { 'Retry-After': String(rate.retryAfter) }
      );
    }

    if (!base64 || !Array.isArray(edits)) {
      return json(event, 400, { error: 'Missing base64 or edits', correlationId });
    }

    const result = await exportTrackedChanges({ base64, edits, author, tz, correlationId });
    const meta = {
      ms: Date.now() - started,
      sizeKB: Number((Buffer.from(result.base64, 'base64').length / 1024).toFixed(2)),
      edits: edits.length,
      skipped: Array.isArray(result.skipped) ? result.skipped.length : 0,
    };

    console.info('nda-export-docx', { correlationId, ...meta });
    return json(event, 200, { ...result, meta });
  } catch (err) {
    return json(event, 500, { error: 'Export failed', detail: String((err && err.message) || err) });
  }
};

function json(event, statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: headersForEvent(event, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(extraHeaders || {}),
    }),
    body: JSON.stringify(body),
  };
}
