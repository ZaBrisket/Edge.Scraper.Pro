const buckets = new Map();

function keyFromEvent(event) {
  const headerKey = Object.keys(event.headers || {}).find((h) => h.toLowerCase() === 'x-forwarded-for');
  if (headerKey) {
    const header = event.headers[headerKey];
    if (typeof header === 'string' && header.trim()) {
      return header.split(',')[0].trim();
    }
  }
  if (event.ip) return event.ip;
  return 'anon';
}

function checkRateLimit(event, options = {}) {
  const limit = typeof options.limit === 'number' ? options.limit : 60;
  const windowMs = typeof options.windowMs === 'number' ? options.windowMs : 60_000;
  const key = keyFromEvent(event);
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { count: 1, start: now });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    const retryAfterMs = bucket.start + windowMs - now;
    return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfter: 0 };
}

module.exports = { checkRateLimit };
