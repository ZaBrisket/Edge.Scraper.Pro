"use strict";
/**
 * News Task Tests
 * Unit tests for the news scraping task
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const task_1 = require("../task");
(0, node_test_1.describe)('NewsTask', () => {
    let task;
    let mockContext;
    (0, node_test_1.beforeEach)(() => {
        task = new task_1.NewsTask();
        mockContext = {
            http: {},
            storage: {},
            logger: {},
            rateLimiter: {},
            config: {},
            jobId: 'test-job',
            correlationId: 'test-correlation',
        };
    });
    (0, node_test_1.afterEach)(() => {
        // Cleanup if needed
    });
    (0, node_test_1.describe)('Task Properties', () => {
        (0, node_test_1.it)('should have correct name', () => {
            node_assert_1.default.strictEqual(task.name, 'news');
        });
        (0, node_test_1.it)('should have input schema', () => {
            node_assert_1.default.ok(task.input);
        });
        (0, node_test_1.it)('should have output schema', () => {
            node_assert_1.default.ok(task.output);
        });
    });
    (0, node_test_1.describe)('Input Validation', () => {
        (0, node_test_1.it)('should accept valid input', () => {
            const validInput = {
                urls: ['https://example.com/article1', 'https://example.com/article2'],
                options: {
                    concurrency: 3,
                    delayMs: 1000,
                    extractContent: true,
                },
            };
            const result = task.input.parse(validInput);
            node_assert_1.default.ok(result);
            node_assert_1.default.strictEqual(result.urls.length, 2);
        });
        (0, node_test_1.it)('should reject invalid URLs', () => {
            const invalidInput = {
                urls: ['not-a-url', 'https://example.com/article1'],
            };
            node_assert_1.default.throws(() => {
                task.input.parse(invalidInput);
            });
        });
        (0, node_test_1.it)('should apply default options', () => {
            const inputWithDefaults = {
                urls: ['https://example.com/article1'],
            };
            const result = task.input.parse(inputWithDefaults);
            node_assert_1.default.strictEqual(result.options.concurrency, 5);
            node_assert_1.default.strictEqual(result.options.delayMs, 500);
            node_assert_1.default.strictEqual(result.options.extractContent, false);
        });
    });
    (0, node_test_1.describe)('Output Validation', () => {
        (0, node_test_1.it)('should accept valid output', () => {
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
            node_assert_1.default.ok(result);
            node_assert_1.default.strictEqual(result.articles.length, 1);
        });
    });
});
//# sourceMappingURL=task.test.js.map