/**
 * Centralized Input Validation Utilities
 * Provides comprehensive validation schemas and utilities for all API endpoints
 */
import { z } from 'zod';
export declare const commonPatterns: {
    url: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    cuid: z.ZodString;
    fileSize: z.ZodNumber;
    contentType: z.ZodEnum<["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]>;
    userRole: z.ZodEnum<["admin", "user", "readonly"]>;
    jobStatus: z.ZodEnum<["queued", "processing", "completed", "failed"]>;
    exportFormat: z.ZodEnum<["xlsx", "pdf"]>;
    theme: z.ZodEnum<["utss-2025", "default"]>;
    pagination: z.ZodObject<{
        page: z.ZodDefault<z.ZodNumber>;
        limit: z.ZodDefault<z.ZodNumber>;
        sortBy: z.ZodOptional<z.ZodString>;
        sortOrder: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
    }, "strip", z.ZodTypeAny, {
        page: number;
        limit: number;
        sortOrder: "desc" | "asc";
        sortBy?: string | undefined;
    }, {
        page?: number | undefined;
        limit?: number | undefined;
        sortBy?: string | undefined;
        sortOrder?: "desc" | "asc" | undefined;
    }>;
};
export declare const scrapingSchemas: {
    singleUrl: z.ZodObject<{
        url: z.ZodString;
        options: z.ZodOptional<z.ZodObject<{
            timeout: z.ZodOptional<z.ZodNumber>;
            followRedirects: z.ZodOptional<z.ZodBoolean>;
            userAgent: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            timeout?: number | undefined;
            followRedirects?: boolean | undefined;
            userAgent?: string | undefined;
        }, {
            timeout?: number | undefined;
            followRedirects?: boolean | undefined;
            userAgent?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        options?: {
            timeout?: number | undefined;
            followRedirects?: boolean | undefined;
            userAgent?: string | undefined;
        } | undefined;
    }, {
        url: string;
        options?: {
            timeout?: number | undefined;
            followRedirects?: boolean | undefined;
            userAgent?: string | undefined;
        } | undefined;
    }>;
    batchUrls: z.ZodObject<{
        urls: z.ZodArray<z.ZodString, "many">;
        options: z.ZodOptional<z.ZodObject<{
            concurrency: z.ZodOptional<z.ZodNumber>;
            delayMs: z.ZodOptional<z.ZodNumber>;
            timeout: z.ZodOptional<z.ZodNumber>;
            maxRetries: z.ZodOptional<z.ZodNumber>;
            extractionMode: z.ZodOptional<z.ZodEnum<["sports", "supplier-directory", "general"]>>;
            enableUrlNormalization: z.ZodOptional<z.ZodBoolean>;
            enablePaginationDiscovery: z.ZodOptional<z.ZodBoolean>;
            enableStructuredLogging: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            timeout?: number | undefined;
            maxRetries?: number | undefined;
            enableUrlNormalization?: boolean | undefined;
            enablePaginationDiscovery?: boolean | undefined;
            concurrency?: number | undefined;
            delayMs?: number | undefined;
            extractionMode?: "sports" | "supplier-directory" | "general" | undefined;
            enableStructuredLogging?: boolean | undefined;
        }, {
            timeout?: number | undefined;
            maxRetries?: number | undefined;
            enableUrlNormalization?: boolean | undefined;
            enablePaginationDiscovery?: boolean | undefined;
            concurrency?: number | undefined;
            delayMs?: number | undefined;
            extractionMode?: "sports" | "supplier-directory" | "general" | undefined;
            enableStructuredLogging?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        urls: string[];
        options?: {
            timeout?: number | undefined;
            maxRetries?: number | undefined;
            enableUrlNormalization?: boolean | undefined;
            enablePaginationDiscovery?: boolean | undefined;
            concurrency?: number | undefined;
            delayMs?: number | undefined;
            extractionMode?: "sports" | "supplier-directory" | "general" | undefined;
            enableStructuredLogging?: boolean | undefined;
        } | undefined;
    }, {
        urls: string[];
        options?: {
            timeout?: number | undefined;
            maxRetries?: number | undefined;
            enableUrlNormalization?: boolean | undefined;
            enablePaginationDiscovery?: boolean | undefined;
            concurrency?: number | undefined;
            delayMs?: number | undefined;
            extractionMode?: "sports" | "supplier-directory" | "general" | undefined;
            enableStructuredLogging?: boolean | undefined;
        } | undefined;
    }>;
    urlValidation: z.ZodObject<{
        urls: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        urls: string[];
    }, {
        urls: string[];
    }>;
};
export declare const authSchemas: {
    register: z.ZodObject<{
        email: z.ZodString;
        password: z.ZodString;
        name: z.ZodString;
        role: z.ZodOptional<z.ZodEnum<["admin", "user", "readonly"]>>;
    }, "strip", z.ZodTypeAny, {
        password: string;
        name: string;
        email: string;
        role?: "admin" | "user" | "readonly" | undefined;
    }, {
        password: string;
        name: string;
        email: string;
        role?: "admin" | "user" | "readonly" | undefined;
    }>;
    login: z.ZodObject<{
        email: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        password: string;
        email: string;
    }, {
        password: string;
        email: string;
    }>;
    changePassword: z.ZodObject<{
        currentPassword: z.ZodString;
        newPassword: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        currentPassword: string;
        newPassword: string;
    }, {
        currentPassword: string;
        newPassword: string;
    }>;
    updateProfile: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name?: string | undefined;
        email?: string | undefined;
    }, {
        name?: string | undefined;
        email?: string | undefined;
    }>;
};
export declare const targetListSchemas: {
    uploadPresign: z.ZodObject<{
        filename: z.ZodString;
        contentType: z.ZodEnum<["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]>;
        maxFileSize: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        filename: string;
        contentType: "text/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.ms-excel";
        maxFileSize?: number | undefined;
    }, {
        filename: string;
        contentType: "text/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.ms-excel";
        maxFileSize?: number | undefined;
    }>;
    uploadCommit: z.ZodObject<{
        s3Key: z.ZodString;
        datasetName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        s3Key: string;
        datasetName?: string | undefined;
    }, {
        s3Key: string;
        datasetName?: string | undefined;
    }>;
    preview: z.ZodObject<{
        datasetId: z.ZodString;
        templateId: z.ZodString;
        sampleSize: z.ZodDefault<z.ZodNumber>;
        customMapping: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        datasetId: string;
        templateId: string;
        sampleSize: number;
        customMapping?: Record<string, string> | undefined;
    }, {
        datasetId: string;
        templateId: string;
        sampleSize?: number | undefined;
        customMapping?: Record<string, string> | undefined;
    }>;
    exportJob: z.ZodObject<{
        datasetId: z.ZodString;
        templateId: z.ZodOptional<z.ZodString>;
        format: z.ZodEnum<["xlsx", "pdf"]>;
        theme: z.ZodOptional<z.ZodEnum<["utss-2025", "default"]>>;
        customMapping: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        idempotencyKey: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        datasetId: string;
        format: "xlsx" | "pdf";
        templateId?: string | undefined;
        theme?: "default" | "utss-2025" | undefined;
        idempotencyKey?: string | undefined;
        customMapping?: Record<string, string> | undefined;
    }, {
        datasetId: string;
        format: "xlsx" | "pdf";
        templateId?: string | undefined;
        theme?: "default" | "utss-2025" | undefined;
        idempotencyKey?: string | undefined;
        customMapping?: Record<string, string> | undefined;
    }>;
    jobStatus: z.ZodObject<{
        jobId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        jobId: string;
    }, {
        jobId: string;
    }>;
    artifactDownload: z.ZodObject<{
        artifactId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        artifactId: string;
    }, {
        artifactId: string;
    }>;
};
export declare const templateSchemas: {
    createTemplate: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodDefault<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        sourceHint: z.ZodOptional<z.ZodString>;
        isPublic: z.ZodDefault<z.ZodBoolean>;
        fieldDefs: z.ZodArray<z.ZodObject<{
            targetField: z.ZodString;
            sourceHeaders: z.ZodArray<z.ZodString, "many">;
            transform: z.ZodOptional<z.ZodString>;
            required: z.ZodDefault<z.ZodBoolean>;
            defaultValue: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            targetField: string;
            sourceHeaders: string[];
            required: boolean;
            transform?: string | undefined;
            defaultValue?: string | undefined;
        }, {
            targetField: string;
            sourceHeaders: string[];
            transform?: string | undefined;
            required?: boolean | undefined;
            defaultValue?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        version: string;
        name: string;
        isPublic: boolean;
        fieldDefs: {
            targetField: string;
            sourceHeaders: string[];
            required: boolean;
            transform?: string | undefined;
            defaultValue?: string | undefined;
        }[];
        description?: string | undefined;
        sourceHint?: string | undefined;
    }, {
        name: string;
        fieldDefs: {
            targetField: string;
            sourceHeaders: string[];
            transform?: string | undefined;
            required?: boolean | undefined;
            defaultValue?: string | undefined;
        }[];
        version?: string | undefined;
        description?: string | undefined;
        sourceHint?: string | undefined;
        isPublic?: boolean | undefined;
    }>;
    updateTemplate: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        sourceHint: z.ZodOptional<z.ZodString>;
        isPublic: z.ZodOptional<z.ZodBoolean>;
        fieldDefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            targetField: z.ZodString;
            sourceHeaders: z.ZodArray<z.ZodString, "many">;
            transform: z.ZodOptional<z.ZodString>;
            required: z.ZodDefault<z.ZodBoolean>;
            defaultValue: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            targetField: string;
            sourceHeaders: string[];
            required: boolean;
            id?: string | undefined;
            transform?: string | undefined;
            defaultValue?: string | undefined;
        }, {
            targetField: string;
            sourceHeaders: string[];
            id?: string | undefined;
            transform?: string | undefined;
            required?: boolean | undefined;
            defaultValue?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        version?: string | undefined;
        name?: string | undefined;
        description?: string | undefined;
        sourceHint?: string | undefined;
        isPublic?: boolean | undefined;
        fieldDefs?: {
            targetField: string;
            sourceHeaders: string[];
            required: boolean;
            id?: string | undefined;
            transform?: string | undefined;
            defaultValue?: string | undefined;
        }[] | undefined;
    }, {
        version?: string | undefined;
        name?: string | undefined;
        description?: string | undefined;
        sourceHint?: string | undefined;
        isPublic?: boolean | undefined;
        fieldDefs?: {
            targetField: string;
            sourceHeaders: string[];
            id?: string | undefined;
            transform?: string | undefined;
            required?: boolean | undefined;
            defaultValue?: string | undefined;
        }[] | undefined;
    }>;
};
export declare class ValidationUtils {
    /**
     * Validate request body against schema
     */
    static validateBody<T>(schema: z.ZodSchema<T>, data: unknown): T;
    /**
     * Validate query parameters against schema
     */
    static validateQuery<T>(schema: z.ZodSchema<T>, queryParams: Record<string, string | string[] | undefined>): T;
    /**
     * Validate path parameters against schema
     */
    static validatePath<T>(schema: z.ZodSchema<T>, pathParams: Record<string, string | undefined>): T;
    /**
     * Sanitize string input to prevent injection attacks
     */
    static sanitizeString(input: string): string;
    /**
     * Validate and sanitize file upload
     */
    static validateFileUpload(file: {
        name: string;
        size: number;
        type: string;
    }): {
        isValid: boolean;
        errors: string[];
    };
    /**
     * Validate URL for SSRF protection
     */
    static validateUrl(url: string): {
        isValid: boolean;
        errors: string[];
    };
}
export declare const schemas: {
    common: {
        url: z.ZodString;
        email: z.ZodString;
        password: z.ZodString;
        cuid: z.ZodString;
        fileSize: z.ZodNumber;
        contentType: z.ZodEnum<["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]>;
        userRole: z.ZodEnum<["admin", "user", "readonly"]>;
        jobStatus: z.ZodEnum<["queued", "processing", "completed", "failed"]>;
        exportFormat: z.ZodEnum<["xlsx", "pdf"]>;
        theme: z.ZodEnum<["utss-2025", "default"]>;
        pagination: z.ZodObject<{
            page: z.ZodDefault<z.ZodNumber>;
            limit: z.ZodDefault<z.ZodNumber>;
            sortBy: z.ZodOptional<z.ZodString>;
            sortOrder: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
        }, "strip", z.ZodTypeAny, {
            page: number;
            limit: number;
            sortOrder: "desc" | "asc";
            sortBy?: string | undefined;
        }, {
            page?: number | undefined;
            limit?: number | undefined;
            sortBy?: string | undefined;
            sortOrder?: "desc" | "asc" | undefined;
        }>;
    };
    scraping: {
        singleUrl: z.ZodObject<{
            url: z.ZodString;
            options: z.ZodOptional<z.ZodObject<{
                timeout: z.ZodOptional<z.ZodNumber>;
                followRedirects: z.ZodOptional<z.ZodBoolean>;
                userAgent: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                timeout?: number | undefined;
                followRedirects?: boolean | undefined;
                userAgent?: string | undefined;
            }, {
                timeout?: number | undefined;
                followRedirects?: boolean | undefined;
                userAgent?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            url: string;
            options?: {
                timeout?: number | undefined;
                followRedirects?: boolean | undefined;
                userAgent?: string | undefined;
            } | undefined;
        }, {
            url: string;
            options?: {
                timeout?: number | undefined;
                followRedirects?: boolean | undefined;
                userAgent?: string | undefined;
            } | undefined;
        }>;
        batchUrls: z.ZodObject<{
            urls: z.ZodArray<z.ZodString, "many">;
            options: z.ZodOptional<z.ZodObject<{
                concurrency: z.ZodOptional<z.ZodNumber>;
                delayMs: z.ZodOptional<z.ZodNumber>;
                timeout: z.ZodOptional<z.ZodNumber>;
                maxRetries: z.ZodOptional<z.ZodNumber>;
                extractionMode: z.ZodOptional<z.ZodEnum<["sports", "supplier-directory", "general"]>>;
                enableUrlNormalization: z.ZodOptional<z.ZodBoolean>;
                enablePaginationDiscovery: z.ZodOptional<z.ZodBoolean>;
                enableStructuredLogging: z.ZodOptional<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                timeout?: number | undefined;
                maxRetries?: number | undefined;
                enableUrlNormalization?: boolean | undefined;
                enablePaginationDiscovery?: boolean | undefined;
                concurrency?: number | undefined;
                delayMs?: number | undefined;
                extractionMode?: "sports" | "supplier-directory" | "general" | undefined;
                enableStructuredLogging?: boolean | undefined;
            }, {
                timeout?: number | undefined;
                maxRetries?: number | undefined;
                enableUrlNormalization?: boolean | undefined;
                enablePaginationDiscovery?: boolean | undefined;
                concurrency?: number | undefined;
                delayMs?: number | undefined;
                extractionMode?: "sports" | "supplier-directory" | "general" | undefined;
                enableStructuredLogging?: boolean | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            urls: string[];
            options?: {
                timeout?: number | undefined;
                maxRetries?: number | undefined;
                enableUrlNormalization?: boolean | undefined;
                enablePaginationDiscovery?: boolean | undefined;
                concurrency?: number | undefined;
                delayMs?: number | undefined;
                extractionMode?: "sports" | "supplier-directory" | "general" | undefined;
                enableStructuredLogging?: boolean | undefined;
            } | undefined;
        }, {
            urls: string[];
            options?: {
                timeout?: number | undefined;
                maxRetries?: number | undefined;
                enableUrlNormalization?: boolean | undefined;
                enablePaginationDiscovery?: boolean | undefined;
                concurrency?: number | undefined;
                delayMs?: number | undefined;
                extractionMode?: "sports" | "supplier-directory" | "general" | undefined;
                enableStructuredLogging?: boolean | undefined;
            } | undefined;
        }>;
        urlValidation: z.ZodObject<{
            urls: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            urls: string[];
        }, {
            urls: string[];
        }>;
    };
    auth: {
        register: z.ZodObject<{
            email: z.ZodString;
            password: z.ZodString;
            name: z.ZodString;
            role: z.ZodOptional<z.ZodEnum<["admin", "user", "readonly"]>>;
        }, "strip", z.ZodTypeAny, {
            password: string;
            name: string;
            email: string;
            role?: "admin" | "user" | "readonly" | undefined;
        }, {
            password: string;
            name: string;
            email: string;
            role?: "admin" | "user" | "readonly" | undefined;
        }>;
        login: z.ZodObject<{
            email: z.ZodString;
            password: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            password: string;
            email: string;
        }, {
            password: string;
            email: string;
        }>;
        changePassword: z.ZodObject<{
            currentPassword: z.ZodString;
            newPassword: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            currentPassword: string;
            newPassword: string;
        }, {
            currentPassword: string;
            newPassword: string;
        }>;
        updateProfile: z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            email: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name?: string | undefined;
            email?: string | undefined;
        }, {
            name?: string | undefined;
            email?: string | undefined;
        }>;
    };
    targetList: {
        uploadPresign: z.ZodObject<{
            filename: z.ZodString;
            contentType: z.ZodEnum<["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]>;
            maxFileSize: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            filename: string;
            contentType: "text/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.ms-excel";
            maxFileSize?: number | undefined;
        }, {
            filename: string;
            contentType: "text/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.ms-excel";
            maxFileSize?: number | undefined;
        }>;
        uploadCommit: z.ZodObject<{
            s3Key: z.ZodString;
            datasetName: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            s3Key: string;
            datasetName?: string | undefined;
        }, {
            s3Key: string;
            datasetName?: string | undefined;
        }>;
        preview: z.ZodObject<{
            datasetId: z.ZodString;
            templateId: z.ZodString;
            sampleSize: z.ZodDefault<z.ZodNumber>;
            customMapping: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            datasetId: string;
            templateId: string;
            sampleSize: number;
            customMapping?: Record<string, string> | undefined;
        }, {
            datasetId: string;
            templateId: string;
            sampleSize?: number | undefined;
            customMapping?: Record<string, string> | undefined;
        }>;
        exportJob: z.ZodObject<{
            datasetId: z.ZodString;
            templateId: z.ZodOptional<z.ZodString>;
            format: z.ZodEnum<["xlsx", "pdf"]>;
            theme: z.ZodOptional<z.ZodEnum<["utss-2025", "default"]>>;
            customMapping: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            idempotencyKey: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            datasetId: string;
            format: "xlsx" | "pdf";
            templateId?: string | undefined;
            theme?: "default" | "utss-2025" | undefined;
            idempotencyKey?: string | undefined;
            customMapping?: Record<string, string> | undefined;
        }, {
            datasetId: string;
            format: "xlsx" | "pdf";
            templateId?: string | undefined;
            theme?: "default" | "utss-2025" | undefined;
            idempotencyKey?: string | undefined;
            customMapping?: Record<string, string> | undefined;
        }>;
        jobStatus: z.ZodObject<{
            jobId: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            jobId: string;
        }, {
            jobId: string;
        }>;
        artifactDownload: z.ZodObject<{
            artifactId: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            artifactId: string;
        }, {
            artifactId: string;
        }>;
    };
    template: {
        createTemplate: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodDefault<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            sourceHint: z.ZodOptional<z.ZodString>;
            isPublic: z.ZodDefault<z.ZodBoolean>;
            fieldDefs: z.ZodArray<z.ZodObject<{
                targetField: z.ZodString;
                sourceHeaders: z.ZodArray<z.ZodString, "many">;
                transform: z.ZodOptional<z.ZodString>;
                required: z.ZodDefault<z.ZodBoolean>;
                defaultValue: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                targetField: string;
                sourceHeaders: string[];
                required: boolean;
                transform?: string | undefined;
                defaultValue?: string | undefined;
            }, {
                targetField: string;
                sourceHeaders: string[];
                transform?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: string | undefined;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            version: string;
            name: string;
            isPublic: boolean;
            fieldDefs: {
                targetField: string;
                sourceHeaders: string[];
                required: boolean;
                transform?: string | undefined;
                defaultValue?: string | undefined;
            }[];
            description?: string | undefined;
            sourceHint?: string | undefined;
        }, {
            name: string;
            fieldDefs: {
                targetField: string;
                sourceHeaders: string[];
                transform?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: string | undefined;
            }[];
            version?: string | undefined;
            description?: string | undefined;
            sourceHint?: string | undefined;
            isPublic?: boolean | undefined;
        }>;
        updateTemplate: z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            version: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            sourceHint: z.ZodOptional<z.ZodString>;
            isPublic: z.ZodOptional<z.ZodBoolean>;
            fieldDefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodOptional<z.ZodString>;
                targetField: z.ZodString;
                sourceHeaders: z.ZodArray<z.ZodString, "many">;
                transform: z.ZodOptional<z.ZodString>;
                required: z.ZodDefault<z.ZodBoolean>;
                defaultValue: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                targetField: string;
                sourceHeaders: string[];
                required: boolean;
                id?: string | undefined;
                transform?: string | undefined;
                defaultValue?: string | undefined;
            }, {
                targetField: string;
                sourceHeaders: string[];
                id?: string | undefined;
                transform?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            version?: string | undefined;
            name?: string | undefined;
            description?: string | undefined;
            sourceHint?: string | undefined;
            isPublic?: boolean | undefined;
            fieldDefs?: {
                targetField: string;
                sourceHeaders: string[];
                required: boolean;
                id?: string | undefined;
                transform?: string | undefined;
                defaultValue?: string | undefined;
            }[] | undefined;
        }, {
            version?: string | undefined;
            name?: string | undefined;
            description?: string | undefined;
            sourceHint?: string | undefined;
            isPublic?: boolean | undefined;
            fieldDefs?: {
                targetField: string;
                sourceHeaders: string[];
                id?: string | undefined;
                transform?: string | undefined;
                required?: boolean | undefined;
                defaultValue?: string | undefined;
            }[] | undefined;
        }>;
    };
};
//# sourceMappingURL=index.d.ts.map