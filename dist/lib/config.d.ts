export interface HostLimit {
    rps: number;
    burst: number;
}
export interface Config {
    DEFAULT_TIMEOUT_MS: number;
    MAX_RETRIES: number;
    RATE_LIMIT_PER_SEC: number;
    MAX_CONCURRENCY: number;
    CIRCUIT_BREAKER_THRESHOLD: number;
    CIRCUIT_BREAKER_RESET_MS: number;
    HOST_LIMITS: Record<string, HostLimit>;
    RETRY_BUDGET_PER_BATCH: number;
    BASE_BACKOFF_MS: number;
    MAX_BACKOFF_MS: number;
    JITTER_FACTOR: number;
    CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS: number;
    CONNECT_TIMEOUT_MS: number;
    READ_TIMEOUT_MS: number;
    INTER_REQUEST_DELAY_MS: number;
}
declare const config: Config;
export default config;
//# sourceMappingURL=config.d.ts.map