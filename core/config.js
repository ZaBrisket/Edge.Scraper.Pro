"use strict";
/**
 * Configuration Management
 * Centralized configuration for the core system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.envConfig = exports.defaultConfig = exports.ConfigManager = void 0;
class ConfigManager {
    constructor(config) {
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
    get(key) {
        return this.config[key];
    }
    set(key, value) {
        this.config[key] = value;
    }
    getAll() {
        return { ...this.config };
    }
    // Environment-based configuration
    static fromEnvironment() {
        const config = {};
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
                type: process.env.STORAGE_TYPE,
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
                ...config.logging,
                level: process.env.LOG_LEVEL,
            };
        }
        if (process.env.LOG_FORMAT) {
            config.logging = {
                ...config.logging,
                format: process.env.LOG_FORMAT,
            };
        }
        return new ConfigManager(config);
    }
    // Validation
    validate() {
        const errors = [];
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
exports.ConfigManager = ConfigManager;
// Default configuration instance
exports.defaultConfig = new ConfigManager();
// Environment-based configuration instance
exports.envConfig = ConfigManager.fromEnvironment();
//# sourceMappingURL=config.js.map