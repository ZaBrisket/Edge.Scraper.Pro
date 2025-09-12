/**
 * Configuration Management
 * Centralized configuration for the core system
 */

import { CoreConfig } from './types';

export class ConfigManager {
  private config: CoreConfig;

  constructor(config?: Partial<CoreConfig>) {
    this.config = {
      http: {
        timeout: 30000,
        maxRetries: 3,
        userAgent: 'Edge.Scraper.Pro/2.0.0',
      },
      rateLimit: {
        requestsPerMinute: 60,
        burstLimit: 10,
      },
      storage: {
        type: 'memory',
        config: {},
      },
      logging: {
        level: 'info',
        format: 'json',
      },
      ...config,
    };
  }

  get<K extends keyof CoreConfig>(key: K): CoreConfig[K] {
    return this.config[key];
  }

  set<K extends keyof CoreConfig>(key: K, value: CoreConfig[K]): void {
    this.config[key] = value;
  }

  getAll(): CoreConfig {
    return { ...this.config };
  }

  // Environment-based configuration
  static fromEnvironment(): ConfigManager {
    const config: Partial<CoreConfig> = {};

    // HTTP configuration
    if (process.env.HTTP_TIMEOUT) {
      config.http = {
        ...config.http,
        timeout: parseInt(process.env.HTTP_TIMEOUT, 10),
        maxRetries: config.http?.maxRetries || 3,
        userAgent: config.http?.userAgent || 'Edge.Scraper.Pro/2.0.0',
      };
    }

    if (process.env.HTTP_MAX_RETRIES) {
      config.http = {
        ...config.http,
        timeout: config.http?.timeout || 30000,
        maxRetries: parseInt(process.env.HTTP_MAX_RETRIES, 10),
        userAgent: config.http?.userAgent || 'Edge.Scraper.Pro/2.0.0',
      };
    }

    if (process.env.HTTP_USER_AGENT) {
      config.http = {
        ...config.http,
        timeout: config.http?.timeout || 30000,
        maxRetries: config.http?.maxRetries || 3,
        userAgent: process.env.HTTP_USER_AGENT,
      };
    }

    // Rate limiting configuration
    if (process.env.RATE_LIMIT_RPM) {
      config.rateLimit = {
        ...config.rateLimit,
        requestsPerMinute: parseInt(process.env.RATE_LIMIT_RPM, 10),
        burstLimit: config.rateLimit?.burstLimit || 10,
      };
    }

    if (process.env.RATE_LIMIT_BURST) {
      config.rateLimit = {
        ...config.rateLimit,
        requestsPerMinute: config.rateLimit?.requestsPerMinute || 60,
        burstLimit: parseInt(process.env.RATE_LIMIT_BURST, 10),
      };
    }

    // Storage configuration
    if (process.env.STORAGE_TYPE) {
      config.storage = {
        type: process.env.STORAGE_TYPE as 'memory' | 'redis' | 'database',
        config: {},
      };
    }

    // Redis configuration
    if (process.env.REDIS_URL) {
      config.storage = {
        type: 'redis',
        config: {
          redis: {
            url: process.env.REDIS_URL,
          },
        },
      };
    }

    // Logging configuration
    if (process.env.LOG_LEVEL) {
      config.logging = {
        level: process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error',
        format: config.logging?.format || 'json',
      };
    }

    if (process.env.LOG_FORMAT) {
      config.logging = {
        level: config.logging?.level || 'info',
        format: process.env.LOG_FORMAT as 'json' | 'text',
      };
    }

    return new ConfigManager(config);
  }

  // Validation
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate HTTP config
    if (this.config.http.timeout < 1000) {
      errors.push('HTTP timeout must be at least 1000ms');
    }

    if (this.config.http.maxRetries < 0) {
      errors.push('HTTP max retries must be non-negative');
    }

    // Validate rate limit config
    if (this.config.rateLimit.requestsPerMinute < 1) {
      errors.push('Rate limit requests per minute must be at least 1');
    }

    if (this.config.rateLimit.burstLimit < 1) {
      errors.push('Rate limit burst limit must be at least 1');
    }

    // Validate storage config
    if (!['memory', 'redis', 'database'].includes(this.config.storage.type)) {
      errors.push('Storage type must be one of: memory, redis, database');
    }

    // Validate logging config
    if (!['debug', 'info', 'warn', 'error'].includes(this.config.logging.level)) {
      errors.push('Log level must be one of: debug, info, warn, error');
    }

    if (!['json', 'text'].includes(this.config.logging.format)) {
      errors.push('Log format must be one of: json, text');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Default configuration instance
export const defaultConfig = new ConfigManager();

// Environment-based configuration instance
export const envConfig = ConfigManager.fromEnvironment();