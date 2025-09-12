/**
 * Error Handling Utilities
 * Centralized error handling and custom error types
 */
export declare class CoreError extends Error {
    readonly code: string;
    readonly details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
export declare class ConfigurationError extends CoreError {
    constructor(message: string, details?: any);
}
export declare class HttpError extends CoreError {
    readonly status?: number | undefined;
    readonly url?: string | undefined;
    constructor(message: string, status?: number | undefined, url?: string | undefined, details?: any);
}
export declare class RateLimitError extends CoreError {
    readonly retryAfter?: number | undefined;
    constructor(message: string, retryAfter?: number | undefined, details?: any);
}
export declare class StorageError extends CoreError {
    readonly operation?: string | undefined;
    constructor(message: string, operation?: string | undefined, details?: any);
}
export declare class ValidationError extends CoreError {
    readonly validationErrors: string[];
    constructor(message: string, validationErrors: string[], details?: any);
}
export declare class TimeoutError extends CoreError {
    readonly timeout?: number | undefined;
    constructor(message: string, timeout?: number | undefined, details?: any);
}
export declare class ErrorHandler {
    static handle(error: unknown): CoreError;
    static isRetryable(error: CoreError): boolean;
    static getRetryDelay(error: CoreError, attempt: number): number;
    static formatForLogging(error: CoreError): Record<string, any>;
}
export declare function createHttpError(message: string, status?: number, url?: string, details?: any): HttpError;
export declare function createRateLimitError(message: string, retryAfter?: number, details?: any): RateLimitError;
export declare function createStorageError(message: string, operation?: string, details?: any): StorageError;
export declare function createValidationError(message: string, validationErrors: string[], details?: any): ValidationError;
export declare function createTimeoutError(message: string, timeout?: number, details?: any): TimeoutError;
//# sourceMappingURL=errors.d.ts.map