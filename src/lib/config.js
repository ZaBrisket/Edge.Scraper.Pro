const { z } = require('zod');

const schema = z.object({
  HTTP_DEADLINE_MS: z.coerce.number().int().positive().default(10000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  HTTP_RATE_LIMIT_PER_SEC: z.coerce.number().int().min(1).default(5),
  HTTP_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  HTTP_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(5),
  HTTP_CIRCUIT_BREAKER_RESET_MS: z.coerce.number().int().positive().default(30000),
  HTTP_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS: z.coerce.number().int().min(1).default(1),
  HTTP_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(60000),
  HTTP_RETRY_INITIAL_DELAY_MS: z.coerce.number().int().positive().default(1000),
  HTTP_USER_AGENT: z.string().default('edge-scraper/2.0'),
  
  // Per-host rate limits with safe PFR defaults
  HOST_LIMIT__www_pro_football_reference_com__RPS: z.coerce.number().default(0.5),
  HOST_LIMIT__www_pro_football_reference_com__BURST: z.coerce.number().int().default(2),
  HOST_LIMIT__DEFAULT__RPS: z.coerce.number().default(2),
  HOST_LIMIT__DEFAULT__BURST: z.coerce.number().int().default(5),
});

const cfg = schema.parse(process.env);

// Helper to get per-host config
function getHostLimits(hostname) {
  const hostKey = hostname.replace(/[\.-]/g, '_');
  const rpsKey = `HOST_LIMIT__${hostKey}__RPS`;
  const burstKey = `HOST_LIMIT__${hostKey}__BURST`;
  
  return {
    rps: cfg[rpsKey] || cfg.HOST_LIMIT__DEFAULT__RPS,
    burst: cfg[burstKey] || cfg.HOST_LIMIT__DEFAULT__BURST,
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS: cfg.HTTP_DEADLINE_MS,
  MAX_RETRIES: cfg.HTTP_MAX_RETRIES,
  RATE_LIMIT_PER_SEC: cfg.HTTP_RATE_LIMIT_PER_SEC,
  MAX_CONCURRENCY: cfg.HTTP_MAX_CONCURRENCY,
  CIRCUIT_BREAKER_THRESHOLD: cfg.HTTP_CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS: cfg.HTTP_CIRCUIT_BREAKER_RESET_MS,
  CIRCUIT_BREAKER_HALF_OPEN_REQUESTS: cfg.HTTP_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS,
  RETRY_MAX_DELAY_MS: cfg.HTTP_RETRY_MAX_DELAY_MS,
  RETRY_INITIAL_DELAY_MS: cfg.HTTP_RETRY_INITIAL_DELAY_MS,
  USER_AGENT: cfg.HTTP_USER_AGENT,
  getHostLimits,
};
