/**
 * TypeScript wrapper for Enhanced Fetch Client
 * Provides type definitions for the JavaScript implementation
 */
export interface FetchOptions {
    signal?: AbortSignal;
    timeout?: number;
    retries?: number;
    headers?: Record<string, string>;
    method?: string;
    body?: any;
}
export interface FetchResult {
    success: boolean;
    content?: string;
    error?: string;
    status?: number;
    headers?: Record<string, string>;
    canonicalized?: boolean;
    paginationDiscovered?: boolean;
    responseTime?: number;
}
export interface EnhancedFetchClientOptions {
    timeout?: number;
    maxRetries?: number;
    enableUrlNormalization?: boolean;
    enablePaginationDiscovery?: boolean;
    structuredLogger?: any;
}
export declare class EnhancedFetchClient {
    private options;
    constructor(options?: EnhancedFetchClientOptions);
    fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
    setOptions(options: Partial<EnhancedFetchClientOptions>): void;
    getOptions(): EnhancedFetchClientOptions;
}
//# sourceMappingURL=enhanced-fetch-client.d.ts.map