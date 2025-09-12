/**
 * HTTP Client Utilities
 * Centralized HTTP client with rate limiting, retries, and error handling
 */
import { TaskContext } from './types';
export interface HttpOptions {
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    userAgent?: string;
    headers?: Record<string, string>;
}
export interface HttpResponse<T = any> {
    data: T;
    status: number;
    headers: Record<string, string>;
    url: string;
    duration: number;
}
export declare class HttpClient {
    private logger;
    private rateLimiter;
    private config;
    constructor(rateLimiter: any, config?: HttpOptions);
    get<T = any>(url: string, options?: HttpOptions): Promise<HttpResponse<T>>;
    post<T = any>(url: string, data?: any, options?: HttpOptions): Promise<HttpResponse<T>>;
    private request;
    private makeRequest;
    static fromContext(ctx: TaskContext): HttpClient;
}
export declare function createHttpClient(rateLimiter: any, config?: HttpOptions): HttpClient;
//# sourceMappingURL=http.d.ts.map