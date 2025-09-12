"use strict";
/**
 * Centralized Error Handling Middleware
 * Provides consistent error responses across all API endpoints
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createError = exports.ErrorHandler = exports.ErrorCodes = exports.APIError = void 0;
const zod_1 = require("zod");
class APIError extends Error {
    constructor(code, message, statusCode = 500, details) {
        super(message);
        this.name = 'APIError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.APIError = APIError;
// Predefined error types
exports.ErrorCodes = {
    // Authentication errors
    AUTHENTICATION_REQUIRED: 'authentication_required',
    INVALID_TOKEN: 'invalid_token',
    TOKEN_EXPIRED: 'token_expired',
    INSUFFICIENT_PERMISSIONS: 'insufficient_permissions',
    // Validation errors
    VALIDATION_FAILED: 'validation_failed',
    INVALID_INPUT: 'invalid_input',
    MISSING_REQUIRED_FIELD: 'missing_required_field',
    // Resource errors
    RESOURCE_NOT_FOUND: 'resource_not_found',
    RESOURCE_ALREADY_EXISTS: 'resource_already_exists',
    RESOURCE_CONFLICT: 'resource_conflict',
    // File upload errors
    FILE_TOO_LARGE: 'file_too_large',
    INVALID_FILE_TYPE: 'invalid_file_type',
    UPLOAD_FAILED: 'upload_failed',
    // Scraping errors
    URL_BLOCKED: 'url_blocked',
    SCRAPING_FAILED: 'scraping_failed',
    RATE_LIMITED: 'rate_limited',
    // System errors
    INTERNAL_ERROR: 'internal_error',
    SERVICE_UNAVAILABLE: 'service_unavailable',
    DATABASE_ERROR: 'database_error',
    EXTERNAL_SERVICE_ERROR: 'external_service_error'
};
class ErrorHandler {
    /**
     * Handle different types of errors and return appropriate API responses
     */
    static handleError(error) {
        // APIError instances
        if (error instanceof APIError) {
            return {
                statusCode: error.statusCode,
                body: {
                    error: {
                        code: error.code,
                        message: error.message,
                        ...(error.details && { details: error.details })
                    }
                }
            };
        }
        // Zod validation errors
        if (error instanceof zod_1.ZodError) {
            const formattedErrors = error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code
            }));
            return {
                statusCode: 400,
                body: {
                    error: {
                        code: exports.ErrorCodes.VALIDATION_FAILED,
                        message: 'Validation failed',
                        details: formattedErrors
                    }
                }
            };
        }
        // Prisma errors
        if (error.code && error.meta) {
            switch (error.code) {
                case 'P2002':
                    return {
                        statusCode: 409,
                        body: {
                            error: {
                                code: exports.ErrorCodes.RESOURCE_ALREADY_EXISTS,
                                message: 'Resource already exists',
                                details: error.meta
                            }
                        }
                    };
                case 'P2025':
                    return {
                        statusCode: 404,
                        body: {
                            error: {
                                code: exports.ErrorCodes.RESOURCE_NOT_FOUND,
                                message: 'Resource not found',
                                details: error.meta
                            }
                        }
                    };
                default:
                    return {
                        statusCode: 500,
                        body: {
                            error: {
                                code: exports.ErrorCodes.DATABASE_ERROR,
                                message: 'Database error occurred',
                                details: process.env.NODE_ENV === 'development' ? error : undefined
                            }
                        }
                    };
            }
        }
        // JWT errors
        if (error.name === 'JsonWebTokenError') {
            return {
                statusCode: 401,
                body: {
                    error: {
                        code: exports.ErrorCodes.INVALID_TOKEN,
                        message: 'Invalid token'
                    }
                }
            };
        }
        if (error.name === 'TokenExpiredError') {
            return {
                statusCode: 401,
                body: {
                    error: {
                        code: exports.ErrorCodes.TOKEN_EXPIRED,
                        message: 'Token has expired'
                    }
                }
            };
        }
        // Network/HTTP errors
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return {
                statusCode: 503,
                body: {
                    error: {
                        code: exports.ErrorCodes.SERVICE_UNAVAILABLE,
                        message: 'External service unavailable'
                    }
                }
            };
        }
        // Rate limiting errors
        if (error.message && error.message.includes('rate limit')) {
            return {
                statusCode: 429,
                body: {
                    error: {
                        code: exports.ErrorCodes.RATE_LIMITED,
                        message: 'Rate limit exceeded'
                    }
                }
            };
        }
        // Default internal server error
        return {
            statusCode: 500,
            body: {
                error: {
                    code: exports.ErrorCodes.INTERNAL_ERROR,
                    message: 'Internal server error',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined
                }
            }
        };
    }
    /**
     * Create a standardized error response
     */
    static createErrorResponse(code, message, statusCode = 500, details) {
        return {
            statusCode,
            body: {
                error: {
                    code,
                    message,
                    ...(details && { details })
                }
            }
        };
    }
    /**
     * Log error for monitoring/debugging
     */
    static logError(error, context) {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            code: error.code,
            statusCode: error.statusCode,
            context,
            timestamp: new Date().toISOString()
        };
        // In production, you might want to send this to a logging service
        console.error('API Error:', JSON.stringify(errorInfo, null, 2));
    }
    /**
     * Middleware wrapper for error handling
     */
    static wrap(handler) {
        return async (event, context) => {
            try {
                return await handler(event, context);
            }
            catch (error) {
                ErrorHandler.logError(error, { event, context });
                const errorResponse = ErrorHandler.handleError(error);
                return {
                    ...errorResponse,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
                    }
                };
            }
        };
    }
}
exports.ErrorHandler = ErrorHandler;
// Convenience functions for common errors
exports.createError = {
    authenticationRequired: () => new APIError(exports.ErrorCodes.AUTHENTICATION_REQUIRED, 'Authentication required', 401),
    invalidToken: () => new APIError(exports.ErrorCodes.INVALID_TOKEN, 'Invalid or expired token', 401),
    insufficientPermissions: (required) => new APIError(exports.ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions', 403, required ? { required } : undefined),
    validationFailed: (details) => new APIError(exports.ErrorCodes.VALIDATION_FAILED, 'Validation failed', 400, details),
    resourceNotFound: (resource) => new APIError(exports.ErrorCodes.RESOURCE_NOT_FOUND, `${resource} not found`, 404),
    resourceAlreadyExists: (resource) => new APIError(exports.ErrorCodes.RESOURCE_ALREADY_EXISTS, `${resource} already exists`, 409),
    fileTooLarge: (maxSize) => new APIError(exports.ErrorCodes.FILE_TOO_LARGE, `File size exceeds ${maxSize} bytes`, 413),
    invalidFileType: (allowedTypes) => new APIError(exports.ErrorCodes.INVALID_FILE_TYPE, 'Invalid file type', 400, { allowedTypes }),
    urlBlocked: (reason) => new APIError(exports.ErrorCodes.URL_BLOCKED, `URL blocked: ${reason}`, 400),
    rateLimited: (retryAfter) => new APIError(exports.ErrorCodes.RATE_LIMITED, 'Rate limit exceeded', 429, retryAfter ? { retryAfter } : undefined),
    internalError: (message = 'Internal server error') => new APIError(exports.ErrorCodes.INTERNAL_ERROR, message, 500)
};
//# sourceMappingURL=error-handler.js.map