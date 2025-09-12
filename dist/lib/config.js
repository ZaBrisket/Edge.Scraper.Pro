"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const schema = zod_1.z.object({
    HTTP_DEADLINE_MS: zod_1.z.coerce.number().int().positive().default(10000),
    HTTP_MAX_RETRIES: zod_1.z.coerce.number().int().min(0).default(3),
    HTTP_RATE_LIMIT_PER_SEC: zod_1.z.coerce.number().int().min(1).default(5),
    HTTP_MAX_CONCURRENCY: zod_1.z.coerce.number().int().min(1).default(2),
    HTTP_CIRCUIT_BREAKER_THRESHOLD: zod_1.z.coerce.number().int().min(1).default(5),
    HTTP_CIRCUIT_BREAKER_RESET_MS: zod_1.z.coerce.number().int().positive().default(30000),
    // Per-host rate limiting
    HOST_LIMIT__DEFAULT__RPS: zod_1.z.coerce.number().positive().default(1.0),
    HOST_LIMIT__DEFAULT__BURST: zod_1.z.coerce.number().int().min(1).default(2),
    HOST_LIMIT__www_pro_football_reference_com__RPS: zod_1.z.coerce.number().positive().default(0.5),
    HOST_LIMIT__www_pro_football_reference_com__BURST: zod_1.z.coerce.number().int().min(1).default(1),
    // Retry configuration
    HTTP_RETRY_BUDGET_PER_BATCH: zod_1.z.coerce.number().int().min(1).default(10),
    HTTP_BASE_BACKOFF_MS: zod_1.z.coerce.number().int().positive().default(1000),
    HTTP_MAX_BACKOFF_MS: zod_1.z.coerce.number().int().positive().default(30000),
    HTTP_JITTER_FACTOR: zod_1.z.coerce.number().min(0).max(1).default(0.1),
    // Circuit breaker half-open
    HTTP_CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: zod_1.z.coerce.number().int().min(1).default(3),
    // Timeouts
    HTTP_CONNECT_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(5000),
    HTTP_READ_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(10000),
    // Inter-request delay
    HTTP_INTER_REQUEST_DELAY_MS: zod_1.z.coerce.number().int().min(0).default(100),
});
const cfg = schema.parse(process.env);
const config = {
    DEFAULT_TIMEOUT_MS: cfg.HTTP_DEADLINE_MS,
    MAX_RETRIES: cfg.HTTP_MAX_RETRIES,
    RATE_LIMIT_PER_SEC: cfg.HTTP_RATE_LIMIT_PER_SEC,
    MAX_CONCURRENCY: cfg.HTTP_MAX_CONCURRENCY,
    CIRCUIT_BREAKER_THRESHOLD: cfg.HTTP_CIRCUIT_BREAKER_THRESHOLD,
    CIRCUIT_BREAKER_RESET_MS: cfg.HTTP_CIRCUIT_BREAKER_RESET_MS,
    // Per-host rate limiting
    HOST_LIMITS: {
        'www.pro-football-reference.com': {
            rps: cfg.HOST_LIMIT__www_pro_football_reference_com__RPS,
            burst: cfg.HOST_LIMIT__www_pro_football_reference_com__BURST,
        },
        default: {
            rps: cfg.HOST_LIMIT__DEFAULT__RPS,
            burst: cfg.HOST_LIMIT__DEFAULT__BURST,
        },
    },
    // Retry configuration
    RETRY_BUDGET_PER_BATCH: cfg.HTTP_RETRY_BUDGET_PER_BATCH,
    BASE_BACKOFF_MS: cfg.HTTP_BASE_BACKOFF_MS,
    MAX_BACKOFF_MS: cfg.HTTP_MAX_BACKOFF_MS,
    JITTER_FACTOR: cfg.HTTP_JITTER_FACTOR,
    // Circuit breaker half-open
    CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: cfg.HTTP_CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS,
    // Timeouts
    CONNECT_TIMEOUT_MS: cfg.HTTP_CONNECT_TIMEOUT_MS,
    READ_TIMEOUT_MS: cfg.HTTP_READ_TIMEOUT_MS,
    // Inter-request delay
    INTER_REQUEST_DELAY_MS: cfg.HTTP_INTER_REQUEST_DELAY_MS,
};
exports.default = config;
//# sourceMappingURL=config.js.map