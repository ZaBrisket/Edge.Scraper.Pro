/**
 * Netlify Function: fetch-url
 * Securely fetches HTML for a given URL with basic SSRF protections,
 * lightweight robots.txt compliance, safe redirects, and modest limits.
 */
const dns = require('dns').promises;
const { URL } = require('url');
const net = require('net');
const { fetchWithPolicy } = require('../../src/lib/http/simple-enhanced-client');
const { getCorrelationId } = require('../../src/lib/http/correlation');
const { AuthService, Permission } = require('../../src/lib/auth');
const { ValidationUtils } = require('../../src/lib/validation');
const { corsHeaders } = require('../../src/lib/http/cors');
const { requireAuth } = require('../../src/lib/auth/token');
const { withCORS } = require('./_middleware');

// Cache for resolved hostnames
const hostCache = new Map();
const CACHE_TTL_MS = 5000;

const UA = 'EdgeScraper/1.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)';
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2.5 * 1024 * 1024; // 2.5 MB
// Use environment-driven timeout with fallback to 10 seconds
const TIMEOUT_MS = parseInt(process.env.HTTP_DEADLINE_MS || '10000', 10);
const ALLOWED_PORTS = new Set([80, 443, null, undefined, '']); // default http/https

// CORS headers are now generated dynamically based on origin

async function resolveHost(hostname, { forceRefresh = false } = {}) {
  const now = Date.now();
  const cached = hostCache.get(hostname);
  if (!forceRefresh && cached && now - cached.resolvedAt < CACHE_TTL_MS) {
    return cached.ip;
  }
  const { address: ip } = await dns.lookup(hostname);
  if (isPrivateIP(ip)) throw new Error('Resolved to private IP');
  hostCache.set(hostname, { ip, resolvedAt: now });
  return ip;
}
resolveHost.cache = hostCache;

const log = (...args) => console.log(new Date().toISOString(), ...args);

const handler = async (event, context) => {
  const correlationId = context.correlationId || getCorrelationId(event);
  const origin = event.headers && event.headers.origin;

  try {
    // Authentication check using new utility
    try {
      const payload = requireAuth(event.headers || {});
      if (payload.dev !== true) {
        if (!AuthService.hasPermission(payload.permissions, Permission.READ_SCRAPING)) {
          return json(403, { error: 'Insufficient permissions to scrape URLs' }, correlationId, origin);
        }
      }
    } catch (e) {
      throw { statusCode: 401, message: e.message || 'Unauthorized' };
    }
    const urlParam = (event.queryStringParameters && event.queryStringParameters.url) || '';
    if (!urlParam) throw { statusCode: 400, message: 'Missing ?url=' };

    // Validate URL for security
    const urlValidation = ValidationUtils.validateUrl(urlParam);
    if (!urlValidation.isValid) {
      throw { statusCode: 400, message: 'Invalid URL: ' + urlValidation.errors.join(', ') };
    }

    const startUrl = new URL(urlParam);
    if (!['http:', 'https:'].includes(startUrl.protocol)) throw { statusCode: 400, message: 'Only http/https are allowed' };

    // Disallow non-standard ports (basic SSRF mitigation)
    const port = startUrl.port ? Number(startUrl.port) : (startUrl.protocol === 'http:' ? 80 : 443);
    if (!ALLOWED_PORTS.has(port)) throw { statusCode: 400, message: 'Non-standard ports are blocked' };

    // Resolve and block private IPs using cache
    try {
      await resolveHost(startUrl.hostname);
    } catch {
      throw { statusCode: 400, message: 'Blocked by SSRF policy (private or local address)' };
    }

    // robots.txt (best-effort) - check for toggle parameter
    const params = event.body ? JSON.parse(event.body) : {};
    const respectRobots = params.respectRobots !== false; // default true
    
    if (respectRobots) {
      const allowedByRobots = await robotsAllows(startUrl, correlationId);
      if (!allowedByRobots) throw { statusCode: 403, message: 'Blocked by robots.txt' };
    } else {
      log(`[${correlationId}] WARNING: Bypassing robots.txt check as requested`);
    }

    const { response, finalUrl } = await safeFetchWithRedirects(startUrl.href, correlationId);
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (!(ct.includes('text/html') || ct.includes('application/xhtml'))) {
      // Allow text/plain as a fallback to still return html-like content
      if (!ct.includes('text/plain')) {
        throw { statusCode: 415, message: `Unsupported content-type: ${ct || 'unknown'}` };
      }
    }

    // Size limits
    const lenHeader = response.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > MAX_BYTES) {
      throw { statusCode: 413, message: `Content too large: ${lenHeader} bytes` };
    }

    const html = await readLimited(response, MAX_BYTES);
    log(`[${correlationId}] upstream [${response.status}] ${finalUrl}:`, html.substring(0, 200));
    if (!response.ok) {
      throw { statusCode: response.status, message: `Upstream responded ${response.status}`, html };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        html,
        url: finalUrl,
        correlationId
      })
    };
  } catch (err) {
    if (err.statusCode) {
      throw err;
    }
    const code = err.code || 'INTERNAL';
    const message = err.message || 'Unknown error';
    throw { statusCode: 500, message, code };
  }
};

exports.handler = withCORS(handler);


async function safeFetchWithRedirects(inputUrl, correlationId) {
  let current = new URL(inputUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const firstIP = await resolveHost(current.hostname);
    const secondIP = await resolveHost(current.hostname, { forceRefresh: true });
    if (firstIP !== secondIP) {
      // Block if new resolution is private/local
      if (isPrivateIP(secondIP)) {
        hostCache.delete(current.hostname);
        throw new Error('DNS rebinding detected');
      }
      // Allow public-to-public changes only for HTTPS to reduce SSRF risk
      if (current.protocol !== 'https:') {
        hostCache.delete(current.hostname);
        throw new Error('DNS rebinding detected');
      }
    }
    const res = await fetchResolved(current, firstIP, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' }, correlationId, timeout: TIMEOUT_MS });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect without Location header`);
      const nextUrl = new URL(loc, current.href);
      if (!['http:', 'https:'].includes(nextUrl.protocol)) throw new Error('Redirected to unsupported protocol');
      const port = nextUrl.port ? Number(nextUrl.port) : (nextUrl.protocol === 'http:' ? 80 : 443);
      if (!ALLOWED_PORTS.has(port)) throw new Error('Redirected to blocked port');
      current = nextUrl;
      continue;
    }
    return { response: res, finalUrl: current.href };
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

async function readLimited(response, maxBytes) {
  // If body is not a stream (e.g., in some environments), fall back to text()
  if (!response.body || !response.body.getReader) {
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) throw new Error('Response too large');
    chunks.push(value);
  }
  const merged = Buffer.concat(chunks.map((u) => Buffer.from(u)));
  return merged.toString('utf-8');
}

async function fetchResolved(urlObj, ip, opts) {
  // For HTTPS, use the hostname to preserve TLS SNI and certificate validation
  if (urlObj.protocol === 'https:') {
    return fetchWithPolicy(urlObj.toString(), { ...opts, headers: { ...(opts.headers || {}) }, correlationId: opts.correlationId });
  }
  // For HTTP, it's safe to use the resolved IP while preserving Host header
  const authority = ip + (urlObj.port ? `:${urlObj.port}` : '');
  const target = `${urlObj.protocol}//${authority}${urlObj.pathname}${urlObj.search}`;
  const headers = { ...opts.headers, Host: urlObj.hostname };
  return fetchWithPolicy(target, { ...opts, headers, correlationId: opts.correlationId });
}

function isPrivateIP(ip) {
  // IPv6
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower.startsWith('fc') || lower.startsWith('fd') || // Unique local
      lower.startsWith('fe80') // link-local
    );
  }
  // IPv4
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    const [a,b] = parts;
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8
    if (a === 169 && b === 254) return true;         // 169.254.0.0/16
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true;// 172.16.0.0/12
    if (a === 100 && (b >= 64 && b <= 127)) return true; // 100.64.0.0/10
  }
  return false;
}

// Export for testing
exports.isPrivateIP = isPrivateIP;
exports.robotsAllows = robotsAllows;
exports.checkRobots = checkRobots;
exports.resolveHost = resolveHost;
exports.safeFetchWithRedirects = safeFetchWithRedirects;

async function robotsAllows(theUrl, correlationId) {
  try {
    const url = new URL(theUrl);
    const robotsUrl = new URL('/robots.txt', url.origin).href;
    const res = await fetchWithPolicy(robotsUrl, { headers: { 'User-Agent': UA }, correlationId, timeout: TIMEOUT_MS });
    const text = await res.text();
    log(`[${correlationId}] robots [${res.status}] ${robotsUrl}:`, text.substring(0, 200));
    if (!res.ok) return true; // no robots or inaccessible: allow
    return checkRobots(text, url.pathname);
  } catch {
    return true;
  }
}

function checkRobots(robotsTxt, path) {
  const lines = robotsTxt.split(/[\r\n]+/).map((l) => l.trim());
  let currentUA = null;
  const rules = { '*': { allow: [], disallow: [] } };

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const [keyRaw, valueRaw] = line.split(':', 2);
    if (!keyRaw || typeof valueRaw === 'undefined') continue;
    const key = keyRaw.trim().toLowerCase();
    const value = valueRaw.trim();

    if (key === 'user-agent') {
      currentUA = value || '*';
      if (!rules[currentUA]) rules[currentUA] = { allow: [], disallow: [] };
    } else if (key === 'allow' || key === 'disallow') {
      const target = currentUA && rules[currentUA] ? rules[currentUA] : rules['*'];
      target[key].push(value);
    }
  }

  // Use * block (simple heuristic). Implement longest-match precedence between Allow/Disallow.
  const block = rules['*'];
  const allowMatch = longestMatch(block.allow, path);
  const disallowMatch = longestMatch(block.disallow, path);
  if (!disallowMatch && !allowMatch) return true;
  if (allowMatch && (!disallowMatch || allowMatch.length >= disallowMatch.length)) return true;
  return false;
}

function longestMatch(patterns, path) {
  let best = '';
  for (const p of patterns) {
    if (!p) continue;
    // Simple prefix match; ignores wildcards
    if (path.startsWith(p) && p.length > best.length) best = p;
  }
  return best;
}
