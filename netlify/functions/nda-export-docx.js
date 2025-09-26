'use strict';

const { checkRateLimit } = require('./_lib/rate-limit');
const { preflight } = require('./_lib/cors');
const { jsonForEvent } = require('./_lib/http');

let exportTrackedChanges;
try {
  ({ exportTrackedChanges } = require('../../build/nda/docx.js'));
} catch (error) {
  throw new Error('nda-export-docx: missing compiled NDA docx bundle. Run "npm run build" before deploying.');
}

exports.handler = async (event = {}) => {
  const securityHeaders = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const preflightResponse = preflight(event, securityHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  const method =
    typeof event.httpMethod === 'string' ? event.httpMethod.trim().toUpperCase() : null;

  if (method !== 'POST') {
    return respond(event, { error: 'Method Not Allowed' }, 405);
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return respond(event, { error: 'Invalid JSON payload', detail: error?.message || null }, 400);
  }

  const { correlationId, base64, edits, author, tz } = payload;

  const rate = checkRateLimit(event, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) {
    return respond(
      event,
      { error: 'Too many export attempts. Please retry shortly.', correlationId },
      429,
      { 'Retry-After': String(rate.retryAfter) },
    );
  }

  if (!base64 || !Array.isArray(edits)) {
    return respond(event, { error: 'Missing base64 or edits', correlationId }, 400);
  }

  try {
    const started = Date.now();
    const result = await exportTrackedChanges({ base64, edits, author, tz, correlationId });
    const meta = {
      ms: Date.now() - started,
      sizeKB: Number((Buffer.from(result.base64, 'base64').length / 1024).toFixed(2)),
      edits: edits.length,
      skipped: Array.isArray(result.skipped) ? result.skipped.length : 0,
    };

    console.info('nda-export-docx', { correlationId, ...meta });
    return respond(event, { ...result, meta }, 200);
  } catch (error) {
    return respond(event, { error: 'Export failed', detail: String(error?.message || error) }, 500);
  }
};

function respond(event, body, statusCode, extraHeaders = {}) {
  return jsonForEvent(event, body, statusCode, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
}
