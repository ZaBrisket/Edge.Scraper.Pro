/**
 * Sports Task Implementation
 * Extracts player statistics and biographical data from sports reference sites
 */
import { ScrapeTask, TaskContext } from '../../core/types';
import { SportsInput, SportsOutput } from './schema';
export declare class SportsTask implements ScrapeTask<SportsInput, SportsOutput> {
    readonly name = "sports";
    readonly input: import("zod").ZodObject<{
        urls: import("zod").ZodArray<import("zod").ZodString, "many">;
        options: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodObject<{
            concurrency: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            delayMs: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            timeout: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            maxRetries: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodNumber>>;
            extractTables: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
            extractBiography: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
            extractAchievements: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
            includePlaceholderData: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
            sportsSite: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodEnum<["pro-football-reference", "basketball-reference", "baseball-reference", "hockey-reference", "auto"]>>>;
        }, "strip", import("zod").ZodTypeAny, {
            timeout: number;
            maxRetries: number;
            concurrency: number;
            delayMs: number;
            extractTables: boolean;
            extractBiography: boolean;
            extractAchievements: boolean;
            includePlaceholderData: boolean;
            sportsSite: "auto" | "pro-football-reference" | "basketball-reference" | "baseball-reference" | "hockey-reference";
        }, {
            timeout?: number | undefined;
            maxRetries?: number | undefined;
            concurrency?: number | undefined;
            delayMs?: number | undefined;
            extractTables?: boolean | undefined;
            extractBiography?: boolean | undefined;
            extractAchievements?: boolean | undefined;
            includePlaceholderData?: boolean | undefined;
            sportsSite?: "auto" | "pro-football-reference" | "basketball-reference" | "baseball-reference" | "hockey-reference" | undefined;
        }>>>;
    }, "strip", import("zod").ZodTypeAny, {
        options: {
            timeout: number;
            maxRetries: number;
            concurrency: number;
            delayMs: number;
            extractTables: boolean;
            extractBiography: boolean;
            extractAchievements: boolean;
            includePlaceholderData: boolean;
            sportsSite: "auto" | "pro-football-reference" | "basketball-reference" | "baseball-reference" | "hockey-reference";
        };
        urls: string[];
    }, {
        urls: string[];
        options?: {
            timeout?: number | undefined;
            maxRetries?: number | undefined;
            concurrency?: number | undefined;
            delayMs?: number | undefined;
            extractTables?: boolean | undefined;
            extractBiography?: boolean | undefined;
            extractAchievements?: boolean | undefined;
            includePlaceholderData?: boolean | undefined;
            sportsSite?: "auto" | "pro-football-reference" | "basketball-reference" | "baseball-reference" | "hockey-reference" | undefined;
        } | undefined;
    }>;
    readonly output: import("zod").ZodObject<{
        players: import("zod").ZodArray<import("zod").ZodObject<{
            url: import("zod").ZodString;
            name: import("zod").ZodOptional<import("zod").ZodString>;
            position: import("zod").ZodOptional<import("zod").ZodString>;
            team: import("zod").ZodOptional<import("zod").ZodString>;
            stats: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodAny>>;
            biographical: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodAny>>;
            achievements: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString, "many">>;
            rawTables: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString, "many">>;
            metadata: import("zod").ZodObject<{
                extractedAt: import("zod").ZodString;
                site: import("zod").ZodString;
                confidence: import("zod").ZodNumber;
            }, "strip", import("zod").ZodTypeAny, {
                extractedAt: string;
                confidence: number;
                site: string;
            }, {
                extractedAt: string;
                confidence: number;
                site: string;
            }>;
        }, "strip", import("zod").ZodTypeAny, {
            url: string;
            metadata: {
                extractedAt: string;
                confidence: number;
                site: string;
            };
            name?: string | undefined;
            position?: string | undefined;
            team?: string | undefined;
            stats?: Record<string, any> | undefined;
            biographical?: Record<string, any> | undefined;
            achievements?: string[] | undefined;
            rawTables?: string[] | undefined;
        }, {
            url: string;
            metadata: {
                extractedAt: string;
                confidence: number;
                site: string;
            };
            name?: string | undefined;
            position?: string | undefined;
            team?: string | undefined;
            stats?: Record<string, any> | undefined;
            biographical?: Record<string, any> | undefined;
            achievements?: string[] | undefined;
            rawTables?: string[] | undefined;
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
        players: {
            url: string;
            metadata: {
                extractedAt: string;
                confidence: number;
                site: string;
            };
            name?: string | undefined;
            position?: string | undefined;
            team?: string | undefined;
            stats?: Record<string, any> | undefined;
            biographical?: Record<string, any> | undefined;
            achievements?: string[] | undefined;
            rawTables?: string[] | undefined;
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
        players: {
            url: string;
            metadata: {
                extractedAt: string;
                confidence: number;
                site: string;
            };
            name?: string | undefined;
            position?: string | undefined;
            team?: string | undefined;
            stats?: Record<string, any> | undefined;
            biographical?: Record<string, any> | undefined;
            achievements?: string[] | undefined;
            rawTables?: string[] | undefined;
        }[];
    }>;
    private logger;
    private extractor;
    run(input: SportsInput, ctx: TaskContext): Promise<SportsOutput>;
    private extractSiteFromUrl;
    private calculateConfidence;
}
//# sourceMappingURL=task.d.ts.map