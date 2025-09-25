'use strict';

const { checkRateLimit } = require('./_lib/rate-limit');

let exportTrackedChanges;
try {
  ({ exportTrackedChanges } = require('../../build/nda/docx.js'));
} catch (err) {
  throw new Error(
    'nda-export-docx: missing compiled NDA docx bundle. Run "npm run build:nda-docx" (or the full build) before deploying.'
  );
}

exports.handler = async (event) => {
  const started = Date.now();
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }

    const { correlationId, base64, edits, author, tz } = JSON.parse(event.body || '{}');

    const rate = checkRateLimit(event, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) {
      return json(
        429,
        { error: 'Too many export attempts. Please retry shortly.', correlationId },
        { 'Retry-After': String(rate.retryAfter) }
      );
    }

    if (!base64 || !Array.isArray(edits)) {
      return json(400, { error: 'Missing base64 or edits', correlationId });
    }

    const result = await exportTrackedChanges({ base64, edits, author, tz, correlationId });
    const meta = {
      ms: Date.now() - started,
      sizeKB: Number((Buffer.from(result.base64, 'base64').length / 1024).toFixed(2)),
      edits: Array.isArray(edits) ? edits.length : 0,
      skipped: Array.isArray(result.skipped) ? result.skipped.length : 0,
    };

    console.info('nda-export-docx', { correlationId, ...meta });
    return json(200, { ...result, meta });
  } catch (err) {
    return json(500, { error: 'Export failed', detail: String((err && err.message) || err) });
  }
};

function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}
