/**
 * Enhanced Batch Processing Module for Edge.Scraper.Pro
 *
 * Hardened implementation with:
 * - Comprehensive input validation
 * - Thread-safe state management
 * - Graceful shutdown handling
 * - Memory-efficient processing
 * - Idempotent operations
 * - Detailed error tracking with bounded memory usage
 */
declare const ERROR_CATEGORIES: {
    readonly NETWORK: "network";
    readonly TIMEOUT: "timeout";
    readonly PARSING: "parsing";
    readonly VALIDATION: "validation";
    readonly RATE_LIMIT: "rate_limit";
    readonly SERVER_ERROR: "server_error";
    readonly CLIENT_ERROR: "client_error";
    readonly HTTP_404: "http_404";
    readonly HTTP_403: "http_403";
    readonly HTTP_401: "http_401";
    readonly DNS_ERROR: "dns_error";
    readonly BLOCKED_BY_ROBOTS: "blocked_by_robots";
    readonly ANTI_BOT_CHALLENGE: "anti_bot_challenge";
    readonly REDIRECT_LOOP: "redirect_loop";
    readonly SSL_ERROR: "ssl_error";
    readonly UNKNOWN: "unknown";
};
declare const BATCH_STATES: {
    readonly IDLE: "idle";
    readonly VALIDATING: "validating";
    readonly PROCESSING: "processing";
    readonly PAUSED: "paused";
    readonly STOPPED: "stopped";
    readonly COMPLETED: "completed";
    readonly ERROR: "error";
};
type ErrorCategory = (typeof ERROR_CATEGORIES)[keyof typeof ERROR_CATEGORIES];
type BatchState = (typeof BATCH_STATES)[keyof typeof BATCH_STATES];
export interface BatchOptions {
    concurrency?: number;
    delayMs?: number;
    timeout?: number;
    maxRetries?: number;
    errorReportSize?: number;
    extractionMode?: 'sports' | 'supplier-directory' | 'general';
    enableUrlNormalization?: boolean;
    enablePaginationDiscovery?: boolean;
    enableStructuredLogging?: boolean;
    onProgress?: (progress: ProgressInfo) => void;
    onError?: (error: ProcessingError) => void;
    onComplete?: (result: BatchResult) => void;
    correlationId?: string;
}
export interface ProgressInfo {
    completed: number;
    total: number;
    percentage: number;
    currentUrl?: string;
    errors: number;
    state: BatchState;
}
export interface ProcessingError {
    url: string;
    error: string;
    category: ErrorCategory;
    timestamp: number;
    attempt: number;
    retryable: boolean;
}
export interface BatchResult {
    batchId: string;
    stats: {
        totalUrls: number;
        processedUrls: number;
        successfulUrls: number;
        failedUrls: number;
        skippedUrls: number;
        startTime: number;
        endTime: number;
        duration: number;
        processingTime?: number;
        averageProcessingTime?: number;
        throughput?: number;
    };
    results: Array<{
        url: string;
        success: boolean;
        data?: any;
        error?: string;
        category?: ErrorCategory;
        responseTime?: number;
        canonicalized?: boolean;
        paginationDiscovered?: boolean;
    }>;
    errors: ProcessingError[];
    summary: {
        errorCategories: Record<ErrorCategory, number>;
        averageResponseTime: number;
        successRate: number;
    };
}
export declare class BatchProcessor {
    readonly batchId: string;
    readonly correlationId: string;
    private logger;
    private options;
    private state;
    private urls;
    private results;
    private errors;
    private startTime;
    private endTime;
    private processedCount;
    private successfulCount;
    private failedCount;
    private skippedCount;
    private structuredLogger?;
    private extractor?;
    private fetchClient?;
    private abortController?;
    constructor(options?: BatchOptions);
    private validateConfiguration;
    private initializeComponents;
    processBatch(urls: string[]): Promise<BatchResult>;
    private processUrlsInBatches;
    private processUrl;
    private categorizeError;
    private isRetryableError;
    private updateProgress;
    private generateResult;
    private cleanup;
    pause(): void;
    resume(): void;
    stop(): void;
    getState(): BatchState;
    getProgress(): ProgressInfo;
}
export {};
//# sourceMappingURL=batch-processor.d.ts.map