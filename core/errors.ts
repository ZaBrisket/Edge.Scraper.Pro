/**
 * Error Handling Utilities
 * Centralized error handling and custom error types
 */

import { TaskError, TaskValidationError, TaskExecutionError, TaskNotFoundError } from './types';

export class CoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'CoreError';
  }
}

export class ConfigurationError extends CoreError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

export class HttpError extends CoreError {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly url?: string,
    details?: any
  ) {
    super(message, 'HTTP_ERROR', { ...details, status, url });
    this.name = 'HttpError';
  }
}

export class RateLimitError extends CoreError {
  constructor(message: string, public readonly retryAfter?: number, details?: any) {
    super(message, 'RATE_LIMIT_ERROR', { ...details, retryAfter });
    this.name = 'RateLimitError';
  }
}

export class StorageError extends CoreError {
  constructor(message: string, public readonly operation?: string, details?: any) {
    super(message, 'STORAGE_ERROR', { ...details, operation });
    this.name = 'StorageError';
  }
}

export class ValidationError extends CoreError {
  constructor(
    message: string,
    public readonly validationErrors: string[],
    details?: any
  ) {
    super(message, 'VALIDATION_ERROR', { ...details, validationErrors });
    this.name = 'ValidationError';
  }
}

export class TimeoutError extends CoreError {
  constructor(message: string, public readonly timeout?: number, details?: any) {
    super(message, 'TIMEOUT_ERROR', { ...details, timeout });
    this.name = 'TimeoutError';
  }
}

// Error handler utility
export class ErrorHandler {
  static handle(error: unknown): CoreError {
    if (error instanceof CoreError) {
      return error;
    }

    if (error instanceof Error) {
      return new CoreError(error.message, 'UNKNOWN_ERROR', {
        originalError: error.name,
        stack: error.stack,
      });
    }

    return new CoreError('Unknown error occurred', 'UNKNOWN_ERROR', {
      originalError: String(error),
    });
  }

  static isRetryable(error: CoreError): boolean {
    const retryableCodes = [
      'HTTP_ERROR',
      'RATE_LIMIT_ERROR',
      'TIMEOUT_ERROR',
      'STORAGE_ERROR',
    ];

    return retryableCodes.includes(error.code);
  }

  static getRetryDelay(error: CoreError, attempt: number): number {
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }

    if (error instanceof HttpError && error.status === 429) {
      return Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff, max 30s
    }

    if (error instanceof TimeoutError) {
      return Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
    }

    // Default exponential backoff
    return Math.min(1000 * Math.pow(2, attempt), 5000);
  }

  static formatForLogging(error: CoreError): Record<string, any> {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details,
      stack: error.stack,
    };
  }
}

// Error factory functions
export function createHttpError(message: string, status?: number, url?: string, details?: any): HttpError {
  return new HttpError(message, status, url, details);
}

export function createRateLimitError(message: string, retryAfter?: number, details?: any): RateLimitError {
  return new RateLimitError(message, retryAfter, details);
}

export function createStorageError(message: string, operation?: string, details?: any): StorageError {
  return new StorageError(message, operation, details);
}

export function createValidationError(message: string, validationErrors: string[], details?: any): ValidationError {
  return new ValidationError(message, validationErrors, details);
}

export function createTimeoutError(message: string, timeout?: number, details?: any): TimeoutError {
  return new TimeoutError(message, timeout, details);
}