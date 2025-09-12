/**
 * Rate Limiting Utilities
 * Centralized rate limiting with configurable policies
 */

import { createLogger } from './log';

export interface RateLimitConfig {
  requestsPerMinute: number;
  burstLimit: number;
  windowMs: number;
}

export class RateLimiter {
  private logger = createLogger('rate-limiter');
  private config: RateLimitConfig;
  private requests: number[] = [];
  private burstCount = 0;
  private lastBurstReset = Date.now();

  constructor(config: RateLimitConfig) {
    this.config = {
      ...config,
    };
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForSlot();
    return fn();
  }

  private async waitForSlot(): Promise<void> {
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current rate limit status
  getStatus(): {
    requestsInWindow: number;
    burstCount: number;
    canMakeRequest: boolean;
  } {
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
  reset(): void {
    this.requests = [];
    this.burstCount = 0;
    this.lastBurstReset = Date.now();
  }
}

// Create rate limiter with default config
export function createRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  return new RateLimiter({
    requestsPerMinute: 60,
    burstLimit: 10,
    windowMs: 60000,
    ...config,
  });
}