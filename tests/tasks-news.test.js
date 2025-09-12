/**
 * News Task Tests
 * Tests for the news scraping task
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { NewsTask } = require('../dist/tasks/news/task');
const { NewsInputSchema, NewsOutputSchema } = require('../dist/tasks/news/schema');
const { createLogger } = require('../dist/core/log');
const { createRateLimiter } = require('../dist/core/rateLimit');
const { createStorage } = require('../dist/core/storage');
const { envConfig } = require('../dist/core/config');

describe('News Task', () => {
  let task;
  let mockContext;

  beforeEach(() => {
    task = new NewsTask();
    mockContext = {
      http: null,
      storage: createStorage({ type: 'memory', config: {} }),
      logger: createLogger('test'),
      rateLimiter: createRateLimiter({ requestsPerMinute: 60, burstLimit: 10 }),
      config: envConfig.getAll(),
      jobId: 'test-job',
      correlationId: 'test-correlation',
    };
  });

  describe('Task Properties', () => {
    it('should have correct name', () => {
      assert.strictEqual(task.name, 'news');
    });

    it('should have input schema', () => {
      assert.ok(task.input);
    });

    it('should have output schema', () => {
      assert.ok(task.output);
    });
  });

  describe('Input Validation', () => {
    it('should accept valid input', () => {
      const validInput = {
        urls: ['https://example.com/article1', 'https://example.com/article2'],
        options: {
          concurrency: 3,
          delayMs: 1000,
          timeout: 15000,
          maxRetries: 2,
          extractContent: true,
          extractImages: false,
          maxContentLength: 5000,
          dateFormat: 'iso',
        },
      };

      const result = task.input.parse(validInput);
      assert.ok(result);
      assert.strictEqual(result.urls.length, 2);
    });

    it('should reject invalid URLs', () => {
      const invalidInput = {
        urls: ['not-a-url', 'https://example.com/article1'],
      };

      assert.throws(() => {
        task.input.parse(invalidInput);
      });
    });

    it('should require all options', () => {
      const inputWithDefaults = {
        urls: ['https://example.com/article1'],
      };

      assert.throws(() => {
        task.input.parse(inputWithDefaults);
      });
    });

    it('should reject empty URL list', () => {
      const emptyInput = {
        urls: [],
      };

      assert.throws(() => {
        task.input.parse(emptyInput);
      });
    });

    it('should reject too many URLs', () => {
      const tooManyUrls = {
        urls: Array(1501).fill('https://example.com/article'),
      };

      assert.throws(() => {
        task.input.parse(tooManyUrls);
      });
    });
  });

  describe('Output Validation', () => {
    it('should accept valid output', () => {
      const validOutput = {
        articles: [
          {
            url: 'https://example.com/article1',
            title: 'Test Article',
            author: 'Test Author',
            publishedAt: '2024-01-15T10:30:00Z',
            metadata: {
              extractedAt: '2024-01-15T10:30:00Z',
              confidence: 0.8,
              source: 'https://example.com/article1',
            },
          },
        ],
        summary: {
          total: 1,
          successful: 1,
          failed: 0,
          averageTime: 1000,
          errors: [],
        },
        metadata: {
          jobId: 'test-job',
          task: 'news',
          startTime: '2024-01-15T10:30:00Z',
          endTime: '2024-01-15T10:30:01Z',
          duration: 1000,
        },
      };

      const result = task.output.parse(validOutput);
      assert.ok(result);
      assert.strictEqual(result.articles.length, 1);
    });

    it('should reject invalid output structure', () => {
      const invalidOutput = {
        articles: 'not-an-array',
        summary: {
          total: 1,
          successful: 1,
          failed: 0,
          averageTime: 1000,
          errors: [],
        },
        metadata: {
          jobId: 'test-job',
          task: 'news',
          startTime: '2024-01-15T10:30:00Z',
          endTime: '2024-01-15T10:30:01Z',
          duration: 1000,
        },
      };

      assert.throws(() => {
        task.output.parse(invalidOutput);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input gracefully', async () => {
      const invalidInput = {
        urls: ['not-a-url'],
      };

      await assert.rejects(async () => {
        await task.run(invalidInput, mockContext);
      });
    });

    it('should handle missing context gracefully', async () => {
      const validInput = {
        urls: ['https://example.com/article1'],
      };

      await assert.rejects(async () => {
        await task.run(validInput, null);
      });
    });
  });
});