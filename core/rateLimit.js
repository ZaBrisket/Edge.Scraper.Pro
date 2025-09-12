"use strict";
/**
 * Rate Limiting Utilities
 * Centralized rate limiting with configurable policies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
exports.createRateLimiter = createRateLimiter;
const log_1 = require("./log");
class RateLimiter {
    constructor(config) {
        this.logger = (0, log_1.createLogger)('rate-limiter');
        this.requests = [];
        this.burstCount = 0;
        this.lastBurstReset = Date.now();
        this.config = {
            requestsPerMinute: 60,
            burstLimit: 10,
            windowMs: 60000, // 1 minute
            ...config,
        };
    }
    async schedule(fn) {
        await this.waitForSlot();
        return fn();
    }
    async waitForSlot() {
        const now = Date.now();
        // Clean old requests outside the window
        this.requests = this.requests.filter(time => now - time < this.config.windowMs);
        // Reset burst counter if enough time has passed
        if (now - this.lastBurstReset > 1000) { // 1 second
            this.burstCount = 0;
            this.lastBurstReset = now;
        }
        // Check burst limit
        if (this.burstCount >= this.config.burstLimit) {
            const waitTime = 1000 - (now - this.lastBurstReset);
            if (waitTime > 0) {
                await this.sleep(waitTime);
                return this.waitForSlot();
            }
        }
        // Check rate limit
        if (this.requests.length >= this.config.requestsPerMinute) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.config.windowMs - (now - oldestRequest);
            if (waitTime > 0) {
                await this.sleep(waitTime);
                return this.waitForSlot();
            }
        }
        // Record this request
        this.requests.push(now);
        this.burstCount++;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Get current rate limit status
    getStatus() {
        const now = Date.now();
        const requestsInWindow = this.requests.filter(time => now - time < this.config.windowMs).length;
        const canMakeRequest = requestsInWindow < this.config.requestsPerMinute &&
            this.burstCount < this.config.burstLimit;
        return {
            requestsInWindow,
            burstCount: this.burstCount,
            canMakeRequest,
        };
    }
    // Reset rate limiter
    reset() {
        this.requests = [];
        this.burstCount = 0;
        this.lastBurstReset = Date.now();
    }
}
exports.RateLimiter = RateLimiter;
// Create rate limiter with default config
function createRateLimiter(config) {
    return new RateLimiter({
        requestsPerMinute: 60,
        burstLimit: 10,
        windowMs: 60000,
        ...config,
    });
}
//# sourceMappingURL=rateLimit.js.map