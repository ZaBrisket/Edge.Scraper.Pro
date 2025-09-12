"use strict";
/**
 * Centralized Input Validation Utilities
 * Provides comprehensive validation schemas and utilities for all API endpoints
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemas = exports.ValidationUtils = exports.templateSchemas = exports.targetListSchemas = exports.authSchemas = exports.scrapingSchemas = exports.commonPatterns = void 0;
const zod_1 = require("zod");
// Common validation patterns
exports.commonPatterns = {
    // URL validation
    url: zod_1.z.string().url('Invalid URL format'),
    // Email validation
    email: zod_1.z.string().email('Invalid email format'),
    // Password validation (8+ chars, at least one letter and one number)
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one number'),
    // CUID validation (Prisma default)
    cuid: zod_1.z.string().cuid('Invalid ID format'),
    // File size validation (in bytes)
    fileSize: zod_1.z
        .number()
        .int()
        .min(1)
        .max(50 * 1024 * 1024), // 50MB max
    // Content type validation
    contentType: zod_1.z.enum([
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
    ]),
    // User role validation
    userRole: zod_1.z.enum(['admin', 'user', 'readonly']),
    // Job status validation
    jobStatus: zod_1.z.enum(['queued', 'processing', 'completed', 'failed']),
    // Export format validation
    exportFormat: zod_1.z.enum(['xlsx', 'pdf']),
    // Theme validation
    theme: zod_1.z.enum(['utss-2025', 'default']),
    // Pagination validation
    pagination: zod_1.z.object({
        page: zod_1.z.number().int().min(1).default(1),
        limit: zod_1.z.number().int().min(1).max(100).default(20),
        sortBy: zod_1.z.string().optional(),
        sortOrder: zod_1.z.enum(['asc', 'desc']).default('desc'),
    }),
};
// Scraping API validation schemas
exports.scrapingSchemas = {
    // Single URL scraping
    singleUrl: zod_1.z.object({
        url: exports.commonPatterns.url,
        options: zod_1.z
            .object({
            timeout: zod_1.z.number().int().min(1000).max(300000).optional(),
            followRedirects: zod_1.z.boolean().optional(),
            userAgent: zod_1.z.string().max(500).optional(),
        })
            .optional(),
    }),
    // Batch URL scraping
    batchUrls: zod_1.z.object({
        urls: zod_1.z.array(exports.commonPatterns.url).min(1).max(1000),
        options: zod_1.z
            .object({
            concurrency: zod_1.z.number().int().min(1).max(10).optional(),
            delayMs: zod_1.z.number().int().min(0).max(60000).optional(),
            timeout: zod_1.z.number().int().min(1000).max(300000).optional(),
            maxRetries: zod_1.z.number().int().min(0).max(10).optional(),
            extractionMode: zod_1.z.enum(['sports', 'supplier-directory', 'general']).optional(),
            enableUrlNormalization: zod_1.z.boolean().optional(),
            enablePaginationDiscovery: zod_1.z.boolean().optional(),
            enableStructuredLogging: zod_1.z.boolean().optional(),
        })
            .optional(),
    }),
    // URL validation
    urlValidation: zod_1.z.object({
        urls: zod_1.z.array(exports.commonPatterns.url).min(1).max(1000),
    }),
};
// Authentication API validation schemas
exports.authSchemas = {
    // User registration
    register: zod_1.z.object({
        email: exports.commonPatterns.email,
        password: exports.commonPatterns.password,
        name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(100),
        role: exports.commonPatterns.userRole.optional(),
    }),
    // User login
    login: zod_1.z.object({
        email: exports.commonPatterns.email,
        password: zod_1.z.string().min(1, 'Password is required'),
    }),
    // Change password
    changePassword: zod_1.z.object({
        currentPassword: zod_1.z.string().min(1, 'Current password is required'),
        newPassword: exports.commonPatterns.password,
    }),
    // Update profile
    updateProfile: zod_1.z.object({
        name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
        email: exports.commonPatterns.email.optional(),
    }),
};
// Target List API validation schemas
exports.targetListSchemas = {
    // Upload presign request
    uploadPresign: zod_1.z.object({
        filename: zod_1.z.string().min(1, 'Filename is required').max(255),
        contentType: exports.commonPatterns.contentType,
        maxFileSize: zod_1.z
            .number()
            .int()
            .min(1024)
            .max(50 * 1024 * 1024)
            .optional(),
    }),
    // Upload commit request
    uploadCommit: zod_1.z.object({
        s3Key: zod_1.z.string().min(1, 'S3 key is required'),
        datasetName: zod_1.z.string().min(1, 'Dataset name is required').max(255).optional(),
    }),
    // Preview request
    preview: zod_1.z.object({
        datasetId: exports.commonPatterns.cuid,
        templateId: exports.commonPatterns.cuid,
        sampleSize: zod_1.z.number().int().min(1).max(100).default(50),
        customMapping: zod_1.z.record(zod_1.z.string()).optional(),
    }),
    // Export job request
    exportJob: zod_1.z.object({
        datasetId: exports.commonPatterns.cuid,
        templateId: exports.commonPatterns.cuid.optional(),
        format: exports.commonPatterns.exportFormat,
        theme: exports.commonPatterns.theme.optional(),
        customMapping: zod_1.z.record(zod_1.z.string()).optional(),
        idempotencyKey: zod_1.z.string().uuid().optional(),
    }),
    // Job status request
    jobStatus: zod_1.z.object({
        jobId: exports.commonPatterns.cuid,
    }),
    // Artifact download request
    artifactDownload: zod_1.z.object({
        artifactId: exports.commonPatterns.cuid,
    }),
};
// Template API validation schemas
exports.templateSchemas = {
    // Create template
    createTemplate: zod_1.z.object({
        name: zod_1.z.string().min(1, 'Template name is required').max(255),
        version: zod_1.z.string().min(1, 'Version is required').max(50).default('1.0'),
        description: zod_1.z.string().max(1000).optional(),
        sourceHint: zod_1.z.string().max(100).optional(),
        isPublic: zod_1.z.boolean().default(false),
        fieldDefs: zod_1.z
            .array(zod_1.z.object({
            targetField: zod_1.z.string().min(1, 'Target field is required'),
            sourceHeaders: zod_1.z.array(zod_1.z.string()).min(1, 'Source headers are required'),
            transform: zod_1.z.string().optional(),
            required: zod_1.z.boolean().default(false),
            defaultValue: zod_1.z.string().optional(),
        }))
            .min(1, 'At least one field definition is required'),
    }),
    // Update template
    updateTemplate: zod_1.z.object({
        name: zod_1.z.string().min(1, 'Template name is required').max(255).optional(),
        version: zod_1.z.string().min(1, 'Version is required').max(50).optional(),
        description: zod_1.z.string().max(1000).optional(),
        sourceHint: zod_1.z.string().max(100).optional(),
        isPublic: zod_1.z.boolean().optional(),
        fieldDefs: zod_1.z
            .array(zod_1.z.object({
            id: exports.commonPatterns.cuid.optional(),
            targetField: zod_1.z.string().min(1, 'Target field is required'),
            sourceHeaders: zod_1.z.array(zod_1.z.string()).min(1, 'Source headers are required'),
            transform: zod_1.z.string().optional(),
            required: zod_1.z.boolean().default(false),
            defaultValue: zod_1.z.string().optional(),
        }))
            .optional(),
    }),
};
// Validation utility functions
class ValidationUtils {
    /**
     * Validate request body against schema
     */
    static validateBody(schema, data) {
        try {
            return schema.parse(data);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                const formattedErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    code: err.code,
                }));
                throw new Error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
            }
            throw error;
        }
    }
    /**
     * Validate query parameters against schema
     */
    static validateQuery(schema, queryParams) {
        // Convert query params to proper types
        const convertedParams = {};
        for (const [key, value] of Object.entries(queryParams)) {
            if (value === undefined)
                continue;
            // Handle array values
            if (Array.isArray(value)) {
                convertedParams[key] = value;
                continue;
            }
            // Try to convert to number if it looks like a number
            if (/^\d+$/.test(value)) {
                convertedParams[key] = parseInt(value, 10);
                continue;
            }
            // Try to convert to boolean
            if (value === 'true' || value === 'false') {
                convertedParams[key] = value === 'true';
                continue;
            }
            // Keep as string
            convertedParams[key] = value;
        }
        return this.validateBody(schema, convertedParams);
    }
    /**
     * Validate path parameters against schema
     */
    static validatePath(schema, pathParams) {
        return this.validateBody(schema, pathParams);
    }
    /**
     * Sanitize string input to prevent injection attacks
     */
    static sanitizeString(input) {
        return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/['"]/g, '') // Remove quotes
            .replace(/[;\\]/g, '') // Remove semicolons and backslashes
            .trim();
    }
    /**
     * Validate and sanitize file upload
     */
    static validateFileUpload(file) {
        const errors = [];
        // Check file size (50MB max)
        if (file.size > 50 * 1024 * 1024) {
            errors.push('File size exceeds 50MB limit');
        }
        // Check file type
        const allowedTypes = [
            'text/csv',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
        ];
        if (!allowedTypes.includes(file.type)) {
            errors.push('Invalid file type. Only CSV and Excel files are allowed');
        }
        // Check filename
        if (!file.name || file.name.length > 255) {
            errors.push('Invalid filename');
        }
        // Check for dangerous file extensions
        const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
        const hasDangerousExtension = dangerousExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        if (hasDangerousExtension) {
            errors.push('File type not allowed for security reasons');
        }
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
    /**
     * Validate URL for SSRF protection
     */
    static validateUrl(url) {
        const errors = [];
        try {
            const parsedUrl = new URL(url);
            // Check protocol
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                errors.push('Only HTTP and HTTPS protocols are allowed');
            }
            // Check for private IPs (basic SSRF protection)
            const hostname = parsedUrl.hostname;
            if (hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.startsWith('172.')) {
                errors.push('Private IP addresses are not allowed');
            }
            // Check for file protocol
            if (parsedUrl.protocol === 'file:') {
                errors.push('File protocol is not allowed');
            }
            // Check for data protocol
            if (parsedUrl.protocol === 'data:') {
                errors.push('Data protocol is not allowed');
            }
        }
        catch (error) {
            errors.push('Invalid URL format');
        }
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}
exports.ValidationUtils = ValidationUtils;
// Export all schemas for easy access
exports.schemas = {
    common: exports.commonPatterns,
    scraping: exports.scrapingSchemas,
    auth: exports.authSchemas,
    targetList: exports.targetListSchemas,
    template: exports.templateSchemas,
};
//# sourceMappingURL=index.js.map