\
/**
 * Netlify Function: fetch-url
 * Securely fetches HTML for a given URL with basic SSRF protections,
 * lightweight robots.txt compliance, safe redirects, and modest limits.
 */
const dns = require('dns').promises;
const { URL } = require('url');
const net = require('net');

const UA = 'EdgeScraper/1.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)';
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2.5 * 1024 * 1024; // 2.5 MB
const TIMEOUT_MS = 15000;
const ALLOWED_PORTS = new Set([80, 443, null, undefined, '']); // default http/https

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  try {
    const urlParam = (event.queryStringParameters && event.queryStringParameters.url) || '';
    if (!urlParam) return json(400, { error: 'Missing ?url=' });

    const startUrl = new URL(urlParam);
    if (!['http:', 'https:'].includes(startUrl.protocol)) return json(400, { error: 'Only http/https are allowed' });

    // Disallow non-standard ports (basic SSRF mitigation)
    const port = startUrl.port ? Number(startUrl.port) : (startUrl.protocol === 'http:' ? 80 : 443);
    if (!ALLOWED_PORTS.has(port)) return json(400, { error: 'Non-standard ports are blocked' });

    // Resolve and block private IPs
    if (!(await isPublicHost(startUrl.hostname))) {
      return json(400, { error: 'Blocked by SSRF policy (private or local address)' });
    }

    // robots.txt (best-effort)
    const allowedByRobots = await robotsAllows(startUrl);
    if (!allowedByRobots) return json(403, { error: 'Blocked by robots.txt' });

    const { response, finalUrl } = await safeFetchWithRedirects(startUrl.href);
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (!(ct.includes('text/html') || ct.includes('application/xhtml'))) {
      // Allow text/plain as a fallback to still return html-like content
      if (!ct.includes('text/plain')) {
        return json(415, { error: `Unsupported content-type: ${ct || 'unknown'}` });
      }
    }

    // Size limits
    const lenHeader = response.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > MAX_BYTES) {
      return json(413, { error: `Content too large: ${lenHeader} bytes` });
    }

    const html = await readLimited(response, MAX_BYTES);
    if (!response.ok) {
      return json(response.status, { error: `Upstream responded ${response.status}`, html });
    }

    return json(200, { html, url: finalUrl });
  } catch (err) {
    return json(500, { error: err.message || 'Unknown error' });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }, body: JSON.stringify(obj) };
}

async function safeFetchWithRedirects(inputUrl) {
  let current = new URL(inputUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await timedFetch(current.href, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' } });
    // Follow 3xx redirects manually so we can re-validate hosts/ports each hop
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect without Location header`);
      const nextUrl = new URL(loc, current.href);
      // Block non-http(s) schemes and private IPs on redirect
      if (!['http:', 'https:'].includes(nextUrl.protocol)) throw new Error('Redirected to unsupported protocol');
      const port = nextUrl.port ? Number(nextUrl.port) : (nextUrl.protocol === 'http:' ? 80 : 443);
      if (!ALLOWED_PORTS.has(port)) throw new Error('Redirected to blocked port');
      if (!(await isPublicHost(nextUrl.hostname))) throw new Error('Redirected to private/local host');
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

async function timedFetch(url, opts) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function isPublicHost(hostname) {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') return false;
  if (lower.endsWith('.localhost') || lower.endsWith('.local')) return false;

  // If hostname is already an IP literal
  if (net.isIP(hostname)) {
    return !isPrivateIP(hostname);
  }

  try {
    const addrs = await dns.lookup(hostname, { all: true });
    if (!addrs || addrs.length === 0) return false;
    // If any resolved address is public, consider host public
    return addrs.some((a) => !isPrivateIP(a.address));
  } catch {
    // DNS failure, disallow
    return false;
  }
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

async function robotsAllows(theUrl) {
  try {
    const url = new URL(theUrl);
    const robotsUrl = new URL('/robots.txt', url.origin).href;
    const res = await timedFetch(robotsUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return true; // no robots or inaccessible: allow
    const text = await res.text();
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
