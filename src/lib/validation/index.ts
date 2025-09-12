/**
 * Centralized Input Validation Utilities
 * Provides comprehensive validation schemas and utilities for all API endpoints
 */

import { z } from 'zod';

// Common validation patterns
export const commonPatterns = {
  // URL validation
  url: z.string().url('Invalid URL format'),

  // Email validation
  email: z.string().email('Invalid email format'),

  // Password validation (8+ chars, at least one letter and one number)
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one number'),

  // CUID validation (Prisma default)
  cuid: z.string().cuid('Invalid ID format'),

  // File size validation (in bytes)
  fileSize: z
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024), // 50MB max

  // Content type validation
  contentType: z.enum([
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ]),

  // User role validation
  userRole: z.enum(['admin', 'user', 'readonly']),

  // Job status validation
  jobStatus: z.enum(['queued', 'processing', 'completed', 'failed']),

  // Export format validation
  exportFormat: z.enum(['xlsx', 'pdf']),

  // Theme validation
  theme: z.enum(['utss-2025', 'default']),

  // Pagination validation
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
};

// Scraping API validation schemas
export const scrapingSchemas = {
  // Single URL scraping
  singleUrl: z.object({
    url: commonPatterns.url,
    options: z
      .object({
        timeout: z.number().int().min(1000).max(300000).optional(),
        followRedirects: z.boolean().optional(),
        userAgent: z.string().max(500).optional(),
      })
      .optional(),
  }),

  // Batch URL scraping
  batchUrls: z.object({
    urls: z.array(commonPatterns.url).min(1).max(1000),
    options: z
      .object({
        concurrency: z.number().int().min(1).max(10).optional(),
        delayMs: z.number().int().min(0).max(60000).optional(),
        timeout: z.number().int().min(1000).max(300000).optional(),
        maxRetries: z.number().int().min(0).max(10).optional(),
        extractionMode: z.enum(['sports', 'supplier-directory', 'general']).optional(),
        enableUrlNormalization: z.boolean().optional(),
        enablePaginationDiscovery: z.boolean().optional(),
        enableStructuredLogging: z.boolean().optional(),
      })
      .optional(),
  }),

  // URL validation
  urlValidation: z.object({
    urls: z.array(commonPatterns.url).min(1).max(1000),
  }),
};

// Authentication API validation schemas
export const authSchemas = {
  // User registration
  register: z.object({
    email: commonPatterns.email,
    password: commonPatterns.password,
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    role: commonPatterns.userRole.optional(),
  }),

  // User login
  login: z.object({
    email: commonPatterns.email,
    password: z.string().min(1, 'Password is required'),
  }),

  // Change password
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: commonPatterns.password,
  }),

  // Update profile
  updateProfile: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
    email: commonPatterns.email.optional(),
  }),
};

// Target List API validation schemas
export const targetListSchemas = {
  // Upload presign request
  uploadPresign: z.object({
    filename: z.string().min(1, 'Filename is required').max(255),
    contentType: commonPatterns.contentType,
    maxFileSize: z
      .number()
      .int()
      .min(1024)
      .max(50 * 1024 * 1024)
      .optional(),
  }),

  // Upload commit request
  uploadCommit: z.object({
    s3Key: z.string().min(1, 'S3 key is required'),
    datasetName: z.string().min(1, 'Dataset name is required').max(255).optional(),
  }),

  // Preview request
  preview: z.object({
    datasetId: commonPatterns.cuid,
    templateId: commonPatterns.cuid,
    sampleSize: z.number().int().min(1).max(100).default(50),
    customMapping: z.record(z.string()).optional(),
  }),

  // Export job request
  exportJob: z.object({
    datasetId: commonPatterns.cuid,
    templateId: commonPatterns.cuid.optional(),
    format: commonPatterns.exportFormat,
    theme: commonPatterns.theme.optional(),
    customMapping: z.record(z.string()).optional(),
    idempotencyKey: z.string().uuid().optional(),
  }),

  // Job status request
  jobStatus: z.object({
    jobId: commonPatterns.cuid,
  }),

  // Artifact download request
  artifactDownload: z.object({
    artifactId: commonPatterns.cuid,
  }),
};

// Template API validation schemas
export const templateSchemas = {
  // Create template
  createTemplate: z.object({
    name: z.string().min(1, 'Template name is required').max(255),
    version: z.string().min(1, 'Version is required').max(50).default('1.0'),
    description: z.string().max(1000).optional(),
    sourceHint: z.string().max(100).optional(),
    isPublic: z.boolean().default(false),
    fieldDefs: z
      .array(
        z.object({
          targetField: z.string().min(1, 'Target field is required'),
          sourceHeaders: z.array(z.string()).min(1, 'Source headers are required'),
          transform: z.string().optional(),
          required: z.boolean().default(false),
          defaultValue: z.string().optional(),
        })
      )
      .min(1, 'At least one field definition is required'),
  }),

  // Update template
  updateTemplate: z.object({
    name: z.string().min(1, 'Template name is required').max(255).optional(),
    version: z.string().min(1, 'Version is required').max(50).optional(),
    description: z.string().max(1000).optional(),
    sourceHint: z.string().max(100).optional(),
    isPublic: z.boolean().optional(),
    fieldDefs: z
      .array(
        z.object({
          id: commonPatterns.cuid.optional(),
          targetField: z.string().min(1, 'Target field is required'),
          sourceHeaders: z.array(z.string()).min(1, 'Source headers are required'),
          transform: z.string().optional(),
          required: z.boolean().default(false),
          defaultValue: z.string().optional(),
        })
      )
      .optional(),
  }),
};

// Validation utility functions
export class ValidationUtils {
  /**
   * Validate request body against schema
   */
  static validateBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
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
  static validateQuery<T>(
    schema: z.ZodSchema<T>,
    queryParams: Record<string, string | string[] | undefined>
  ): T {
    // Convert query params to proper types
    const convertedParams: Record<string, any> = {};

    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined) continue;

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
  static validatePath<T>(
    schema: z.ZodSchema<T>,
    pathParams: Record<string, string | undefined>
  ): T {
    return this.validateBody(schema, pathParams);
  }

  /**
   * Sanitize string input to prevent injection attacks
   */
  static sanitizeString(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .replace(/[;\\]/g, '') // Remove semicolons and backslashes
      .trim();
  }

  /**
   * Validate and sanitize file upload
   */
  static validateFileUpload(file: { name: string; size: number; type: string }): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

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
    const hasDangerousExtension = dangerousExtensions.some(ext =>
      file.name.toLowerCase().endsWith(ext)
    );
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
  static validateUrl(url: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const parsedUrl = new URL(url);

      // Check protocol
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        errors.push('Only HTTP and HTTPS protocols are allowed');
      }

      // Check for private IPs (basic SSRF protection)
      const hostname = parsedUrl.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')
      ) {
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
    } catch (error) {
      errors.push('Invalid URL format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Export all schemas for easy access
export const schemas = {
  common: commonPatterns,
  scraping: scrapingSchemas,
  auth: authSchemas,
  targetList: targetListSchemas,
  template: templateSchemas,
};
