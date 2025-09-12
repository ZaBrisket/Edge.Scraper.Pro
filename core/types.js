"use strict";
/**
 * Core Types and Interfaces
 * Defines the standard interfaces for the modular task architecture
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskNotFoundError = exports.TaskExecutionError = exports.TaskValidationError = exports.TaskError = exports.BatchOutputSchema = exports.StandardOutputSchema = exports.UrlListSchema = void 0;
exports.isScrapeTask = isScrapeTask;
const zod_1 = require("zod");
// Common input schemas for reuse across tasks
exports.UrlListSchema = zod_1.z.object({
    urls: zod_1.z.array(zod_1.z.string().url()).min(1).max(1500),
    options: zod_1.z.object({
        concurrency: zod_1.z.number().min(1).max(20).optional().default(3),
        delayMs: zod_1.z.number().min(0).max(10000).optional().default(1000),
        timeout: zod_1.z.number().min(1000).max(60000).optional().default(30000),
        maxRetries: zod_1.z.number().min(0).max(5).optional().default(3),
    }).optional().default({}),
});
// Common output schemas
exports.StandardOutputSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    data: zod_1.z.any().optional(),
    error: zod_1.z.string().optional(),
    metadata: zod_1.z.object({
        url: zod_1.z.string(),
        extractedAt: zod_1.z.string(),
        processingTime: zod_1.z.number(),
        task: zod_1.z.string(),
        version: zod_1.z.string(),
    }),
});
exports.BatchOutputSchema = zod_1.z.object({
    results: zod_1.z.array(exports.StandardOutputSchema),
    summary: zod_1.z.object({
        total: zod_1.z.number(),
        successful: zod_1.z.number(),
        failed: zod_1.z.number(),
        averageTime: zod_1.z.number(),
        errors: zod_1.z.array(zod_1.z.object({
            url: zod_1.z.string(),
            error: zod_1.z.string(),
            category: zod_1.z.string(),
        })),
    }),
    metadata: zod_1.z.object({
        jobId: zod_1.z.string(),
        task: zod_1.z.string(),
        startTime: zod_1.z.string(),
        endTime: zod_1.z.string(),
        duration: zod_1.z.number(),
    }),
});
// Error types for task operations
class TaskError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'TaskError';
    }
}
exports.TaskError = TaskError;
class TaskValidationError extends TaskError {
    constructor(message, validationErrors) {
        super(message, 'VALIDATION_ERROR', { validationErrors });
        this.validationErrors = validationErrors;
        this.name = 'TaskValidationError';
    }
}
exports.TaskValidationError = TaskValidationError;
class TaskExecutionError extends TaskError {
    constructor(message, originalError) {
        super(message, 'EXECUTION_ERROR', { originalError });
        this.originalError = originalError;
        this.name = 'TaskExecutionError';
    }
}
exports.TaskExecutionError = TaskExecutionError;
class TaskNotFoundError extends TaskError {
    constructor(taskName) {
        super(`Task not found: ${taskName}`, 'TASK_NOT_FOUND', { taskName });
        this.name = 'TaskNotFoundError';
    }
}
exports.TaskNotFoundError = TaskNotFoundError;
// Type guards for runtime checking
function isScrapeTask(obj) {
    return (obj &&
        typeof obj.name === 'string' &&
        obj.input &&
        obj.output &&
        typeof obj.run === 'function');
}
//# sourceMappingURL=types.js.map