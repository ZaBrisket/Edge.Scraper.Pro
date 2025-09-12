/**
 * Sports Task Schemas
 * Input and output schemas for the sports scraping task
 */
import { z } from 'zod';
export declare const SportsInputSchema: z.ZodObject<{
    urls: z.ZodArray<z.ZodString, "many">;
    options: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        concurrency: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        delayMs: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        maxRetries: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        extractTables: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        extractBiography: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        extractAchievements: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        includePlaceholderData: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        sportsSite: z.ZodDefault<z.ZodOptional<z.ZodEnum<["pro-football-reference", "basketball-reference", "baseball-reference", "hockey-reference", "auto"]>>>;
    }, "strip", z.ZodTypeAny, {
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
}, "strip", z.ZodTypeAny, {
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
export declare const SportsOutputSchema: z.ZodObject<{
    players: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        position: z.ZodOptional<z.ZodString>;
        team: z.ZodOptional<z.ZodString>;
        stats: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        biographical: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        achievements: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        rawTables: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        metadata: z.ZodObject<{
            extractedAt: z.ZodString;
            site: z.ZodString;
            confidence: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            extractedAt: string;
            confidence: number;
            site: string;
        }, {
            extractedAt: string;
            confidence: number;
            site: string;
        }>;
    }, "strip", z.ZodTypeAny, {
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
export type SportsInput = z.infer<typeof SportsInputSchema>;
export type SportsOutput = z.infer<typeof SportsOutputSchema>;
//# sourceMappingURL=schema.d.ts.map