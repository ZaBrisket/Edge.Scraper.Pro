const { TextEncoder } = require('node:util');
const net = require('node:net');

const TEXT_ENCODER = new TextEncoder();

/**
 * Parse boolean env with sensible defaults.
 * @param {string} name
 * @param {boolean} [fallback=false]
 * @returns {boolean}
 */
function envBool(name, fallback = false) {
  const raw = (process.env[name] ?? '').toString().trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

/**
 * Parse integer env var with optional bounds enforcement.
 * @param {string} name
 * @param {number} fallback
 * @param {{min?: number, max?: number}} [opts]
 * @returns {number}
 */
function envInt(name, fallback, opts = {}) {
  const { min, max } = opts;
  let value = Number.parseInt(process.env[name] ?? '', 10);
  if (Number.isNaN(value)) value = fallback;
  if (typeof min === 'number' && value < min) value = min;
  if (typeof max === 'number' && value > max) value = max;
  return value;
}

/**
 * Build permissive CORS headers.
 * @param {Record<string,string>} [extra]
 * @returns {Headers}
 */
function corsHeaders(extra = {}) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    ...extra,
  });
  return headers;
}

/**
 * JSON helper with CORS headers.
 * @param {unknown} body
 * @param {number} [status=200]
 * @param {Record<string,string>} [extraHeaders]
 * @returns {Response}
 */
function json(body, status = 200, extraHeaders = {}) {
  const headers = corsHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Validate URL is absolute http(s).
 * @param {string} raw
 * @returns {URL}
 * @throws {Error}
 */
function safeParseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_SCHEME');
  }
  return parsed;
}

/**
 * Determine whether a hostname should be blocked (basic SSRF guard).
 * @param {string} hostname
 * @returns {boolean}
 */
function isBlockedHostname(hostname) {
  if (!hostname) return true;
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === 'ip6-localhost') return true;
  if (normalized.endsWith('.local') || normalized.endsWith('.internal') || normalized.endsWith('.intranet')) {
    return true;
  }

  const ipType = net.isIP(normalized);
  if (ipType === 4) {
    const parts = normalized.split('.').map((n) => Number.parseInt(n, 10));
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local
    if (a === 0) return true; // this-network
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  } else if (ipType === 6) {
    const lower = normalized.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('2001:2') || lower.startsWith('2001:db8')) return true; // doc/test networks
  }

  return false;
}

/**
 * Abortable fetch with timeout (ms).
 * @param {string|URL} url
 * @param {RequestInit & {timeout?: number}} [opts]
 */
async function fetchWithTimeout(url, opts = {}) {
  const timeout = typeof opts.timeout === 'number' ? opts.timeout : 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('TIMEOUT')), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a web stream into a Uint8Array enforcing a byte cap.
 * @param {ReadableStream<Uint8Array>|null} stream
 * @param {number} maxBytes
 * @returns {Promise<{body: Uint8Array, bytesRead: number}>}
 */
async function readBodyWithLimit(stream, maxBytes) {
  if (!stream) {
    return { body: new Uint8Array(0), bytesRead: 0 };
  }
  const reader = stream.getReader();
  const chunks = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        try {
          await reader.cancel('SIZE_LIMIT');
        } catch {
          // ignore
        }
        const error = new Error('SIZE_LIMIT');
        error.code = 'SIZE_LIMIT';
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const body = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, bytesRead };
}

/**
 * Build a stable, respectful User-Agent string.
 * @returns {string}
 */
function buildUA() {
  const base = 'Mozilla/5.0 (compatible; EdgeScraperPro/2.0; +https://edgescraperpro.com)';
  const extra = (process.env.SCRAPER_UA_EXTRA ?? '').toString().trim();
  return extra ? `${base} ${extra}` : base;
}

/**
 * Lightweight FNV-1a 32-bit hash for logging (not cryptographic).
 * @param {string|Uint8Array} input
 * @returns {string}
 */
function hash32(input) {
  const bytes = typeof input === 'string' ? TEXT_ENCODER.encode(input) : input;
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16);
}

module.exports = {
  envBool,
  envInt,
  corsHeaders,
  json,
  safeParseUrl,
  isBlockedHostname,
  fetchWithTimeout,
  readBodyWithLimit,
  buildUA,
  hash32,
};
