/**
 * News Task Tests
 * Unit tests for the news scraping task
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { NewsTask } from '../task';
import { TaskContext } from '../../../core/types';

describe('NewsTask', () => {
  let task: NewsTask;
  let mockContext: TaskContext;

  beforeEach(() => {
    task = new NewsTask();
    mockContext = {
      http: {} as any,
      storage: {} as any,
      logger: {} as any,
      rateLimiter: {} as any,
      config: {},
      jobId: 'test-job',
      correlationId: 'test-correlation',
    };
  });

  afterEach(() => {
    // Cleanup if needed
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
          extractContent: true,
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

    it('should apply default options', () => {
      const inputWithDefaults = {
        urls: ['https://example.com/article1'],
      };

      const result = task.input.parse(inputWithDefaults);
      assert.strictEqual(result.options.concurrency, 5);
      assert.strictEqual(result.options.delayMs, 500);
      assert.strictEqual(result.options.extractContent, false);
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
  });
});