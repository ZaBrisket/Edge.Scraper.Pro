/**
 * Core Dispatcher Tests
 * Tests for the task dispatcher functionality
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { taskDispatcher, registerTask, runTask } = require('../core/dispatcher');
const { createLogger } = require('../core/log');
const { createRateLimiter } = require('../core/rateLimit');
const { createStorage } = require('../core/storage');
const { envConfig } = require('../core/config');

describe('Core Dispatcher', () => {
  let mockTask;
  let mockContext;

  beforeEach(() => {
    // Clear dispatcher
    taskDispatcher.clear();

    // Create mock task
    mockTask = {
      name: 'test-task',
      input: {
        parse: (data) => data,
      },
      output: {
        parse: (data) => data,
      },
      run: async (input, ctx) => {
        return { success: true, data: input };
      },
    };

    // Create mock context
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

  afterEach(() => {
    taskDispatcher.clear();
  });

  describe('Task Registration', () => {
    it('should register a task successfully', () => {
      registerTask(mockTask);
      assert.strictEqual(taskDispatcher.hasTask('test-task'), true);
    });

    it('should throw error for invalid task', () => {
      assert.throws(() => {
        registerTask({ name: 'invalid' });
      });
    });

    it('should update existing task', () => {
      registerTask(mockTask);
      const updatedTask = { ...mockTask, name: 'test-task' };
      registerTask(updatedTask);
      assert.strictEqual(taskDispatcher.hasTask('test-task'), true);
    });
  });

  describe('Task Execution', () => {
    beforeEach(() => {
      registerTask(mockTask);
    });

    it('should execute a task successfully', async () => {
      const result = await runTask('test-task', { test: 'data' }, mockContext);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.test, 'data');
    });

    it('should throw error for unknown task', async () => {
      await assert.rejects(async () => {
        await runTask('unknown-task', { test: 'data' }, mockContext);
      }, /Task not found/);
    });

    it('should validate input schema', async () => {
      const taskWithValidation = {
        ...mockTask,
        input: {
          parse: (data) => {
            if (!data.required) {
              throw new Error('Required field missing');
            }
            return data;
          },
        },
      };
      registerTask(taskWithValidation);

      await assert.rejects(async () => {
        await runTask('test-task', { test: 'data' }, mockContext);
      }, /Required field missing/);
    });

    it('should validate output schema', async () => {
      const taskWithValidation = {
        ...mockTask,
        output: {
          parse: (data) => {
            if (!data.success) {
              throw new Error('Output validation failed');
            }
            return data;
          },
        },
        run: async (input, ctx) => {
          return { success: false, data: input };
        },
      };
      registerTask(taskWithValidation);

      await assert.rejects(async () => {
        await runTask('test-task', { test: 'data' }, mockContext);
      }, /Output validation failed/);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      registerTask(mockTask);
    });

    it('should handle task execution errors', async () => {
      const errorTask = {
        ...mockTask,
        name: 'error-task',
        run: async (input, ctx) => {
          throw new Error('Task execution failed');
        },
      };
      registerTask(errorTask);

      await assert.rejects(async () => {
        await runTask('error-task', { test: 'data' }, mockContext);
      }, /Task execution failed/);
    });

    it('should handle disabled tasks', async () => {
      taskDispatcher.setTaskEnabled('test-task', false);

      await assert.rejects(async () => {
        await runTask('test-task', { test: 'data' }, mockContext);
      }, /Task is disabled/);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      registerTask(mockTask);
    });

    it('should track usage statistics', async () => {
      const statsBefore = taskDispatcher.getStats();
      assert.strictEqual(statsBefore.totalUsage, 0);

      await runTask('test-task', { test: 'data' }, mockContext);

      const statsAfter = taskDispatcher.getStats();
      assert.strictEqual(statsAfter.totalUsage, 1);
    });

    it('should list tasks correctly', () => {
      const tasks = taskDispatcher.listTasks();
      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].name, 'test-task');
      assert.strictEqual(tasks[0].enabled, true);
    });
  });
});