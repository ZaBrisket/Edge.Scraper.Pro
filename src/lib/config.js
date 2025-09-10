const { z } = require('zod');

const schema = z.object({
  HTTP_DEADLINE_MS: z.coerce.number().int().positive().default(10000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  HTTP_RATE_LIMIT_PER_SEC: z.coerce.number().int().min(1).default(5),
  HTTP_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  HTTP_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(5),
  HTTP_CIRCUIT_BREAKER_RESET_MS: z.coerce.number().int().positive().default(30000),
  HTTP_USER_AGENT: z.string().default('EdgeScraper/1.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)'),
});

const cfg = schema.parse(process.env);

function parseHostLimitsFromEnv(env) {
  // Patterns: HOST_LIMIT__{host}__RPS, HOST_LIMIT__{host}__BURST, HOST_LIMIT__{host}__CONCURRENCY
  // Defaults via HOST_LIMIT__DEFAULT__RPS/BURST/CONCURRENCY
  const map = new Map();
  const defaultCfg = {
    rps: coerceNumber(env.HOST_LIMIT__DEFAULT__RPS, cfg.HTTP_RATE_LIMIT_PER_SEC),
    burst: coerceNumber(env.HOST_LIMIT__DEFAULT__BURST, cfg.HTTP_RATE_LIMIT_PER_SEC),
    concurrency: coerceNumber(env.HOST_LIMIT__DEFAULT__CONCURRENCY, cfg.HTTP_MAX_CONCURRENCY),
  };
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('HOST_LIMIT__')) continue;
    const parts = key.split('__');
    // Expected: ['HOST_LIMIT', '{host}', '{FIELD}']
    if (parts.length !== 3) continue;
    const host = parts[1];
    const field = parts[2];
    if (!host) continue;
    if (!map.has(host)) map.set(host, { ...defaultCfg });
    const entry = map.get(host);
    if (field === 'RPS') entry.rps = coerceNumber(value, defaultCfg.rps);
    else if (field === 'BURST') entry.burst = coerceNumber(value, defaultCfg.burst);
    else if (field === 'CONCURRENCY') entry.concurrency = coerceNumber(value, defaultCfg.concurrency);
  }
  // Ensure DEFAULT present for easy lookup fallbacks
  map.set('DEFAULT', defaultCfg);
  return map;
}

function coerceNumber(v, def) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

const HOST_LIMITS = parseHostLimitsFromEnv(process.env);

function getHostLimit(host) {
  return HOST_LIMITS.get(host) || HOST_LIMITS.get('DEFAULT') || {
    rps: cfg.HTTP_RATE_LIMIT_PER_SEC,
    burst: cfg.HTTP_RATE_LIMIT_PER_SEC,
    concurrency: cfg.HTTP_MAX_CONCURRENCY,
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS: cfg.HTTP_DEADLINE_MS,
  MAX_RETRIES: cfg.HTTP_MAX_RETRIES,
  RATE_LIMIT_PER_SEC: cfg.HTTP_RATE_LIMIT_PER_SEC,
  MAX_CONCURRENCY: cfg.HTTP_MAX_CONCURRENCY,
  CIRCUIT_BREAKER_THRESHOLD: cfg.HTTP_CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS: cfg.HTTP_CIRCUIT_BREAKER_RESET_MS,
  USER_AGENT: cfg.HTTP_USER_AGENT,
  getHostLimit,
};
