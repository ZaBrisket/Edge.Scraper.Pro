/**
 * Core Types and Interfaces
 * Defines the standard interfaces for the modular task architecture
 */

import { z } from 'zod';

// Task Context - shared context object provided to all tasks
export interface TaskContext {
  http: any; // HTTP client instance
  storage: any; // Storage abstraction
  logger: any; // Logger instance
  rateLimiter: any; // Rate limiter instance
  config: any; // Configuration object - using any for now to avoid complex typing
  jobId?: string; // Optional job ID for tracking
  correlationId?: string; // Optional correlation ID for tracing
}

// Core ScrapeTask interface that all tasks must implement
export interface ScrapeTask<I, O> {
  name: string;
  input: z.ZodSchema<I>;
  output: z.ZodSchema<O>;
  run(payload: I, ctx: TaskContext): Promise<O>;
}

// Task execution result wrapper
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

// Common input schemas for reuse across tasks
export const UrlListSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z.object({
    concurrency: z.number().min(1).max(20).optional().default(3),
    delayMs: z.number().min(0).max(10000).optional().default(1000),
    timeout: z.number().min(1000).max(60000).optional().default(30000),
    maxRetries: z.number().min(0).max(5).optional().default(3),
  }).optional().default({}),
});

// Common output schemas
export const StandardOutputSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  metadata: z.object({
    url: z.string(),
    extractedAt: z.string(),
    processingTime: z.number(),
    task: z.string(),
    version: z.string(),
  }),
});

export const BatchOutputSchema = z.object({
  results: z.array(StandardOutputSchema),
  summary: z.object({
    total: z.number(),
    successful: z.number(),
    failed: z.number(),
    averageTime: z.number(),
    errors: z.array(z.object({
      url: z.string(),
      error: z.string(),
      category: z.string(),
    })),
  }),
  metadata: z.object({
    jobId: z.string(),
    task: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    duration: z.number(),
  }),
});

// Error types for task operations
export class TaskError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'TaskError';
  }
}

export class TaskValidationError extends TaskError {
  constructor(message: string, public readonly validationErrors: string[]) {
    super(message, 'VALIDATION_ERROR', { validationErrors });
    this.name = 'TaskValidationError';
  }
}

export class TaskExecutionError extends TaskError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'EXECUTION_ERROR', { originalError });
    this.name = 'TaskExecutionError';
  }
}

export class TaskNotFoundError extends TaskError {
  constructor(taskName: string) {
    super(`Task not found: ${taskName}`, 'TASK_NOT_FOUND', { taskName });
    this.name = 'TaskNotFoundError';
  }
}

// Type guards for runtime checking
export function isScrapeTask(obj: any): obj is ScrapeTask<any, any> {
  return (
    obj &&
    typeof obj.name === 'string' &&
    obj.input &&
    obj.output &&
    typeof obj.run === 'function'
  );
}

// Task registry entry with metadata
export interface TaskRegistryEntry {
  task: ScrapeTask<any, any>;
  registered: Date;
  lastUsed?: Date;
  usageCount: number;
  enabled: boolean;
}

// Configuration interface
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