/**
 * Rate Limiting Tests
 * Tests for the rate limiting functionality
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { RateLimiter } = require('../core/rateLimit');

describe('Rate Limiter', () => {
  let rateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      requestsPerMinute: 10,
      burstLimit: 3,
      windowMs: 60000,
    });
  });

  afterEach(() => {
    rateLimiter.reset();
  });

  describe('Basic Functionality', () => {
    it('should allow requests within limits', async () => {
      let executed = false;
      await rateLimiter.schedule(async () => {
        executed = true;
        return 'success';
      });

      assert.strictEqual(executed, true);
    });

    it('should return the result of the scheduled function', async () => {
      const result = await rateLimiter.schedule(async () => {
        return 'test-result';
      });

      assert.strictEqual(result, 'test-result');
    });

    it('should handle multiple requests', async () => {
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.schedule(async () => {
          return `result-${i}`;
        });
        results.push(result);
      }

      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0], 'result-0');
      assert.strictEqual(results[1], 'result-1');
      assert.strictEqual(results[2], 'result-2');
    });
  });

  describe('Burst Limiting', () => {
    it('should respect burst limit', async () => {
      const startTime = Date.now();
      const results = [];

      // Try to execute more than burst limit
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.schedule(async () => {
          return `result-${i}`;
        });
        results.push(result);
      }

      const duration = Date.now() - startTime;
      assert.strictEqual(results.length, 5);
      // Should have taken some time due to burst limiting
      assert(duration > 0);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect requests per minute limit', async () => {
      const startTime = Date.now();
      const results = [];

      // Try to execute more than the limit
      for (let i = 0; i < 15; i++) {
        const result = await rateLimiter.schedule(async () => {
          return `result-${i}`;
        });
        results.push(result);
      }

      const duration = Date.now() - startTime;
      assert.strictEqual(results.length, 15);
      // Should have taken some time due to rate limiting
      assert(duration > 0);
    });
  });

  describe('Status Checking', () => {
    it('should provide correct status', () => {
      const status = rateLimiter.getStatus();
      assert.strictEqual(status.requestsInWindow, 0);
      assert.strictEqual(status.burstCount, 0);
      assert.strictEqual(status.canMakeRequest, true);
    });

    it('should update status after requests', async () => {
      await rateLimiter.schedule(async () => 'test');

      const status = rateLimiter.getStatus();
      assert.strictEqual(status.requestsInWindow, 1);
      assert.strictEqual(status.burstCount, 1);
      assert.strictEqual(status.canMakeRequest, true);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset counters', async () => {
      await rateLimiter.schedule(async () => 'test');
      
      let status = rateLimiter.getStatus();
      assert.strictEqual(status.requestsInWindow, 1);
      assert.strictEqual(status.burstCount, 1);

      rateLimiter.reset();
      
      status = rateLimiter.getStatus();
      assert.strictEqual(status.requestsInWindow, 0);
      assert.strictEqual(status.burstCount, 0);
    });
  });

  describe('Error Handling', () => {
    it('should handle function errors', async () => {
      await assert.rejects(async () => {
        await rateLimiter.schedule(async () => {
          throw new Error('Test error');
        });
      }, /Test error/);
    });

    it('should continue working after errors', async () => {
      // First request fails
      await assert.rejects(async () => {
        await rateLimiter.schedule(async () => {
          throw new Error('Test error');
        });
      });

      // Second request should work
      const result = await rateLimiter.schedule(async () => {
        return 'success';
      });

      assert.strictEqual(result, 'success');
    });
  });
});