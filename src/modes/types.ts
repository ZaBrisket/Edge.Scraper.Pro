/**
 * Mode Registry Types and Contracts
 * Defines the standard interface for pluggable scraping modes
 */

import { z } from 'zod';

// Context provided to mode execution
export interface ModeContext {
  jobId: string;
  correlationId: string;
  logger: any;
  httpClient: any;
  structuredLogger?: any;
  abortSignal?: AbortSignal;
}

// UI configuration hints for mode presentation
export interface ModeUIHints {
  inputType: 'urls' | 'file' | 'text' | 'mixed';
  supportsBatch: boolean;
  supportsProgress: boolean;
  estimatedTimePerUrl?: number; // milliseconds
  maxBatchSize?: number;
  fileFormats?: string[]; // e.g., ['txt', 'csv', 'json']
  placeholder?: string;
  helpText?: string;
  examples?: string[];
}

// Core mode contract that all modes must implement
export interface ModeContract {
  // Identification
  id: string;
  label: string;
  description?: string;
  version: string;

  // Validation schemas
  inputSchema: z.ZodSchema<any>;
  outputSchema: z.ZodSchema<any>;

  // UI configuration
  uiHints: ModeUIHints;

  // Execution function
  run(input: any, ctx: ModeContext): Promise<any>;

  // Optional validation function for pre-processing
  validate?(input: any): Promise<{ valid: boolean; errors?: string[] }>;

  // Optional transformation function for post-processing
  transform?(output: any, input: any): Promise<any>;
}

// Registry entry with metadata
export interface ModeRegistryEntry {
  mode: ModeContract;
  registered: Date;
  lastUsed?: Date;
  usageCount: number;
  enabled: boolean;
}

// Common input schemas for reuse
export const UrlListSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z
    .object({
      concurrency: z.number().min(1).max(20).optional().default(3),
      delayMs: z.number().min(0).max(10000).optional().default(1000),
      timeout: z.number().min(1000).max(60000).optional().default(30000),
      maxRetries: z.number().min(0).max(5).optional().default(3),
    })
    .optional()
    .default({}),
});

export const FileInputSchema = z.object({
  content: z.string(),
  filename: z.string(),
  contentType: z.string(),
  options: z
    .object({
      concurrency: z.number().min(1).max(20).optional().default(3),
      delayMs: z.number().min(0).max(10000).optional().default(1000),
      timeout: z.number().min(1000).max(60000).optional().default(30000),
      maxRetries: z.number().min(0).max(5).optional().default(3),
    })
    .optional()
    .default({}),
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
    mode: z.string(),
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
    errors: z.array(
      z.object({
        url: z.string(),
        error: z.string(),
        category: z.string(),
      })
    ),
  }),
  metadata: z.object({
    jobId: z.string(),
    mode: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    duration: z.number(),
  }),
});

// Error types for mode operations
export class ModeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ModeError';
  }
}

export class ModeValidationError extends ModeError {
  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(message, 'VALIDATION_ERROR', { validationErrors });
    this.name = 'ModeValidationError';
  }
}

export class ModeExecutionError extends ModeError {
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message, 'EXECUTION_ERROR', { originalError });
    this.name = 'ModeExecutionError';
  }
}

export class ModeNotFoundError extends ModeError {
  constructor(modeId: string) {
    super(`Mode not found: ${modeId}`, 'MODE_NOT_FOUND', { modeId });
    this.name = 'ModeNotFoundError';
  }
}

// Type guards for runtime checking
export function isModeContract(obj: any): obj is ModeContract {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.label === 'string' &&
    typeof obj.version === 'string' &&
    obj.inputSchema &&
    obj.outputSchema &&
    obj.uiHints &&
    typeof obj.run === 'function'
  );
}

export function isModeRegistryEntry(obj: any): obj is ModeRegistryEntry {
  return (
    obj &&
    isModeContract(obj.mode) &&
    obj.registered instanceof Date &&
    typeof obj.usageCount === 'number' &&
    typeof obj.enabled === 'boolean'
  );
}
