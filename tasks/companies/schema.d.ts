/**
 * Companies Task Schemas
 * Input and output schemas for the companies scraping task
 */
import { z } from 'zod';
export declare const CompaniesInputSchema: z.ZodObject<{
    urls: z.ZodArray<z.ZodString, "many">;
    options: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        concurrency: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        delayMs: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        maxRetries: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        enablePaginationDiscovery: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        enableUrlNormalization: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        extractionDepth: z.ZodDefault<z.ZodOptional<z.ZodEnum<["basic", "detailed"]>>>;
    }, "strip", z.ZodTypeAny, {
        timeout: number;
        maxRetries: number;
        concurrency: number;
        delayMs: number;
        enableUrlNormalization: boolean;
        enablePaginationDiscovery: boolean;
        extractionDepth: "basic" | "detailed";
    }, {
        timeout?: number | undefined;
        maxRetries?: number | undefined;
        concurrency?: number | undefined;
        delayMs?: number | undefined;
        enableUrlNormalization?: boolean | undefined;
        enablePaginationDiscovery?: boolean | undefined;
        extractionDepth?: "basic" | "detailed" | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    options: {
        timeout: number;
        maxRetries: number;
        concurrency: number;
        delayMs: number;
        enableUrlNormalization: boolean;
        enablePaginationDiscovery: boolean;
        extractionDepth: "basic" | "detailed";
    };
    urls: string[];
}, {
    urls: string[];
    options?: {
        timeout?: number | undefined;
        maxRetries?: number | undefined;
        concurrency?: number | undefined;
        delayMs?: number | undefined;
        enableUrlNormalization?: boolean | undefined;
        enablePaginationDiscovery?: boolean | undefined;
        extractionDepth?: "basic" | "detailed" | undefined;
    } | undefined;
}>;
export declare const CompaniesOutputSchema: z.ZodObject<{
    companies: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        category: z.ZodOptional<z.ZodString>;
        social: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        techstack: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pages: z.ZodOptional<z.ZodArray<z.ZodObject<{
            url: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            url: string;
            title?: string | undefined;
        }, {
            url: string;
            title?: string | undefined;
        }>, "many">>;
        metadata: z.ZodObject<{
            extractedAt: z.ZodString;
            confidence: z.ZodNumber;
            source: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extractedAt: string;
            confidence: number;
        }, {
            source: string;
            extractedAt: string;
            confidence: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        metadata: {
            source: string;
            extractedAt: string;
            confidence: number;
        };
        name?: string | undefined;
        address?: string | undefined;
        category?: string | undefined;
        website?: string | undefined;
        email?: string | undefined;
        phone?: string | undefined;
        description?: string | undefined;
        social?: Record<string, string> | undefined;
        techstack?: string[] | undefined;
        pages?: {
            url: string;
            title?: string | undefined;
        }[] | undefined;
    }, {
        url: string;
        metadata: {
            source: string;
            extractedAt: string;
            confidence: number;
        };
        name?: string | undefined;
        address?: string | undefined;
        category?: string | undefined;
        website?: string | undefined;
        email?: string | undefined;
        phone?: string | undefined;
        description?: string | undefined;
        social?: Record<string, string> | undefined;
        techstack?: string[] | undefined;
        pages?: {
            url: string;
            title?: string | undefined;
        }[] | undefined;
    }>, "many">;
    summary: z.ZodObject<{
        total: z.ZodNumber;
        successful: z.ZodNumber;
        failed: z.ZodNumber;
        averageTime: z.ZodNumber;
        errors: z.ZodArray<z.ZodObject<{
            url: z.ZodString;
            error: z.ZodString;
            category: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            error: string;
            url: string;
            category: string;
        }, {
            error: string;
            url: string;
            category: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        total: number;
        successful: number;
        failed: number;
        averageTime: number;
        errors: {
            error: string;
            url: string;
            category: string;
        }[];
    }, {
        total: number;
        successful: number;
        failed: number;
        averageTime: number;
        errors: {
            error: string;
            url: string;
            category: string;
        }[];
    }>;
    metadata: z.ZodObject<{
        jobId: z.ZodString;
        task: z.ZodString;
        startTime: z.ZodString;
        endTime: z.ZodString;
        duration: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        duration: number;
        jobId: string;
        task: string;
        startTime: string;
        endTime: string;
    }, {
        duration: number;
        jobId: string;
        task: string;
        startTime: string;
        endTime: string;
    }>;
}, "strip", z.ZodTypeAny, {
    summary: {
        total: number;
        successful: number;
        failed: number;
        averageTime: number;
        errors: {
            error: string;
            url: string;
            category: string;
        }[];
    };
    metadata: {
        duration: number;
        jobId: string;
        task: string;
        startTime: string;
        endTime: string;
    };
    companies: {
        url: string;
        metadata: {
            source: string;
            extractedAt: string;
            confidence: number;
        };
        name?: string | undefined;
        address?: string | undefined;
        category?: string | undefined;
        website?: string | undefined;
        email?: string | undefined;
        phone?: string | undefined;
        description?: string | undefined;
        social?: Record<string, string> | undefined;
        techstack?: string[] | undefined;
        pages?: {
            url: string;
            title?: string | undefined;
        }[] | undefined;
    }[];
}, {
    summary: {
        total: number;
        successful: number;
        failed: number;
        averageTime: number;
        errors: {
            error: string;
            url: string;
            category: string;
        }[];
    };
    metadata: {
        duration: number;
        jobId: string;
        task: string;
        startTime: string;
        endTime: string;
    };
    companies: {
        url: string;
        metadata: {
            source: string;
            extractedAt: string;
            confidence: number;
        };
        name?: string | undefined;
        address?: string | undefined;
        category?: string | undefined;
        website?: string | undefined;
        email?: string | undefined;
        phone?: string | undefined;
        description?: string | undefined;
        social?: Record<string, string> | undefined;
        techstack?: string[] | undefined;
        pages?: {
            url: string;
            title?: string | undefined;
        }[] | undefined;
    }[];
}>;
export type CompaniesInput = z.infer<typeof CompaniesInputSchema>;
export type CompaniesOutput = z.infer<typeof CompaniesOutputSchema>;
//# sourceMappingURL=schema.d.ts.map