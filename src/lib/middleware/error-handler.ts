/**
 * Centralized Error Handling Middleware
 * Provides consistent error responses across all API endpoints
 */

import { ZodError } from 'zod';

export class APIError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(code: string, message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Predefined error types
export const ErrorCodes = {
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
} as const;

export class ErrorHandler {
  /**
   * Handle different types of errors and return appropriate API responses
   */
  static handleError(error: any): { statusCode: number; body: any } {
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
    if (error instanceof ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));

      return {
        statusCode: 400,
        body: {
          error: {
            code: ErrorCodes.VALIDATION_FAILED,
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
                code: ErrorCodes.RESOURCE_ALREADY_EXISTS,
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
                code: ErrorCodes.RESOURCE_NOT_FOUND,
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
                code: ErrorCodes.DATABASE_ERROR,
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
            code: ErrorCodes.INVALID_TOKEN,
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
            code: ErrorCodes.TOKEN_EXPIRED,
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
            code: ErrorCodes.SERVICE_UNAVAILABLE,
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
            code: ErrorCodes.RATE_LIMITED,
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
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Internal server error',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      }
    };
  }

  /**
   * Create a standardized error response
   */
  static createErrorResponse(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: any
  ): { statusCode: number; body: any } {
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
  static logError(error: any, context?: any): void {
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
  static wrap(handler: Function) {
    return async (event: any, context: any) => {
      try {
        return await handler(event, context);
      } catch (error) {
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

// Convenience functions for common errors
export const createError = {
  authenticationRequired: () => new APIError(
    ErrorCodes.AUTHENTICATION_REQUIRED,
    'Authentication required',
    401
  ),
  
  invalidToken: () => new APIError(
    ErrorCodes.INVALID_TOKEN,
    'Invalid or expired token',
    401
  ),
  
  insufficientPermissions: (required?: string[]) => new APIError(
    ErrorCodes.INSUFFICIENT_PERMISSIONS,
    'Insufficient permissions',
    403,
    required ? { required } : undefined
  ),
  
  validationFailed: (details: any) => new APIError(
    ErrorCodes.VALIDATION_FAILED,
    'Validation failed',
    400,
    details
  ),
  
  resourceNotFound: (resource: string) => new APIError(
    ErrorCodes.RESOURCE_NOT_FOUND,
    `${resource} not found`,
    404
  ),
  
  resourceAlreadyExists: (resource: string) => new APIError(
    ErrorCodes.RESOURCE_ALREADY_EXISTS,
    `${resource} already exists`,
    409
  ),
  
  fileTooLarge: (maxSize: number) => new APIError(
    ErrorCodes.FILE_TOO_LARGE,
    `File size exceeds ${maxSize} bytes`,
    413
  ),
  
  invalidFileType: (allowedTypes: string[]) => new APIError(
    ErrorCodes.INVALID_FILE_TYPE,
    'Invalid file type',
    400,
    { allowedTypes }
  ),
  
  urlBlocked: (reason: string) => new APIError(
    ErrorCodes.URL_BLOCKED,
    `URL blocked: ${reason}`,
    400
  ),
  
  rateLimited: (retryAfter?: number) => new APIError(
    ErrorCodes.RATE_LIMITED,
    'Rate limit exceeded',
    429,
    retryAfter ? { retryAfter } : undefined
  ),
  
  internalError: (message: string = 'Internal server error') => new APIError(
    ErrorCodes.INTERNAL_ERROR,
    message,
    500
  )
};