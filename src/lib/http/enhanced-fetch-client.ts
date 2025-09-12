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

// Import the JavaScript implementation
// @ts-ignore - JavaScript module without types
const EnhancedFetchClientJS = require('./enhanced-fetch-client');

export class EnhancedFetchClient {
  private options: EnhancedFetchClientOptions;

  constructor(options: EnhancedFetchClientOptions = {}) {
    this.options = {
      timeout: 30000,
      maxRetries: 3,
      enableUrlNormalization: true,
      enablePaginationDiscovery: true,
      ...options,
    };
  }

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    // Create a new instance of the JavaScript client
    const client = new EnhancedFetchClientJS.EnhancedFetchClient(this.options);
    
    // Call the fetch method
    const result = await client.fetch(url, options);
    
    return result;
  }

  // Delegate other methods to the JavaScript implementation
  setOptions(options: Partial<EnhancedFetchClientOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): EnhancedFetchClientOptions {
    return { ...this.options };
  }
}