/**
 * Core Types and Interfaces
 * Defines the standard interfaces for the modular task architecture
 */
import { z } from 'zod';
export interface TaskContext {
    http: any;
    storage: any;
    logger: any;
    rateLimiter: any;
    config: Record<string, unknown>;
    jobId?: string;
    correlationId?: string;
}
export interface ScrapeTask<I, O> {
    name: string;
    input: z.ZodSchema<I>;
    output: z.ZodSchema<O>;
    run(payload: I, ctx: TaskContext): Promise<O>;
}
export interface TaskResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: {
        taskName: string;
        requestId: string;
        targetHost?: string;
        retries: number;
        rateLimitHit: boolean;
        duration_ms: number;
        item_count: number;
    };
}
export declare const UrlListSchema: z.ZodObject<{
    urls: z.ZodArray<z.ZodString, "many">;
    options: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        concurrency: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        delayMs: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        maxRetries: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        timeout: number;
        maxRetries: number;
        concurrency: number;
        delayMs: number;
    }, {
        timeout?: number | undefined;
        maxRetries?: number | undefined;
        concurrency?: number | undefined;
        delayMs?: number | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    options: {
        timeout: number;
        maxRetries: number;
        concurrency: number;
        delayMs: number;
    };
    urls: string[];
}, {
    urls: string[];
    options?: {
        timeout?: number | undefined;
        maxRetries?: number | undefined;
        concurrency?: number | undefined;
        delayMs?: number | undefined;
    } | undefined;
}>;
export declare const StandardOutputSchema: z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<z.ZodAny>;
    error: z.ZodOptional<z.ZodString>;
    metadata: z.ZodObject<{
        url: z.ZodString;
        extractedAt: z.ZodString;
        processingTime: z.ZodNumber;
        task: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        url: string;
        extractedAt: string;
        task: string;
        version: string;
        processingTime: number;
    }, {
        url: string;
        extractedAt: string;
        task: string;
        version: string;
        processingTime: number;
    }>;
}, "strip", z.ZodTypeAny, {
    metadata: {
        url: string;
        extractedAt: string;
        task: string;
        version: string;
        processingTime: number;
    };
    success: boolean;
    error?: string | undefined;
    data?: any;
}, {
    metadata: {
        url: string;
        extractedAt: string;
        task: string;
        version: string;
        processingTime: number;
    };
    success: boolean;
    error?: string | undefined;
    data?: any;
}>;
export declare const BatchOutputSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        success: z.ZodBoolean;
        data: z.ZodOptional<z.ZodAny>;
        error: z.ZodOptional<z.ZodString>;
        metadata: z.ZodObject<{
            url: z.ZodString;
            extractedAt: z.ZodString;
            processingTime: z.ZodNumber;
            task: z.ZodString;
            version: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            url: string;
            extractedAt: string;
            task: string;
            version: string;
            processingTime: number;
        }, {
            url: string;
            extractedAt: string;
            task: string;
            version: string;
            processingTime: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        metadata: {
            url: string;
            extractedAt: string;
            task: string;
            version: string;
            processingTime: number;
        };
        success: boolean;
        error?: string | undefined;
        data?: any;
    }, {
        metadata: {
            url: string;
            extractedAt: string;
            task: string;
            version: string;
            processingTime: number;
        };
        success: boolean;
        error?: string | undefined;
        data?: any;
    }>, "many">;
    summary: z.ZodObject<{
        total: z.ZodNumber;
        successful: z.ZodNumber;
        failed: z.ZodNumber;
        averageTime: z.ZodNumber;
        errors: z.ZodArray<z.ZodObject<{
            url: z.ZodString;
            error: z.ZodString;
            category: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            error: string;
            url: string;
            category: string;
        }, {
            error: string;
            url: string;
            category: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        total: number;
        successful: number;
        failed: number;
        averageTime: number;
        errors: {
            error: string;
            url: string;
            category: string;
        }[];
    }, {
        total: number;
        successful: number;
        failed: number;
        averageTime: number;
        errors: {
            error: string;
            url: string;
            category: string;
        }[];
    }>;
    metadata: z.ZodObject<{
        jobId: z.ZodString;
        task: z.ZodString;
        startTime: z.ZodString;
        endTime: z.ZodString;
        duration: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        duration: number;
        jobId: string;
        task: string;
        startTime: string;
        endTime: string;
    }, {
        duration: number;
        jobId: string;
        task: string;
        startTime: string;
        endTime: string;
    }>;
}, "strip", z.ZodTypeAny, {
    summary: {
        total: number;
        successful: number;
        failed: number;
        averageTime: number;
        errors: {
            error: string;
            url: string;
            category: string;
        }[];
    };
    metadata: {
        duration: number;
        jobId: string;
        task: string;
        startTime: string;
        endTime: string;
    };
    results: {
        metadata: {
            url: string;
            extractedAt: string;
            task: string;
            version: string;
            processingTime: number;
        };
        success: boolean;
        error?: string | undefined;
        data?: any;
    }[];
}, {
    summary: {
        total: number;
        successful: number;
        failed: number;
        averageTime: number;
        errors: {
            error: string;
            url: string;
            category: string;
        }[];
    };
    metadata: {
        duration: number;
        jobId: string;
        task: string;
        startTime: string;
        endTime: string;
    };
    results: {
        metadata: {
            url: string;
            extractedAt: string;
            task: string;
            version: string;
            processingTime: number;
        };
        success: boolean;
        error?: string | undefined;
        data?: any;
    }[];
}>;
export declare class TaskError extends Error {
    readonly code: string;
    readonly details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
export declare class TaskValidationError extends TaskError {
    readonly validationErrors: string[];
    constructor(message: string, validationErrors: string[]);
}
export declare class TaskExecutionError extends TaskError {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
export declare class TaskNotFoundError extends TaskError {
    constructor(taskName: string);
}
export declare function isScrapeTask(obj: any): obj is ScrapeTask<any, any>;
export interface TaskRegistryEntry {
    task: ScrapeTask<any, any>;
    registered: Date;
    lastUsed?: Date;
    usageCount: number;
    enabled: boolean;
}
export interface CoreConfig {
    http: {
        timeout: number;
        maxRetries: number;
        userAgent: string;
    };
    rateLimit: {
        requestsPerMinute: number;
        burstLimit: number;
    };
    storage: {
        type: 'memory' | 'redis' | 'database';
        config: Record<string, any>;
    };
    logging: {
        level: 'debug' | 'info' | 'warn' | 'error';
        format: 'json' | 'text';
    };
}
//# sourceMappingURL=types.d.ts.map