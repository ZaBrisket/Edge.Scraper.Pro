const { z } = require('zod');

const schema = z.object({
  HTTP_DEADLINE_MS: z.coerce.number().int().positive().default(10000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  HTTP_RATE_LIMIT_PER_SEC: z.coerce.number().int().min(1).default(5),
  HTTP_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  HTTP_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(10),
  HTTP_CIRCUIT_BREAKER_RESET_MS: z.coerce.number().int().positive().default(60000),
  HTTP_CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: z.coerce.number().int().min(1).default(3),
  HTTP_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),
  HTTP_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(30000),
  HTTP_RETRY_JITTER_MAX_MS: z.coerce.number().int().min(0).default(1000),
  
  // Per-host rate limiting - defaults
  HOST_LIMIT__DEFAULT__RPS: z.coerce.number().min(0.1).default(2.0),
  HOST_LIMIT__DEFAULT__BURST: z.coerce.number().int().min(1).default(5),
  
  // Pro-Football-Reference specific limits (conservative)
  'HOST_LIMIT__www.pro-football-reference.com__RPS': z.coerce.number().min(0.1).default(0.8),
  'HOST_LIMIT__www.pro-football-reference.com__BURST': z.coerce.number().int().min(1).default(2),
});

// Parse environment, handling dynamic host limit keys
const envConfig = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('HOST_LIMIT__') && key.endsWith('__RPS')) {
    envConfig[key] = value;
  } else if (key.startsWith('HOST_LIMIT__') && key.endsWith('__BURST')) {
    envConfig[key] = value;
  } else if (key.startsWith('HTTP_')) {
    envConfig[key] = value;
  }
}

const cfg = schema.parse(envConfig);

// Extract host-specific limits
function getHostLimits() {
  const limits = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (key.startsWith('HOST_LIMIT__') && key.endsWith('__RPS')) {
      const host = key.replace('HOST_LIMIT__', '').replace('__RPS', '');
      if (!limits[host]) limits[host] = {};
      limits[host].rps = value;
    } else if (key.startsWith('HOST_LIMIT__') && key.endsWith('__BURST')) {
      const host = key.replace('HOST_LIMIT__', '').replace('__BURST', '');
      if (!limits[host]) limits[host] = {};
      limits[host].burst = value;
    }
  }
  return limits;
}

module.exports = {
  DEFAULT_TIMEOUT_MS: cfg.HTTP_DEADLINE_MS,
  MAX_RETRIES: cfg.HTTP_MAX_RETRIES,
  RATE_LIMIT_PER_SEC: cfg.HTTP_RATE_LIMIT_PER_SEC,
  MAX_CONCURRENCY: cfg.HTTP_MAX_CONCURRENCY,
  CIRCUIT_BREAKER_THRESHOLD: cfg.HTTP_CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS: cfg.HTTP_CIRCUIT_BREAKER_RESET_MS,
  CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: cfg.HTTP_CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS,
  RETRY_BASE_DELAY_MS: cfg.HTTP_RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS: cfg.HTTP_RETRY_MAX_DELAY_MS,
  RETRY_JITTER_MAX_MS: cfg.HTTP_RETRY_JITTER_MAX_MS,
  HOST_LIMITS: getHostLimits(),
};
