/**
 * Task Dispatcher
 * Central registry and execution engine for all tasks
 */

import { z } from 'zod';
import { 
  ScrapeTask, 
  TaskContext, 
  TaskRegistryEntry, 
  TaskNotFoundError, 
  TaskError,
  isScrapeTask 
} from './types';
import { createLogger } from './log';
import { ErrorHandler } from './errors';

export class TaskDispatcher {
  private tasks = new Map<string, TaskRegistryEntry>();
  private logger = createLogger('task-dispatcher');

  constructor() {
    this.logger.info('Task dispatcher initialized');
  }

  /**
   * Register a new task
   */
  register<I, O>(task: ScrapeTask<I, O>): void {
    if (!isScrapeTask(task)) {
      throw new TaskError(
        'Invalid task contract',
        'INVALID_TASK_CONTRACT',
        { task }
      );
    }

    if (this.tasks.has(task.name)) {
      this.logger.warn('Task already registered, updating', { taskName: task.name });
    }

    const entry: TaskRegistryEntry = {
      task,
      registered: new Date(),
      usageCount: 0,
      enabled: true,
    };

    this.tasks.set(task.name, entry);
    this.logger.info('Task registered', {
      taskName: task.name,
      registered: entry.registered.toISOString(),
    });
  }

  /**
   * Unregister a task
   */
  unregister(taskName: string): boolean {
    const deleted = this.tasks.delete(taskName);
    if (deleted) {
      this.logger.info('Task unregistered', { taskName });
    }
    return deleted;
  }

  /**
   * Get a specific task
   */
  getTask(taskName: string): ScrapeTask<any, any> {
    const entry = this.tasks.get(taskName);
    if (!entry) {
      throw new TaskNotFoundError(taskName);
    }

    if (!entry.enabled) {
      throw new TaskError(
        `Task is disabled: ${taskName}`,
        'TASK_DISABLED',
        { taskName }
      );
    }

    // Update usage tracking
    entry.usageCount++;
    entry.lastUsed = new Date();

    return entry.task;
  }

  /**
   * List all available tasks
   */
  listTasks(): Array<{
    name: string;
    enabled: boolean;
    usageCount: number;
    lastUsed?: Date;
    registered: Date;
  }> {
    return Array.from(this.tasks.values()).map(entry => ({
      name: entry.task.name,
      enabled: entry.enabled,
      usageCount: entry.usageCount,
      lastUsed: entry.lastUsed,
      registered: entry.registered,
    }));
  }

  /**
   * Get enabled tasks only
   */
  getEnabledTasks(): ScrapeTask<any, any>[] {
    return Array.from(this.tasks.values())
      .filter(entry => entry.enabled)
      .map(entry => entry.task);
  }

  /**
   * Check if a task exists
   */
  hasTask(taskName: string): boolean {
    return this.tasks.has(taskName);
  }

  /**
   * Enable/disable a task
   */
  setTaskEnabled(taskName: string, enabled: boolean): void {
    const entry = this.tasks.get(taskName);
    if (!entry) {
      throw new TaskNotFoundError(taskName);
    }

    entry.enabled = enabled;
    this.logger.info('Task status changed', { taskName, enabled });
  }

  /**
   * Get dispatcher statistics
   */
  getStats(): {
    totalTasks: number;
    enabledTasks: number;
    disabledTasks: number;
    totalUsage: number;
    mostUsedTask?: string;
  } {
    const entries = Array.from(this.tasks.values());
    const totalUsage = entries.reduce((sum, entry) => sum + entry.usageCount, 0);
    const mostUsed = entries.reduce((max, entry) => 
      entry.usageCount > (max?.usageCount || 0) ? entry : max, 
      null as TaskRegistryEntry | null
    );

    return {
      totalTasks: entries.length,
      enabledTasks: entries.filter(e => e.enabled).length,
      disabledTasks: entries.filter(e => !e.enabled).length,
      totalUsage,
      mostUsedTask: mostUsed?.task.name,
    };
  }

  /**
   * Validate task input before execution
   */
  async validateInput(taskName: string, input: any): Promise<{
    valid: boolean;
    errors?: string[];
  }> {
    const entry = this.tasks.get(taskName);
    if (!entry) {
      throw new TaskNotFoundError(taskName);
    }

    if (!entry.enabled) {
      throw new TaskError(
        `Task is disabled: ${taskName}`,
        'TASK_DISABLED',
        { taskName }
      );
    }

    const task = entry.task;

    try {
      // Schema validation
      task.input.parse(input);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        };
      }
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
      };
    }
  }

  /**
   * Execute a task with input
   */
  async execute(
    taskName: string,
    input: any,
    context: TaskContext
  ): Promise<any> {
    const entry = this.tasks.get(taskName);
    if (!entry) {
      throw new TaskNotFoundError(taskName);
    }

    if (!entry.enabled) {
      throw new TaskError(
        `Task is disabled: ${taskName}`,
        'TASK_DISABLED',
        { taskName }
      );
    }

    const task = entry.task;

    this.logger.taskStart(taskName, {
      requestId: context.correlationId,
      jobId: context.jobId,
    });

    try {
      // Validate input
      const validation = await this.validateInput(taskName, input);
      if (!validation.valid) {
        throw new TaskError(
          'Input validation failed',
          'VALIDATION_ERROR',
          { errors: validation.errors }
        );
      }

      // Execute task
      const startTime = Date.now();
      const result = await task.run(input, context);
      const duration = Date.now() - startTime;

      // Validate output
      task.output.parse(result);

      // Update usage tracking
      entry.usageCount++;
      entry.lastUsed = new Date();

      this.logger.taskComplete(taskName, {
        requestId: context.correlationId,
        jobId: context.jobId,
        duration_ms: duration,
      });

      return result;
    } catch (error) {
      const coreError = ErrorHandler.handle(error);
      this.logger.taskError(taskName, coreError, {
        requestId: context.correlationId,
        jobId: context.jobId,
      });
      throw coreError;
    }
  }

  /**
   * Clear all tasks (mainly for testing)
   */
  clear(): void {
    this.tasks.clear();
    this.logger.info('Dispatcher cleared');
  }
}

// Global dispatcher instance
export const taskDispatcher = new TaskDispatcher();

// Convenience functions
export function registerTask<I, O>(task: ScrapeTask<I, O>): void {
  taskDispatcher.register(task);
}

export async function runTask(
  taskName: string,
  payload: any,
  context: TaskContext
): Promise<any> {
  return taskDispatcher.execute(taskName, payload, context);
}

export function getTask(taskName: string): ScrapeTask<any, any> {
  return taskDispatcher.getTask(taskName);
}

export function listTasks(): Array<{
  name: string;
  enabled: boolean;
  usageCount: number;
  lastUsed?: Date;
  registered: Date;
}> {
  return taskDispatcher.listTasks();
}

// Re-export types
export type {
  TaskContext,
  ScrapeTask,
  TaskRegistryEntry,
  isScrapeTask,
};
export {
  TaskNotFoundError,
  TaskError,
};