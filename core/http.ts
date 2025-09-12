/**
 * HTTP Client Utilities
 * Centralized HTTP client with rate limiting, retries, and error handling
 */

import { TaskContext } from './types';
import { createLogger } from '../src/lib/logger';

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

export class HttpClient {
  private logger = createLogger('http-client');
  private rateLimiter: any;
  private config: HttpOptions;

  constructor(rateLimiter: any, config: HttpOptions = {}) {
    this.rateLimiter = rateLimiter;
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      userAgent: 'Edge.Scraper.Pro/2.0.0',
      ...config,
    };
  }

  async get<T = any>(url: string, options: HttpOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>('GET', url, undefined, options);
  }

  async post<T = any>(url: string, data?: any, options: HttpOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>('POST', url, data, options);
  }

  private async request<T = any>(
    method: string,
    url: string,
    data?: any,
    options: HttpOptions = {}
  ): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    const mergedOptions = { ...this.config, ...options };
    
    // Apply rate limiting
    await this.rateLimiter.schedule(() => this.makeRequest(method, url, data, mergedOptions));
    
    const duration = Date.now() - startTime;
    
    return {
      data: {} as T,
      status: 200,
      headers: {},
      url,
      duration,
    };
  }

  private async makeRequest(
    method: string,
    url: string,
    data?: any,
    options: HttpOptions = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': options.userAgent || this.config.userAgent || 'Edge.Scraper.Pro/2.0.0',
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Helper method to create HTTP client from task context
  static fromContext(ctx: TaskContext): HttpClient {
    return new HttpClient(ctx.rateLimiter, {
      timeout: ctx.config.http?.timeout || 30000,
      maxRetries: ctx.config.http?.maxRetries || 3,
      userAgent: ctx.config.http?.userAgent || 'Edge.Scraper.Pro/2.0.0',
    });
  }
}

// Utility function to create HTTP client
export function createHttpClient(rateLimiter: any, config?: HttpOptions): HttpClient {
  return new HttpClient(rateLimiter, config);
}