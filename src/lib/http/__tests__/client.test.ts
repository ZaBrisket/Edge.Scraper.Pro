import { fetchWithPolicy, getMetrics, resetMetrics } from '../client';
import { RateLimitError, CircuitOpenError, TimeoutError, NetworkError } from '../errors';
import config from '../../config';

// Mock fetch globally
global.fetch = jest.fn();

// Mock logger
jest.mock('../../logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })
  })
}));

describe('HTTP Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMetrics();
  });

  describe('fetchWithPolicy', () => {
    it('should make successful request', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await fetchWithPolicy('https://example.com');
      
      expect(result).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('EdgeScraper'),
            'x-correlation-id': expect.any(String)
          })
        })
      );
    });

    it('should handle 429 responses with retry', async () => {
      const mockResponse429 = new Response('Rate Limited', { 
        status: 429,
        headers: { 'Retry-After': '1' }
      });
      const mockResponse200 = new Response('OK', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse200);

      const result = await fetchWithPolicy('https://example.com', { timeout: 5000 });
      
      expect(result).toBe(mockResponse200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw RateLimitError after max retries', async () => {
      const mockResponse429 = new Response('Rate Limited', { status: 429 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse429);

      await expect(
        fetchWithPolicy('https://example.com', { retries: 1 })
      ).rejects.toThrow(RateLimitError);
    });

    it('should open circuit breaker after threshold failures', async () => {
      const mockResponse500 = new Response('Server Error', { status: 500 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse500);

      // Make requests up to threshold
      for (let i = 0; i < config.CIRCUIT_BREAKER_THRESHOLD; i++) {
        try {
          await fetchWithPolicy('https://example.com', { retries: 0 });
        } catch (e) {
          // Expected to fail
        }
      }

      // Next request should fail with circuit open
      await expect(
        fetchWithPolicy('https://example.com')
      ).rejects.toThrow(CircuitOpenError);
    });

    it('should handle request timeout', async () => {
      // Mock fetch that never resolves
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(() => {})
      );

      await expect(
        fetchWithPolicy('https://example.com', { timeout: 100, retries: 0 })
      ).rejects.toThrow(TimeoutError);
    });

    it('should not count 429 responses toward circuit breaker', async () => {
      const mockResponse429 = new Response('Rate Limited', { status: 429 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse429);

      // Make multiple 429 requests
      for (let i = 0; i < config.CIRCUIT_BREAKER_THRESHOLD + 1; i++) {
        try {
          await fetchWithPolicy('https://example.com', { retries: 0 });
        } catch (e) {
          expect(e).toBeInstanceOf(RateLimitError);
        }
      }

      // Circuit should still be closed
      const mockResponse200 = new Response('OK', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse200);
      
      const result = await fetchWithPolicy('https://example.com');
      expect(result).toBe(mockResponse200);
    });
  });

  describe('calculateBackoff', () => {
    it('should respect max backoff ceiling', async () => {
      // This test is implicit in the retry behavior
      const mockResponse500 = new Response('Server Error', { status: 500 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse500);

      const startTime = Date.now();
      try {
        await fetchWithPolicy('https://example.com', { retries: 5 });
      } catch (e) {
        // Expected to fail
      }
      const duration = Date.now() - startTime;

      // Even with 5 retries, total time should be bounded by max backoff
      expect(duration).toBeLessThan(config.MAX_BACKOFF_MS * 6);
    });

    it('should honor Retry-After header for 429', async () => {
      const retryAfterSeconds = 2;
      const mockResponse429 = new Response('Rate Limited', { 
        status: 429,
        headers: { 'Retry-After': retryAfterSeconds.toString() }
      });
      const mockResponse200 = new Response('OK', { status: 200 });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse429)
        .mockResolvedValueOnce(mockResponse200);

      const startTime = Date.now();
      await fetchWithPolicy('https://example.com');
      const duration = Date.now() - startTime;

      // Should wait at least the retry-after duration
      expect(duration).toBeGreaterThanOrEqual(retryAfterSeconds * 1000);
    });
  });

  describe('metrics', () => {
    it('should track request metrics', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      await fetchWithPolicy('https://example.com');

      const metrics = getMetrics();
      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.byHost['example.com']).toBe(1);
      expect(metrics.requests.byStatus[200]).toBe(1);
    });

    it('should track rate limit hits', async () => {
      const mockResponse429 = new Response('Rate Limited', { status: 429 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse429);

      try {
        await fetchWithPolicy('https://example.com', { retries: 0 });
      } catch (e) {
        // Expected
      }

      const metrics = getMetrics();
      expect(metrics.rateLimits.hits).toBe(1);
      expect(metrics.rateLimits.byHost['example.com']).toBe(1);
    });

    it('should reset metrics', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      await fetchWithPolicy('https://example.com');
      
      let metrics = getMetrics();
      expect(metrics.requests.total).toBe(1);

      resetMetrics();
      
      metrics = getMetrics();
      expect(metrics.requests.total).toBe(0);
      expect(metrics.requests.byHost).toEqual({});
    });
  });
});