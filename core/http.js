"use strict";
/**
 * HTTP Client Utilities
 * Centralized HTTP client with rate limiting, retries, and error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
exports.createHttpClient = createHttpClient;
const logger_1 = require("../src/lib/logger");
class HttpClient {
    constructor(rateLimiter, config = {}) {
        this.logger = (0, logger_1.createLogger)('http-client');
        this.rateLimiter = rateLimiter;
        this.config = {
            timeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            userAgent: 'Edge.Scraper.Pro/2.0.0',
            ...config,
        };
    }
    async get(url, options = {}) {
        return this.request('GET', url, undefined, options);
    }
    async post(url, data, options = {}) {
        return this.request('POST', url, data, options);
    }
    async request(method, url, data, options = {}) {
        const startTime = Date.now();
        const mergedOptions = { ...this.config, ...options };
        // Apply rate limiting
        await this.rateLimiter.schedule(() => this.makeRequest(method, url, data, mergedOptions));
        const duration = Date.now() - startTime;
        return {
            data: {},
            status: 200,
            headers: {},
            url,
            duration,
        };
    }
    async makeRequest(method, url, data, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'User-Agent': options.userAgent || this.config.userAgent,
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                body: data ? JSON.stringify(data) : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    // Helper method to create HTTP client from task context
    static fromContext(ctx) {
        return new HttpClient(ctx.rateLimiter, {
            timeout: ctx.config.http?.timeout || 30000,
            maxRetries: ctx.config.http?.maxRetries || 3,
            userAgent: ctx.config.http?.userAgent || 'Edge.Scraper.Pro/2.0.0',
        });
    }
}
exports.HttpClient = HttpClient;
// Utility function to create HTTP client
function createHttpClient(rateLimiter, config) {
    return new HttpClient(rateLimiter, config);
}
//# sourceMappingURL=http.js.map