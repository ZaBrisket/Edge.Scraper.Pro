/**
 * News Task Schemas
 * Input and output schemas for the news scraping task
 */
import { z } from 'zod';
export declare const NewsInputSchema: z.ZodObject<{
    urls: z.ZodArray<z.ZodString, "many">;
    options: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        concurrency: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        delayMs: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        maxRetries: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        extractContent: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        extractImages: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        maxContentLength: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        dateFormat: z.ZodDefault<z.ZodOptional<z.ZodEnum<["iso", "timestamp", "human"]>>>;
    }, "strip", z.ZodTypeAny, {
        timeout: number;
        maxRetries: number;
        maxContentLength: number;
        extractImages: boolean;
        dateFormat: "timestamp" | "iso" | "human";
        concurrency: number;
        delayMs: number;
        extractContent: boolean;
    }, {
        timeout?: number | undefined;
        maxRetries?: number | undefined;
        maxContentLength?: number | undefined;
        extractImages?: boolean | undefined;
        dateFormat?: "timestamp" | "iso" | "human" | undefined;
        concurrency?: number | undefined;
        delayMs?: number | undefined;
        extractContent?: boolean | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    options: {
        timeout: number;
        maxRetries: number;
        maxContentLength: number;
        extractImages: boolean;
        dateFormat: "timestamp" | "iso" | "human";
        concurrency: number;
        delayMs: number;
        extractContent: boolean;
    };
    urls: string[];
}, {
    urls: string[];
    options?: {
        timeout?: number | undefined;
        maxRetries?: number | undefined;
        maxContentLength?: number | undefined;
        extractImages?: boolean | undefined;
        dateFormat?: "timestamp" | "iso" | "human" | undefined;
        concurrency?: number | undefined;
        delayMs?: number | undefined;
        extractContent?: boolean | undefined;
    } | undefined;
}>;
export declare const NewsOutputSchema: z.ZodObject<{
    articles: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        author: z.ZodOptional<z.ZodString>;
        publishedAt: z.ZodOptional<z.ZodString>;
        modifiedAt: z.ZodOptional<z.ZodString>;
        excerpt: z.ZodOptional<z.ZodString>;
        content: z.ZodOptional<z.ZodString>;
        wordCount: z.ZodOptional<z.ZodNumber>;
        readingTime: z.ZodOptional<z.ZodNumber>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        category: z.ZodOptional<z.ZodString>;
        images: z.ZodOptional<z.ZodArray<z.ZodObject<{
            src: z.ZodString;
            alt: z.ZodOptional<z.ZodString>;
            caption: z.ZodOptional<z.ZodString>;
            width: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            src: string;
            caption?: string | undefined;
            alt?: string | undefined;
            width?: number | undefined;
            height?: number | undefined;
        }, {
            src: string;
            caption?: string | undefined;
            alt?: string | undefined;
            width?: number | undefined;
            height?: number | undefined;
        }>, "many">>;
        metadata: z.ZodObject<{
            extractedAt: z.ZodString;
            confidence: z.ZodNumber;
            source: z.ZodString;
            language: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            source: string;
            extractedAt: string;
            confidence: number;
            language?: string | undefined;
        }, {
            source: string;
            extractedAt: string;
            confidence: number;
            language?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        metadata: {
            source: string;
            extractedAt: string;
            confidence: number;
            language?: string | undefined;
        };
        title?: string | undefined;
        content?: string | undefined;
        wordCount?: number | undefined;
        readingTime?: number | undefined;
        author?: string | undefined;
        publishedAt?: string | undefined;
        modifiedAt?: string | undefined;
        excerpt?: string | undefined;
        tags?: string[] | undefined;
        category?: string | undefined;
        images?: {
            src: string;
            caption?: string | undefined;
            alt?: string | undefined;
            width?: number | undefined;
            height?: number | undefined;
        }[] | undefined;
    }, {
        url: string;
        metadata: {
            source: string;
            extractedAt: string;
            confidence: number;
            language?: string | undefined;
        };
        title?: string | undefined;
        content?: string | undefined;
        wordCount?: number | undefined;
        readingTime?: number | undefined;
        author?: string | undefined;
        publishedAt?: string | undefined;
        modifiedAt?: string | undefined;
        excerpt?: string | undefined;
        tags?: string[] | undefined;
        category?: string | undefined;
        images?: {
            src: string;
            caption?: string | undefined;
            alt?: string | undefined;
            width?: number | undefined;
            height?: number | undefined;
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
    articles: {
        url: string;
        metadata: {
            source: string;
            extractedAt: string;
            confidence: number;
            language?: string | undefined;
        };
        title?: string | undefined;
        content?: string | undefined;
        wordCount?: number | undefined;
        readingTime?: number | undefined;
        author?: string | undefined;
        publishedAt?: string | undefined;
        modifiedAt?: string | undefined;
        excerpt?: string | undefined;
        tags?: string[] | undefined;
        category?: string | undefined;
        images?: {
            src: string;
            caption?: string | undefined;
            alt?: string | undefined;
            width?: number | undefined;
            height?: number | undefined;
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
    articles: {
        url: string;
        metadata: {
            source: string;
            extractedAt: string;
            confidence: number;
            language?: string | undefined;
        };
        title?: string | undefined;
        content?: string | undefined;
        wordCount?: number | undefined;
        readingTime?: number | undefined;
        author?: string | undefined;
        publishedAt?: string | undefined;
        modifiedAt?: string | undefined;
        excerpt?: string | undefined;
        tags?: string[] | undefined;
        category?: string | undefined;
        images?: {
            src: string;
            caption?: string | undefined;
            alt?: string | undefined;
            width?: number | undefined;
            height?: number | undefined;
        }[] | undefined;
    }[];
}>;
export type NewsInput = z.infer<typeof NewsInputSchema>;
export type NewsOutput = z.infer<typeof NewsOutputSchema>;
//# sourceMappingURL=schema.d.ts.map