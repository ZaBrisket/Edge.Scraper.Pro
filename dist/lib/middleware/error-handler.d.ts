/**
 * Centralized Error Handling Middleware
 * Provides consistent error responses across all API endpoints
 */
export declare class APIError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details?: any;
    constructor(code: string, message: string, statusCode?: number, details?: any);
}
export declare const ErrorCodes: {
    readonly AUTHENTICATION_REQUIRED: "authentication_required";
    readonly INVALID_TOKEN: "invalid_token";
    readonly TOKEN_EXPIRED: "token_expired";
    readonly INSUFFICIENT_PERMISSIONS: "insufficient_permissions";
    readonly VALIDATION_FAILED: "validation_failed";
    readonly INVALID_INPUT: "invalid_input";
    readonly MISSING_REQUIRED_FIELD: "missing_required_field";
    readonly RESOURCE_NOT_FOUND: "resource_not_found";
    readonly RESOURCE_ALREADY_EXISTS: "resource_already_exists";
    readonly RESOURCE_CONFLICT: "resource_conflict";
    readonly FILE_TOO_LARGE: "file_too_large";
    readonly INVALID_FILE_TYPE: "invalid_file_type";
    readonly UPLOAD_FAILED: "upload_failed";
    readonly URL_BLOCKED: "url_blocked";
    readonly SCRAPING_FAILED: "scraping_failed";
    readonly RATE_LIMITED: "rate_limited";
    readonly INTERNAL_ERROR: "internal_error";
    readonly SERVICE_UNAVAILABLE: "service_unavailable";
    readonly DATABASE_ERROR: "database_error";
    readonly EXTERNAL_SERVICE_ERROR: "external_service_error";
};
export declare class ErrorHandler {
    /**
     * Handle different types of errors and return appropriate API responses
     */
    static handleError(error: any): {
        statusCode: number;
        body: any;
    };
    /**
     * Create a standardized error response
     */
    static createErrorResponse(code: string, message: string, statusCode?: number, details?: any): {
        statusCode: number;
        body: any;
    };
    /**
     * Log error for monitoring/debugging
     */
    static logError(error: any, context?: any): void;
    /**
     * Middleware wrapper for error handling
     */
    static wrap(handler: Function): (event: any, context: any) => Promise<any>;
}
export declare const createError: {
    authenticationRequired: () => APIError;
    invalidToken: () => APIError;
    insufficientPermissions: (required?: string[]) => APIError;
    validationFailed: (details: any) => APIError;
    resourceNotFound: (resource: string) => APIError;
    resourceAlreadyExists: (resource: string) => APIError;
    fileTooLarge: (maxSize: number) => APIError;
    invalidFileType: (allowedTypes: string[]) => APIError;
    urlBlocked: (reason: string) => APIError;
    rateLimited: (retryAfter?: number) => APIError;
    internalError: (message?: string) => APIError;
};
//# sourceMappingURL=error-handler.d.ts.map