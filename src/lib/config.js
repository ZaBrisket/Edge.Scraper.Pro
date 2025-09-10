const { z } = require('zod');

const schema = z.object({
  HTTP_DEADLINE_MS: z.coerce.number().int().positive().default(10000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  HTTP_RATE_LIMIT_PER_SEC: z.coerce.number().int().min(1).default(5),
  HTTP_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  HTTP_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(5),
  HTTP_CIRCUIT_BREAKER_RESET_MS: z.coerce.number().int().positive().default(30000),
  // PFR Batch Processing Timeouts
  PFR_VALIDATION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PFR_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  PFR_BATCH_DELAY_MS: z.coerce.number().int().min(0).default(1000),
  PFR_REPORT_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
});

const cfg = schema.parse(process.env);

module.exports = {
  DEFAULT_TIMEOUT_MS: cfg.HTTP_DEADLINE_MS,
  MAX_RETRIES: cfg.HTTP_MAX_RETRIES,
  RATE_LIMIT_PER_SEC: cfg.HTTP_RATE_LIMIT_PER_SEC,
  MAX_CONCURRENCY: cfg.HTTP_MAX_CONCURRENCY,
  CIRCUIT_BREAKER_THRESHOLD: cfg.HTTP_CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS: cfg.HTTP_CIRCUIT_BREAKER_RESET_MS,
  // PFR Batch Processing Configuration
  PFR_VALIDATION_TIMEOUT_MS: cfg.PFR_VALIDATION_TIMEOUT_MS,
  PFR_EXTRACTION_TIMEOUT_MS: cfg.PFR_EXTRACTION_TIMEOUT_MS,
  PFR_BATCH_DELAY_MS: cfg.PFR_BATCH_DELAY_MS,
  PFR_REPORT_INTERVAL_MS: cfg.PFR_REPORT_INTERVAL_MS,
};
