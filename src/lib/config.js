const { z } = require('zod');

const schema = z.object({
  HTTP_DEADLINE_MS: z.coerce.number().int().positive().default(10000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  HTTP_RATE_LIMIT_PER_SEC: z.coerce.number().min(0.1).default(5),
  HTTP_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  HTTP_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(5),
  HTTP_CIRCUIT_BREAKER_RESET_MS: z.coerce.number().int().positive().default(30000),
}).passthrough();

const rawEnv = process.env;
const cfg = schema.parse(rawEnv);

function parseHostLimitsFromEnv(env) {
  const defaults = {
    rps: Number(env.HOST_LIMIT__DEFAULT__RPS || env.HTTP_RATE_LIMIT_PER_SEC || 5),
    burst: Number(env.HOST_LIMIT__DEFAULT__BURST || 2),
    concurrency: Number(env.HOST_LIMIT__DEFAULT__CONCURRENCY || env.HTTP_MAX_CONCURRENCY || 2),
  };
  const map = new Map();
  for (const key of Object.keys(env)) {
    if (!key.startsWith('HOST_LIMIT__')) continue;
    const parts = key.split('__');
    // HOST_LIMIT__{host}__{KEY}
    if (parts.length !== 3) continue;
    const host = parts[1];
    const subkey = parts[2];
    if (!map.has(host)) map.set(host, { ...defaults });
    const entry = map.get(host);
    const value = Number(env[key]);
    if (Number.isNaN(value)) continue;
    if (subkey === 'RPS') entry.rps = value;
    if (subkey === 'BURST') entry.burst = value;
    if (subkey === 'CONCURRENCY') entry.concurrency = value;
  }
  return { defaults, map };
}

const hostLimits = parseHostLimitsFromEnv(rawEnv);

function getHostLimits(hostname) {
  if (hostLimits.map.has(hostname)) return hostLimits.map.get(hostname);
  return { ...hostLimits.defaults };
}

module.exports = {
  DEFAULT_TIMEOUT_MS: cfg.HTTP_DEADLINE_MS,
  MAX_RETRIES: cfg.HTTP_MAX_RETRIES,
  RATE_LIMIT_PER_SEC: cfg.HTTP_RATE_LIMIT_PER_SEC,
  MAX_CONCURRENCY: cfg.HTTP_MAX_CONCURRENCY,
  CIRCUIT_BREAKER_THRESHOLD: cfg.HTTP_CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS: cfg.HTTP_CIRCUIT_BREAKER_RESET_MS,
  getHostLimits,
};
