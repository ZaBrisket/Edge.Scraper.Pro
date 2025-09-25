'use strict';

const { checkRateLimit } = require('./_lib/rate-limit');
const { preflight } = require('./_lib/cors');
const { jsonForEvent } = require('./_lib/http');

exports.handler = async (event = {}) => {
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  };
  const preflightResponse = preflight(event, securityHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  if ((event.httpMethod || 'POST').toUpperCase() !== 'POST') {
    return respond(event, { error: 'Method Not Allowed' }, 405);
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return respond(event, { error: 'Invalid JSON payload', detail: error?.message || null }, 400);
  }

  const { correlationId, event: name, payload: bodyPayload } = payload;

  const rate = checkRateLimit(event, { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return respond(
      event,
      { error: 'Too many telemetry events.', correlationId: sanitizeId(correlationId) },
      429,
      { 'Retry-After': String(rate.retryAfter) },
    );
  }

  try {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        kind: 'nda.telemetry',
        correlationId: sanitizeId(correlationId),
        event: name,
        payload: sanitize(bodyPayload),
      }),
    );
    return respond(event, { ok: true });
  } catch (error) {
    console.warn('Telemetry function error', error);
    return respond(event, { ok: false, error: 'Telemetry logging failed' }, 500);
  }
};

function respond(event, body, statusCode = 200, extraHeaders = {}) {
  return jsonForEvent(event, body, statusCode, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    ...extraHeaders,
  });
}

function sanitize(value) {
  try {
    const serialized = JSON.stringify(value || {});
    if (serialized && serialized.length > 2048) {
      return { note: 'truncated' };
    }
    return JSON.parse(serialized);
  } catch {
    return {};
  }
}

function sanitizeId(id) {
  return String(id || '').slice(0, 24);
}
