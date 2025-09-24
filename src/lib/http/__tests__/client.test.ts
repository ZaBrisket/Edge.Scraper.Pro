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

jest.setTimeout(20000);

const originalConfig = {
  baseBackoff: config.BASE_BACKOFF_MS,
  maxBackoff: config.MAX_BACKOFF_MS,
  jitter: config.JITTER_FACTOR,
  circuitThreshold: config.CIRCUIT_BREAKER_THRESHOLD,
  circuitReset: config.CIRCUIT_BREAKER_RESET_MS,
  readTimeout: config.READ_TIMEOUT_MS,
  connectTimeout: config.CONNECT_TIMEOUT_MS,
};

describe('HTTP Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMetrics();
    config.BASE_BACKOFF_MS = 10;
    config.MAX_BACKOFF_MS = 50;
    config.JITTER_FACTOR = 0;
    config.CIRCUIT_BREAKER_THRESHOLD = 3;
    config.CIRCUIT_BREAKER_RESET_MS = 500;
    config.READ_TIMEOUT_MS = 250;
    config.CONNECT_TIMEOUT_MS = 250;
  });

  afterAll(() => {
    config.BASE_BACKOFF_MS = originalConfig.baseBackoff;
    config.MAX_BACKOFF_MS = originalConfig.maxBackoff;
    config.JITTER_FACTOR = originalConfig.jitter;
    config.CIRCUIT_BREAKER_THRESHOLD = originalConfig.circuitThreshold;
    config.CIRCUIT_BREAKER_RESET_MS = originalConfig.circuitReset;
    config.READ_TIMEOUT_MS = originalConfig.readTimeout;
    config.CONNECT_TIMEOUT_MS = originalConfig.connectTimeout;
  });

  describe('fetchWithPolicy', () => {
    it('should make successful request', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await fetchWithPolicy('https://example.com');
      
      expect(result).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/example\.com\/?$/),
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
      (global.fetch as jest.Mock).mockImplementation((_, init) => {
        const signal = (init as RequestInit)?.signal;
        return new Promise((resolve, reject) => {
          if (signal) {
            signal.addEventListener('abort', () => {
              const abortErr = new Error('Aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }
        });
      });

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
      const mockResponse500 = new Response('Server Error', { status: 500 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse500);

      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      const timeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((handler: any, timeout?: number, ...args: any[]) => {
          const delay = Number(timeout ?? 0);
          delays.push(delay);
          return originalSetTimeout(handler as any, timeout, ...args);
        });

      await expect(
        fetchWithPolicy('https://example.com', { retries: 5 })
      ).rejects.toThrow(NetworkError);

      timeoutSpy.mockRestore();

      const backoffDelays = delays.filter((value) => value > 0 && value <= config.MAX_BACKOFF_MS);
      expect(backoffDelays.length).toBeGreaterThan(0);
      expect(Math.max(...backoffDelays)).toBeLessThanOrEqual(config.MAX_BACKOFF_MS);
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

      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      const timeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((handler: any, timeout?: number, ...args: any[]) => {
          const delay = Number(timeout ?? 0);
          delays.push(delay);
          return originalSetTimeout(handler as any, timeout, ...args);
        });

      await fetchWithPolicy('https://example.com');

      timeoutSpy.mockRestore();

      const expectedDelay = Math.min(retryAfterSeconds * 1000, config.MAX_BACKOFF_MS);
      const backoffDelays = delays.filter((value) => value > 0 && value <= config.MAX_BACKOFF_MS);
      expect(backoffDelays).toContain(expectedDelay);
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