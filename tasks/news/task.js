"use strict";
/**
 * News Task Implementation
 * Extracts article metadata and content from news article URLs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsTask = void 0;
const schema_1 = require("./schema");
const log_1 = require("../../core/log");
const parsers_1 = require("../../core/parsers");
const batch_processor_1 = require("../../src/lib/batch-processor");
class NewsTask {
    constructor() {
        this.name = 'news';
        this.input = schema_1.NewsInputSchema;
        this.output = schema_1.NewsOutputSchema;
        this.logger = (0, log_1.createLogger)('news-task');
    }
    async run(input, ctx) {
        this.logger.info('Starting news extraction', {
            taskName: this.name,
            requestId: ctx.correlationId,
            jobId: ctx.jobId,
            urlCount: input.urls.length,
            options: input.options,
        });
        try {
            // Create batch processor with news configuration
            const processor = new batch_processor_1.BatchProcessor({
                concurrency: input.options?.concurrency || 5,
                delayMs: input.options?.delayMs || 500,
                timeout: input.options?.timeout || 15000,
                maxRetries: input.options?.maxRetries || 2,
                extractionMode: 'general',
                enableUrlNormalization: true,
                enablePaginationDiscovery: false,
                enableStructuredLogging: true,
                correlationId: ctx.correlationId,
                onProgress: (progress) => {
                    this.logger.info('Processing progress', {
                        taskName: this.name,
                        requestId: ctx.correlationId,
                        jobId: ctx.jobId,
                        completed: progress.completed,
                        total: progress.total,
                        percentage: progress.percentage,
                        errors: progress.errors,
                    });
                },
            });
            // Process the batch
            const batchResult = await processor.processBatch(input.urls);
            // Transform batch result to news output format
            const articles = await Promise.all(batchResult.results.map(async (result) => {
                if (!result.success || !result.data) {
                    return {
                        url: result.url,
                        title: undefined,
                        author: undefined,
                        publishedAt: undefined,
                        modifiedAt: undefined,
                        excerpt: undefined,
                        content: undefined,
                        wordCount: undefined,
                        readingTime: undefined,
                        tags: undefined,
                        category: undefined,
                        images: undefined,
                        metadata: {
                            extractedAt: new Date().toISOString(),
                            confidence: 0,
                            source: result.url,
                            language: undefined,
                        },
                    };
                }
                try {
                    // Extract article data from the HTML content
                    const parser = (0, parsers_1.createContentParser)(result.data.content || result.data.html || '');
                    const articleData = parser.extractAll({
                        maxContentLength: input.options?.maxContentLength || 5000,
                        extractImages: input.options?.extractImages || false,
                        maxImages: 5,
                        dateFormat: input.options?.dateFormat || 'iso',
                    });
                    return {
                        url: result.url,
                        title: articleData.title,
                        author: articleData.author,
                        publishedAt: articleData.publishedAt,
                        modifiedAt: articleData.modifiedAt,
                        excerpt: articleData.description,
                        content: articleData.content,
                        wordCount: articleData.metadata?.wordCount,
                        readingTime: articleData.metadata?.readingTime,
                        tags: articleData.tags,
                        category: undefined, // Could be extracted from URL or content
                        images: articleData.images,
                        metadata: {
                            extractedAt: new Date().toISOString(),
                            confidence: this.calculateConfidence(articleData),
                            source: result.url,
                            language: articleData.metadata?.language,
                        },
                    };
                }
                catch (error) {
                    this.logger.warn('Article extraction failed', {
                        taskName: this.name,
                        requestId: ctx.correlationId,
                        jobId: ctx.jobId,
                        url: result.url,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                    return {
                        url: result.url,
                        title: undefined,
                        author: undefined,
                        publishedAt: undefined,
                        modifiedAt: undefined,
                        excerpt: undefined,
                        content: undefined,
                        wordCount: undefined,
                        readingTime: undefined,
                        tags: undefined,
                        category: undefined,
                        images: undefined,
                        metadata: {
                            extractedAt: new Date().toISOString(),
                            confidence: 0,
                            source: result.url,
                            language: undefined,
                        },
                    };
                }
            }));
            const successful = articles.filter(a => a.title).length;
            const failed = articles.length - successful;
            const result = {
                articles,
                summary: {
                    total: batchResult.stats.totalUrls,
                    successful,
                    failed,
                    averageTime: batchResult.summary.averageResponseTime,
                    errors: batchResult.errors.map(error => ({
                        url: error.url,
                        error: error.error,
                        category: error.category,
                    })),
                },
                metadata: {
                    jobId: ctx.jobId || 'unknown',
                    task: this.name,
                    startTime: new Date(batchResult.stats.startTime).toISOString(),
                    endTime: new Date(batchResult.stats.endTime).toISOString(),
                    duration: batchResult.stats.duration,
                },
            };
            this.logger.info('News extraction completed', {
                taskName: this.name,
                requestId: ctx.correlationId,
                jobId: ctx.jobId,
                totalUrls: result.summary.total,
                successfulUrls: result.summary.successful,
                failedUrls: result.summary.failed,
                duration: result.metadata.duration,
            });
            return result;
        }
        catch (error) {
            this.logger.error('News extraction failed', {
                taskName: this.name,
                requestId: ctx.correlationId,
                jobId: ctx.jobId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
    calculateConfidence(articleData) {
        let confidence = 0;
        if (articleData.title)
            confidence += 0.3;
        if (articleData.author)
            confidence += 0.2;
        if (articleData.publishedAt)
            confidence += 0.2;
        if (articleData.content && articleData.content.length > 500)
            confidence += 0.2;
        if (articleData.description)
            confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
}
exports.NewsTask = NewsTask;
//# sourceMappingURL=task.js.map