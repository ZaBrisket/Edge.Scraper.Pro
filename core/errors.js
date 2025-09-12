"use strict";
/**
 * Error Handling Utilities
 * Centralized error handling and custom error types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.TimeoutError = exports.ValidationError = exports.StorageError = exports.RateLimitError = exports.HttpError = exports.ConfigurationError = exports.CoreError = void 0;
exports.createHttpError = createHttpError;
exports.createRateLimitError = createRateLimitError;
exports.createStorageError = createStorageError;
exports.createValidationError = createValidationError;
exports.createTimeoutError = createTimeoutError;
class CoreError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'CoreError';
    }
}
exports.CoreError = CoreError;
class ConfigurationError extends CoreError {
    constructor(message, details) {
        super(message, 'CONFIGURATION_ERROR', details);
        this.name = 'ConfigurationError';
    }
}
exports.ConfigurationError = ConfigurationError;
class HttpError extends CoreError {
    constructor(message, status, url, details) {
        super(message, 'HTTP_ERROR', { ...details, status, url });
        this.status = status;
        this.url = url;
        this.name = 'HttpError';
    }
}
exports.HttpError = HttpError;
class RateLimitError extends CoreError {
    constructor(message, retryAfter, details) {
        super(message, 'RATE_LIMIT_ERROR', { ...details, retryAfter });
        this.retryAfter = retryAfter;
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
class StorageError extends CoreError {
    constructor(message, operation, details) {
        super(message, 'STORAGE_ERROR', { ...details, operation });
        this.operation = operation;
        this.name = 'StorageError';
    }
}
exports.StorageError = StorageError;
class ValidationError extends CoreError {
    constructor(message, validationErrors, details) {
        super(message, 'VALIDATION_ERROR', { ...details, validationErrors });
        this.validationErrors = validationErrors;
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class TimeoutError extends CoreError {
    constructor(message, timeout, details) {
        super(message, 'TIMEOUT_ERROR', { ...details, timeout });
        this.timeout = timeout;
        this.name = 'TimeoutError';
    }
}
exports.TimeoutError = TimeoutError;
// Error handler utility
class ErrorHandler {
    static handle(error) {
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
    static isRetryable(error) {
        const retryableCodes = [
            'HTTP_ERROR',
            'RATE_LIMIT_ERROR',
            'TIMEOUT_ERROR',
            'STORAGE_ERROR',
        ];
        return retryableCodes.includes(error.code);
    }
    static getRetryDelay(error, attempt) {
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
    static formatForLogging(error) {
        return {
            name: error.name,
            message: error.message,
            code: error.code,
            details: error.details,
            stack: error.stack,
        };
    }
}
exports.ErrorHandler = ErrorHandler;
// Error factory functions
function createHttpError(message, status, url, details) {
    return new HttpError(message, status, url, details);
}
function createRateLimitError(message, retryAfter, details) {
    return new RateLimitError(message, retryAfter, details);
}
function createStorageError(message, operation, details) {
    return new StorageError(message, operation, details);
}
function createValidationError(message, validationErrors, details) {
    return new ValidationError(message, validationErrors, details);
}
function createTimeoutError(message, timeout, details) {
    return new TimeoutError(message, timeout, details);
}
//# sourceMappingURL=errors.js.map