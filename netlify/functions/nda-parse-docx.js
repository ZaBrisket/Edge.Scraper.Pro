'use strict';

const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');
const { checkRateLimit } = require('./_lib/rate-limit');
const { preflight } = require('./_lib/cors');
const { jsonForEvent } = require('./_lib/http');

const MAX_MB = Number(process.env.NDA_MAX_DOCX_MB || 5);
const MAX_BYTES = MAX_MB * 1024 * 1024;

exports.handler = async (event = {}) => {
  const baseHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  };
  const preflightResponse = preflight(event, baseHeaders);
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

  const { correlationId, filename, base64 } = payload;
  const ctx = { correlationId: safeId(correlationId) };

  if (!base64 || typeof base64 !== 'string') {
    return respond(event, { error: 'Invalid base64 data', correlationId: ctx.correlationId }, 400);
  }

  if (correlationId && correlationId.length > 24) {
    return respond(event, { error: 'Invalid correlation ID', correlationId: ctx.correlationId }, 400);
  }

  try {
    Buffer.from(base64, 'base64');
  } catch {
    return respond(event, { error: 'Malformed base64 encoding', correlationId: ctx.correlationId }, 400);
  }

  const rate = checkRateLimit(event, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return respond(
      event,
      { error: 'Too many requests. Please retry shortly.', correlationId: ctx.correlationId },
      429,
      { 'Retry-After': String(rate.retryAfter) },
    );
  }

  if (!filename) {
    return respond(event, { error: 'Missing filename', correlationId: ctx.correlationId }, 400);
  }

  if (!/\.docx$/i.test(filename)) {
    return respond(event, { error: 'Only .docx files are accepted', correlationId: ctx.correlationId }, 400);
  }

  if (/\.docm$/i.test(filename)) {
    return respond(event, { error: 'Macro-enabled files (.docm) are not allowed', correlationId: ctx.correlationId }, 400);
  }

  try {
    const buffer = Buffer.from(String(base64), 'base64');
    if (buffer.byteLength > MAX_BYTES) {
      return respond(
        event,
        { error: `File too large. Limit ${MAX_MB} MB.`, correlationId: ctx.correlationId },
        413,
      );
    }

    const zip = await JSZip.loadAsync(buffer);

    const contentTypes = await safeText(zip, '[Content_Types].xml');
    if (contentTypes && /vnd\.ms-word\.vbaProject/i.test(contentTypes)) {
      return respond(event, { error: 'Macros detected and blocked', correlationId: ctx.correlationId }, 400);
    }

    const appXml = await safeText(zip, 'docProps/app.xml');
    let pages;
    if (appXml) {
      try {
        const parser = new XMLParser({ ignoreAttributes: false });
        const parsed = parser.parse(appXml);
        const maybePages = parsed?.Properties?.Pages;
        if (typeof maybePages === 'number') {
          pages = maybePages;
        }
      } catch {
        // ignore metadata parse failures
      }
    }

    const docXml = await safeText(zip, 'word/document.xml');
    if (!docXml) {
      return respond(
        event,
        { error: 'Invalid .docx: missing word/document.xml', correlationId: ctx.correlationId },
        400,
      );
    }

    const paragraphs = [];
    const chunks = docXml.split(/<w:p\b/i);
    chunks.shift();
    for (const chunk of chunks) {
      const segment = `<w:p ${chunk}`;
      const texts = Array.from(segment.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map((match) => decodeXml(match[1]));
      const joined = texts.join('');
      const cleaned = joined.replace(/\s+/g, ' ').trim();
      if (cleaned) {
        paragraphs.push(cleaned);
      }
    }

    return respond(
      event,
      {
        paragraphs,
        meta: { pages },
        notes: [],
        correlationId: ctx.correlationId,
      },
      200,
    );
  } catch (error) {
    const fallbackBody = safeJson(event.body);
    return respond(
      event,
      {
        error: 'Parser error',
        detail: String(error?.message || error),
        correlationId: safeId(fallbackBody?.correlationId),
      },
      500,
    );
  }
};

function respond(event, body, statusCode, extraHeaders = {}) {
  return jsonForEvent(event, body, statusCode, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    ...extraHeaders,
  });
}

function safeId(id) {
  const value = String(id || '').trim();
  if (!value) return Math.random().toString(36).slice(2, 10).toUpperCase();
  return value.slice(0, 24);
}

async function safeText(zip, path) {
  const file = zip.file(path);
  if (!file) return null;
  return file.async('text');
}

function decodeXml(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function safeJson(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}
