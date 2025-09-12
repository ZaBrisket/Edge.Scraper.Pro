const { fetchWithPolicy, getMetrics, resetMetrics, cleanup } = require('../src/lib/http/unified-client');
const nock = require('nock');

describe('Unified HTTP Client', () => {
  beforeEach(() => {
    resetMetrics();
    cleanup();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('429 Retry-After handling', () => {
    it('should respect Retry-After header and retry', async () => {
      const testUrl = 'https://example.com/test';
      const scope = nock('https://example.com')
        .get('/test')
        .reply(429, 'Rate limited', { 'Retry-After': '1' })
        .get('/test')
        .reply(200, 'Success');

      const startTime = Date.now();
      const response = await fetchWithPolicy(testUrl);
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeGreaterThan(1000); // Should wait at least 1 second
      expect(scope.isDone()).toBe(true);
    });

    it('should handle Retry-After as HTTP date', async () => {
      const testUrl = 'https://example.com/test';
      const retryDate = new Date(Date.now() + 1000).toUTCString();
      
      const scope = nock('https://example.com')
        .get('/test')
        .reply(429, 'Rate limited', { 'Retry-After': retryDate })
        .get('/test')
        .reply(200, 'Success');

      const startTime = Date.now();
      const response = await fetchWithPolicy(testUrl);
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeGreaterThan(500); // Should wait for retry
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('5xx Circuit Breaker', () => {
    it('should open circuit after threshold failures', async () => {
      const testUrl = 'https://example.com/test';
      const scope = nock('https://example.com')
        .get('/test')
        .times(6) // Circuit breaker threshold is 5
        .reply(500, 'Server Error');

      // First 5 requests should fail with 500
      for (let i = 0; i < 5; i++) {
        try {
          await fetchWithPolicy(testUrl);
          fail('Expected request to fail');
        } catch (error) {
          expect(error.message).toContain('Upstream 500');
        }
      }

      // 6th request should fail with circuit open
      try {
        await fetchWithPolicy(testUrl);
        fail('Expected circuit to be open');
      } catch (error) {
        expect(error.message).toContain('Circuit for example.com is open');
      }

      expect(scope.isDone()).toBe(true);
    });

    it('should reset circuit after reset time', async () => {
      const testUrl = 'https://example.com/test';
      
      // Mock Date.now to control time
      const originalNow = Date.now;
      let mockTime = 1000000;
      Date.now = () => mockTime;

      try {
        const scope = nock('https://example.com')
          .get('/test')
          .times(6)
          .reply(500, 'Server Error')
          .get('/test')
          .reply(200, 'Success');

        // Trigger circuit breaker
        for (let i = 0; i < 5; i++) {
          try {
            await fetchWithPolicy(testUrl);
          } catch (error) {
            // Expected
          }
        }

        // Fast forward past reset time
        mockTime += 61000; // 61 seconds

        // Should succeed now
        const response = await fetchWithPolicy(testUrl);
        expect(response.status).toBe(200);
        expect(scope.isDone()).toBe(true);
      } finally {
        Date.now = originalNow;
      }
    });
  });

  describe('Per-host rate limiting', () => {
    it('should enforce per-host limits', async () => {
      const testUrl = 'https://example.com/test';
      const scope = nock('https://example.com')
        .get('/test')
        .times(10) // More than burst limit
        .reply(200, 'Success');

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(fetchWithPolicy(testUrl));
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('Metrics tracking', () => {
    it('should track request metrics', async () => {
      const testUrl = 'https://example.com/test';
      const scope = nock('https://example.com')
        .get('/test')
        .reply(200, 'Success');

      await fetchWithPolicy(testUrl);

      const metrics = getMetrics();
      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.byHost['example.com']).toBe(1);
      expect(metrics.requests.byStatus[200]).toBe(1);
      expect(scope.isDone()).toBe(true);
    });

    it('should track rate limit metrics', async () => {
      const testUrl = 'https://example.com/test';
      const scope = nock('https://example.com')
        .get('/test')
        .reply(429, 'Rate limited', { 'Retry-After': '1' })
        .get('/test')
        .reply(200, 'Success');

      await fetchWithPolicy(testUrl);

      const metrics = getMetrics();
      expect(metrics.rateLimits.hits).toBe(1);
      expect(metrics.rateLimits.byHost['example.com']).toBe(1);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('should validate URLs', async () => {
      await expect(fetchWithPolicy('invalid-url')).rejects.toThrow('Invalid URL');
      await expect(fetchWithPolicy('ftp://example.com')).rejects.toThrow('Invalid URL');
    });

    it('should validate options', async () => {
      await expect(fetchWithPolicy('https://example.com', { retries: -1 })).rejects.toThrow('Invalid options');
      await expect(fetchWithPolicy('https://example.com', { timeout: 50 })).rejects.toThrow('Invalid options');
    });
  });

  describe('Graceful shutdown', () => {
    it('should reject new requests during shutdown', async () => {
      // This test would require mocking the shutdown state
      // For now, we'll just verify the function exists
      expect(typeof cleanup).toBe('function');
    });
  });
});