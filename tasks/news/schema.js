"use strict";
/**
 * News Task Schemas
 * Input and output schemas for the news scraping task
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsOutputSchema = exports.NewsInputSchema = void 0;
const zod_1 = require("zod");
// Input schema for news task
exports.NewsInputSchema = zod_1.z.object({
    urls: zod_1.z.array(zod_1.z.string().url()).min(1).max(1500),
    options: zod_1.z.object({
        concurrency: zod_1.z.number().min(1).max(20).optional().default(5),
        delayMs: zod_1.z.number().min(0).max(10000).optional().default(500),
        timeout: zod_1.z.number().min(1000).max(60000).optional().default(15000),
        maxRetries: zod_1.z.number().min(0).max(5).optional().default(2),
        extractContent: zod_1.z.boolean().optional().default(false),
        extractImages: zod_1.z.boolean().optional().default(false),
        maxContentLength: zod_1.z.number().min(100).max(50000).optional().default(5000),
        dateFormat: zod_1.z.enum(['iso', 'timestamp', 'human']).optional().default('iso'),
    }).optional().default({}),
});
// Output schema for news task
exports.NewsOutputSchema = zod_1.z.object({
    articles: zod_1.z.array(zod_1.z.object({
        url: zod_1.z.string(),
        title: zod_1.z.string().optional(),
        author: zod_1.z.string().optional(),
        publishedAt: zod_1.z.string().optional(),
        modifiedAt: zod_1.z.string().optional(),
        excerpt: zod_1.z.string().optional(),
        content: zod_1.z.string().optional(),
        wordCount: zod_1.z.number().optional(),
        readingTime: zod_1.z.number().optional(),
        tags: zod_1.z.array(zod_1.z.string()).optional(),
        category: zod_1.z.string().optional(),
        images: zod_1.z.array(zod_1.z.object({
            src: zod_1.z.string(),
            alt: zod_1.z.string().optional(),
            caption: zod_1.z.string().optional(),
            width: zod_1.z.number().optional(),
            height: zod_1.z.number().optional(),
        })).optional(),
        metadata: zod_1.z.object({
            extractedAt: zod_1.z.string(),
            confidence: zod_1.z.number(),
            source: zod_1.z.string(),
            language: zod_1.z.string().optional(),
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