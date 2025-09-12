"use strict";
/**
 * Sports Task Schemas
 * Input and output schemas for the sports scraping task
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SportsOutputSchema = exports.SportsInputSchema = void 0;
const zod_1 = require("zod");
// Input schema for sports task
exports.SportsInputSchema = zod_1.z.object({
    urls: zod_1.z.array(zod_1.z.string().url()).min(1).max(1500),
    options: zod_1.z.object({
        concurrency: zod_1.z.number().min(1).max(20).optional().default(2),
        delayMs: zod_1.z.number().min(0).max(10000).optional().default(2000),
        timeout: zod_1.z.number().min(1000).max(60000).optional().default(30000),
        maxRetries: zod_1.z.number().min(0).max(5).optional().default(3),
        extractTables: zod_1.z.boolean().optional().default(true),
        extractBiography: zod_1.z.boolean().optional().default(true),
        extractAchievements: zod_1.z.boolean().optional().default(true),
        includePlaceholderData: zod_1.z.boolean().optional().default(false),
        sportsSite: zod_1.z.enum(['pro-football-reference', 'basketball-reference', 'baseball-reference', 'hockey-reference', 'auto']).optional().default('auto'),
    }).optional().default({}),
});
// Output schema for sports task
exports.SportsOutputSchema = zod_1.z.object({
    players: zod_1.z.array(zod_1.z.object({
        url: zod_1.z.string(),
        name: zod_1.z.string().optional(),
        position: zod_1.z.string().optional(),
        team: zod_1.z.string().optional(),
        stats: zod_1.z.record(zod_1.z.any()).optional(),
        biographical: zod_1.z.record(zod_1.z.any()).optional(),
        achievements: zod_1.z.array(zod_1.z.string()).optional(),
        rawTables: zod_1.z.array(zod_1.z.string()).optional(),
        metadata: zod_1.z.object({
            extractedAt: zod_1.z.string(),
            site: zod_1.z.string(),
            confidence: zod_1.z.number(),
        }),
    })),
    summary: zod_1.z.object({
        total: zod_1.z.number(),
        successful: zod_1.z.number(),
        failed: zod_1.z.number(),
        averageTime: zod_1.z.number(),
        errors: zod_1.z.array(zod_1.z.object({
            url: zod_1.z.string(),
            error: zod_1.z.string(),
            category: zod_1.z.string(),
        })),
    }),
    metadata: zod_1.z.object({
        jobId: zod_1.z.string(),
        task: zod_1.z.string(),
        startTime: zod_1.z.string(),
        endTime: zod_1.z.string(),
        duration: zod_1.z.number(),
    }),
});
//# sourceMappingURL=schema.js.map