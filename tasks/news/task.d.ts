/**
 * News Task Implementation
 * Extracts article metadata and content from news article URLs
 */
import { ScrapeTask, TaskContext } from '../../core/types';
import { NewsInput, NewsOutput } from './schema';
export declare class NewsTask implements ScrapeTask<NewsInput, NewsOutput> {
    readonly name = "news";
    readonly input: import("zod").ZodObject<{
        urls: import("zod").ZodArray<import("zod").ZodString, "many">;
        options: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodObject<{
            concurrency: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            delayMs: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            timeout: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            maxRetries: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            extractContent: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
            extractImages: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
            maxContentLength: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            dateFormat: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodEnum<["iso", "timestamp", "human"]>>>;
        }, "strip", import("zod").ZodTypeAny, {
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
    }, "strip", import("zod").ZodTypeAny, {
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
    readonly output: import("zod").ZodObject<{
        articles: import("zod").ZodArray<import("zod").ZodObject<{
            url: import("zod").ZodString;
            title: import("zod").ZodOptional<import("zod").ZodString>;
            author: import("zod").ZodOptional<import("zod").ZodString>;
            publishedAt: import("zod").ZodOptional<import("zod").ZodString>;
            modifiedAt: import("zod").ZodOptional<import("zod").ZodString>;
            excerpt: import("zod").ZodOptional<import("zod").ZodString>;
            content: import("zod").ZodOptional<import("zod").ZodString>;
            wordCount: import("zod").ZodOptional<import("zod").ZodNumber>;
            readingTime: import("zod").ZodOptional<import("zod").ZodNumber>;
            tags: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString, "many">>;
            category: import("zod").ZodOptional<import("zod").ZodString>;
            images: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                src: import("zod").ZodString;
                alt: import("zod").ZodOptional<import("zod").ZodString>;
                caption: import("zod").ZodOptional<import("zod").ZodString>;
                width: import("zod").ZodOptional<import("zod").ZodNumber>;
                height: import("zod").ZodOptional<import("zod").ZodNumber>;
            }, "strip", import("zod").ZodTypeAny, {
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
            metadata: import("zod").ZodObject<{
                extractedAt: import("zod").ZodString;
                confidence: import("zod").ZodNumber;
                source: import("zod").ZodString;
                language: import("zod").ZodOptional<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
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
        }, "strip", import("zod").ZodTypeAny, {
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
        summary: import("zod").ZodObject<{
            total: import("zod").ZodNumber;
            successful: import("zod").ZodNumber;
            failed: import("zod").ZodNumber;
            averageTime: import("zod").ZodNumber;
            errors: import("zod").ZodArray<import("zod").ZodObject<{
                url: import("zod").ZodString;
                error: import("zod").ZodString;
                category: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                error: string;
                url: string;
                category: string;
            }, {
                error: string;
                url: string;
                category: string;
            }>, "many">;
        }, "strip", import("zod").ZodTypeAny, {
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
        metadata: import("zod").ZodObject<{
            jobId: import("zod").ZodString;
            task: import("zod").ZodString;
            startTime: import("zod").ZodString;
            endTime: import("zod").ZodString;
            duration: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
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
    }, "strip", import("zod").ZodTypeAny, {
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
    private logger;
    run(input: NewsInput, ctx: TaskContext): Promise<NewsOutput>;
    private calculateConfidence;
}
//# sourceMappingURL=task.d.ts.map