/**
 * Rate Limiting Utilities
 * Centralized rate limiting with configurable policies
 */
export interface RateLimitConfig {
    requestsPerMinute: number;
    burstLimit: number;
    windowMs: number;
}
export declare class RateLimiter {
    private logger;
    private config;
    private requests;
    private burstCount;
    private lastBurstReset;
    constructor(config: RateLimitConfig);
    schedule<T>(fn: () => Promise<T>): Promise<T>;
    private waitForSlot;
    private sleep;
    getStatus(): {
        requestsInWindow: number;
        burstCount: number;
        canMakeRequest: boolean;
    };
    reset(): void;
}
export declare function createRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter;
//# sourceMappingURL=rateLimit.d.ts.map