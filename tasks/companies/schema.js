"use strict";
/**
 * Companies Task Schemas
 * Input and output schemas for the companies scraping task
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompaniesOutputSchema = exports.CompaniesInputSchema = void 0;
const zod_1 = require("zod");
// Input schema for companies task
exports.CompaniesInputSchema = zod_1.z.object({
    urls: zod_1.z.array(zod_1.z.string().url()).min(1).max(1500),
    options: zod_1.z.object({
        concurrency: zod_1.z.number().min(1).max(20).optional().default(3),
        delayMs: zod_1.z.number().min(0).max(10000).optional().default(1000),
        timeout: zod_1.z.number().min(1000).max(60000).optional().default(30000),
        maxRetries: zod_1.z.number().min(0).max(5).optional().default(3),
        enablePaginationDiscovery: zod_1.z.boolean().optional().default(true),
        enableUrlNormalization: zod_1.z.boolean().optional().default(true),
        extractionDepth: zod_1.z.enum(['basic', 'detailed']).optional().default('basic'),
    }).optional().default({}),
});
// Output schema for companies task
exports.CompaniesOutputSchema = zod_1.z.object({
    companies: zod_1.z.array(zod_1.z.object({
        url: zod_1.z.string(),
        name: zod_1.z.string().optional(),
        website: zod_1.z.string().optional(),
        email: zod_1.z.string().optional(),
        phone: zod_1.z.string().optional(),
        address: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        category: zod_1.z.string().optional(),
        social: zod_1.z.record(zod_1.z.string()).optional(),
        techstack: zod_1.z.array(zod_1.z.string()).optional(),
        pages: zod_1.z.array(zod_1.z.object({
            url: zod_1.z.string(),
            title: zod_1.z.string().optional(),
        })).optional(),
        metadata: zod_1.z.object({
            extractedAt: zod_1.z.string(),
            confidence: zod_1.z.number(),
            source: zod_1.z.string(),
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