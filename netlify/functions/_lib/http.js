const { TextEncoder } = require('node:util');
const net = require('node:net');

const TEXT_ENCODER = new TextEncoder();
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_DENYLIST = ['nip.io', 'sslip.io', 'localtest.me'];

function parseDenylist(envValue) {
  const raw = typeof envValue === 'string' && envValue.trim().length > 0
    ? envValue
    : DEFAULT_DENYLIST.join(',');
  return raw
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

const HOST_DENYLIST = parseDenylist(process.env.FETCH_URL_DENYLIST);

function isPrivateOrInternalIpv4(octets) {
  const [a, b] = octets;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true; // this-network
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  return false;
}

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
  let normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  normalized = normalized.replace(/^[\[]|[\]]$/g, '');
  if (!normalized) return true;

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === 'ip6-localhost') return true;
  if (normalized.endsWith('.local') || normalized.endsWith('.internal') || normalized.endsWith('.intranet')) {
    return true;
  }

  if (!normalized.includes('.') && !normalized.includes(':') && /^\d+$/.test(normalized)) {
    return true;
  }

  for (const suffix of HOST_DENYLIST) {
    if (!suffix) continue;
    if (normalized === suffix || normalized.endsWith(`.${suffix}`)) {
      return true;
    }
  }

  const ipType = net.isIP(normalized);
  if (ipType === 4) {
    const parts = normalized.split('.').map((n) => Number.parseInt(n, 10));
    if (isPrivateOrInternalIpv4(parts)) return true;
  } else if (ipType === 6) {
    const lower = normalized.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) {
      const mappedParts = mapped[1].split('.').map((n) => Number.parseInt(n, 10));
      if (isPrivateOrInternalIpv4(mappedParts)) return true;
    }
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = Number.parseInt(mappedHex[1], 16);
      const lo = Number.parseInt(mappedHex[2], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const mappedParts = [
          (hi >> 8) & 0xff,
          hi & 0xff,
          (lo >> 8) & 0xff,
          lo & 0xff,
        ];
        if (isPrivateOrInternalIpv4(mappedParts)) return true;
      }
    }
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

async function followRedirectsSafely(initialUrl, init = {}, options = {}) {
  const { timeout, ...restInit } = init;
  const maxRedirects = typeof options.maxRedirects === 'number' ? options.maxRedirects : 5;
  const blockDowngrade = Boolean(options.blockDowngrade);
  const blockCheck = typeof options.isBlockedHostname === 'function' ? options.isBlockedHostname : isBlockedHostname;
  const redirects = [];
  let currentUrl = initialUrl instanceof URL ? new URL(initialUrl.href) : new URL(initialUrl);
  let currentInit = { ...restInit };
  let hopCount = 0;
  const appliedTimeout = typeof timeout === 'number' ? timeout : undefined;

  while (true) {
    const response = await fetchWithTimeout(currentUrl.href, {
      ...currentInit,
      timeout: appliedTimeout,
      redirect: 'manual',
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl, redirects };
    }

    if (hopCount >= maxRedirects) {
      const error = new Error('TOO_MANY_REDIRECTS');
      error.code = 'TOO_MANY_REDIRECTS';
      error.redirects = redirects.slice();
      throw error;
    }

    const location = response.headers.get('location');
    if (!location) {
      const error = new Error('REDIRECT_NO_LOCATION');
      error.code = 'REDIRECT_NO_LOCATION';
      error.redirects = redirects.slice();
      throw error;
    }

    let resolved;
    try {
      resolved = new URL(location, currentUrl);
    } catch {
      const error = new Error('INVALID_URL');
      error.code = 'INVALID_URL';
      error.redirects = redirects.slice();
      throw error;
    }

    let parsed;
    try {
      parsed = safeParseUrl(resolved.href);
    } catch (err) {
      const error = new Error(err.message || 'INVALID_URL');
      error.code = err.message || 'INVALID_URL';
      error.redirects = redirects.slice();
      throw error;
    }

    if (blockDowngrade && currentUrl.protocol === 'https:' && parsed.protocol === 'http:') {
      const error = new Error('DOWNGRADE_BLOCKED');
      error.code = 'DOWNGRADE_BLOCKED';
      error.redirects = redirects.slice();
      error.location = parsed.href;
      throw error;
    }

    if (blockCheck && blockCheck(parsed.hostname)) {
      const error = new Error('BLOCKED_HOST_REDIRECT');
      error.code = 'BLOCKED_HOST_REDIRECT';
      error.redirects = redirects.slice();
      error.location = parsed.hostname;
      throw error;
    }

    redirects.push({ status: response.status, location, url: parsed.href });
    hopCount += 1;
    currentUrl = parsed;
  }
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
  followRedirectsSafely,
};
