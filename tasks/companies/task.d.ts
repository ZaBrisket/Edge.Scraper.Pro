/**
 * Companies Task Implementation
 * Extracts company data from supplier directory pages
 */
import { ScrapeTask, TaskContext } from '../../core/types';
import { CompaniesInput, CompaniesOutput } from './schema';
export declare class CompaniesTask implements ScrapeTask<CompaniesInput, CompaniesOutput> {
    readonly name = "companies";
    readonly input: import("zod").ZodObject<{
        urls: import("zod").ZodArray<import("zod").ZodString, "many">;
        options: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodObject<{
            concurrency: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            delayMs: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            timeout: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            maxRetries: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            enablePaginationDiscovery: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
            enableUrlNormalization: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
            extractionDepth: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodEnum<["basic", "detailed"]>>>;
        }, "strip", import("zod").ZodTypeAny, {
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
    }, "strip", import("zod").ZodTypeAny, {
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
    readonly output: import("zod").ZodObject<{
        companies: import("zod").ZodArray<import("zod").ZodObject<{
            url: import("zod").ZodString;
            name: import("zod").ZodOptional<import("zod").ZodString>;
            website: import("zod").ZodOptional<import("zod").ZodString>;
            email: import("zod").ZodOptional<import("zod").ZodString>;
            phone: import("zod").ZodOptional<import("zod").ZodString>;
            address: import("zod").ZodOptional<import("zod").ZodString>;
            description: import("zod").ZodOptional<import("zod").ZodString>;
            category: import("zod").ZodOptional<import("zod").ZodString>;
            social: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>>;
            techstack: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString, "many">>;
            pages: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                url: import("zod").ZodString;
                title: import("zod").ZodOptional<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
                url: string;
                title?: string | undefined;
            }, {
                url: string;
                title?: string | undefined;
            }>, "many">>;
            metadata: import("zod").ZodObject<{
                extractedAt: import("zod").ZodString;
                confidence: import("zod").ZodNumber;
                source: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                source: string;
                extractedAt: string;
                confidence: number;
            }, {
                source: string;
                extractedAt: string;
                confidence: number;
            }>;
        }, "strip", import("zod").ZodTypeAny, {
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
    private logger;
    private extractor;
    run(input: CompaniesInput, ctx: TaskContext): Promise<CompaniesOutput>;
    private calculateConfidence;
}
//# sourceMappingURL=task.d.ts.map