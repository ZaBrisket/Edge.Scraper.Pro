"use strict";
/**
 * Task Dispatcher
 * Central registry and execution engine for all tasks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskDispatcher = exports.TaskDispatcher = void 0;
exports.registerTask = registerTask;
exports.runTask = runTask;
exports.getTask = getTask;
exports.listTasks = listTasks;
const zod_1 = require("zod");
const types_1 = require("./types");
const log_1 = require("./log");
const errors_1 = require("./errors");
class TaskDispatcher {
    constructor() {
        this.tasks = new Map();
        this.logger = (0, log_1.createLogger)('task-dispatcher');
        this.logger.info('Task dispatcher initialized');
    }
    /**
     * Register a new task
     */
    register(task) {
        if (!(0, types_1.isScrapeTask)(task)) {
            throw new types_1.TaskError('Invalid task contract', 'INVALID_TASK_CONTRACT', { task });
        }
        if (this.tasks.has(task.name)) {
            this.logger.warn('Task already registered, updating', { taskName: task.name });
        }
        const entry = {
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
    unregister(taskName) {
        const deleted = this.tasks.delete(taskName);
        if (deleted) {
            this.logger.info('Task unregistered', { taskName });
        }
        return deleted;
    }
    /**
     * Get a specific task
     */
    getTask(taskName) {
        const entry = this.tasks.get(taskName);
        if (!entry) {
            throw new types_1.TaskNotFoundError(taskName);
        }
        if (!entry.enabled) {
            throw new types_1.TaskError(`Task is disabled: ${taskName}`, 'TASK_DISABLED', { taskName });
        }
        // Update usage tracking
        entry.usageCount++;
        entry.lastUsed = new Date();
        return entry.task;
    }
    /**
     * List all available tasks
     */
    listTasks() {
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
    getEnabledTasks() {
        return Array.from(this.tasks.values())
            .filter(entry => entry.enabled)
            .map(entry => entry.task);
    }
    /**
     * Check if a task exists
     */
    hasTask(taskName) {
        return this.tasks.has(taskName);
    }
    /**
     * Enable/disable a task
     */
    setTaskEnabled(taskName, enabled) {
        const entry = this.tasks.get(taskName);
        if (!entry) {
            throw new types_1.TaskNotFoundError(taskName);
        }
        entry.enabled = enabled;
        this.logger.info('Task status changed', { taskName, enabled });
    }
    /**
     * Get dispatcher statistics
     */
    getStats() {
        const entries = Array.from(this.tasks.values());
        const totalUsage = entries.reduce((sum, entry) => sum + entry.usageCount, 0);
        const mostUsed = entries.reduce((max, entry) => entry.usageCount > (max?.usageCount || 0) ? entry : max, null);
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
    async validateInput(taskName, input) {
        const entry = this.tasks.get(taskName);
        if (!entry) {
            throw new types_1.TaskNotFoundError(taskName);
        }
        if (!entry.enabled) {
            throw new types_1.TaskError(`Task is disabled: ${taskName}`, 'TASK_DISABLED', { taskName });
        }
        const task = entry.task;
        try {
            // Schema validation
            task.input.parse(input);
            return { valid: true };
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
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
    async execute(taskName, input, context) {
        const entry = this.tasks.get(taskName);
        if (!entry) {
            throw new types_1.TaskNotFoundError(taskName);
        }
        if (!entry.enabled) {
            throw new types_1.TaskError(`Task is disabled: ${taskName}`, 'TASK_DISABLED', { taskName });
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
                throw new types_1.TaskError('Input validation failed', 'VALIDATION_ERROR', { errors: validation.errors });
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
        }
        catch (error) {
            const coreError = errors_1.ErrorHandler.handle(error);
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
    clear() {
        this.tasks.clear();
        this.logger.info('Dispatcher cleared');
    }
}
exports.TaskDispatcher = TaskDispatcher;
// Global dispatcher instance
exports.taskDispatcher = new TaskDispatcher();
// Convenience functions
function registerTask(task) {
    exports.taskDispatcher.register(task);
}
async function runTask(taskName, payload, context) {
    return exports.taskDispatcher.execute(taskName, payload, context);
}
function getTask(taskName) {
    return exports.taskDispatcher.getTask(taskName);
}
function listTasks() {
    return exports.taskDispatcher.listTasks();
}
//# sourceMappingURL=dispatcher.js.map