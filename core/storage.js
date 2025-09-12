"use strict";
/**
 * Storage Abstractions
 * Centralized storage interface for different backends
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseStorage = exports.RedisStorage = exports.MemoryStorage = exports.Storage = void 0;
exports.createStorage = createStorage;
const logger_1 = require("../src/lib/logger");
class Storage {
    constructor() {
        this.logger = (0, logger_1.createLogger)('storage');
    }
}
exports.Storage = Storage;
// Memory storage implementation
class MemoryStorage extends Storage {
    constructor() {
        super(...arguments);
        this.data = new Map();
    }
    async get(key) {
        const item = this.data.get(key);
        if (!item)
            return null;
        if (item.expiresAt && item.expiresAt < new Date()) {
            this.data.delete(key);
            return null;
        }
        return item.value;
    }
    async set(key, value, ttl) {
        const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : undefined;
        this.data.set(key, { value, expiresAt });
    }
    async delete(key) {
        this.data.delete(key);
    }
    async exists(key) {
        const item = this.data.get(key);
        if (!item)
            return false;
        if (item.expiresAt && item.expiresAt < new Date()) {
            this.data.delete(key);
            return false;
        }
        return true;
    }
    async clear() {
        this.data.clear();
    }
    async keys(pattern) {
        const allKeys = Array.from(this.data.keys());
        if (!pattern)
            return allKeys;
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return allKeys.filter(key => regex.test(key));
    }
}
exports.MemoryStorage = MemoryStorage;
// Redis storage implementation (placeholder)
class RedisStorage extends Storage {
    constructor(redis) {
        super();
        this.redis = redis;
    }
    async get(key) {
        try {
            const value = await this.redis.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch (error) {
            this.logger.error('Redis get error', { key, error });
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            const serialized = JSON.stringify(value);
            if (ttl) {
                await this.redis.setex(key, ttl, serialized);
            }
            else {
                await this.redis.set(key, serialized);
            }
        }
        catch (error) {
            this.logger.error('Redis set error', { key, error });
            throw error;
        }
    }
    async delete(key) {
        try {
            await this.redis.del(key);
        }
        catch (error) {
            this.logger.error('Redis delete error', { key, error });
            throw error;
        }
    }
    async exists(key) {
        try {
            const result = await this.redis.exists(key);
            return result === 1;
        }
        catch (error) {
            this.logger.error('Redis exists error', { key, error });
            return false;
        }
    }
    async clear() {
        try {
            await this.redis.flushdb();
        }
        catch (error) {
            this.logger.error('Redis clear error', { error });
            throw error;
        }
    }
    async keys(pattern) {
        try {
            const patternToUse = pattern || '*';
            return await this.redis.keys(patternToUse);
        }
        catch (error) {
            this.logger.error('Redis keys error', { pattern, error });
            return [];
        }
    }
}
exports.RedisStorage = RedisStorage;
// Database storage implementation (placeholder)
class DatabaseStorage extends Storage {
    constructor(db) {
        super();
        this.db = db;
    }
    async get(key) {
        // Implementation would depend on the specific database
        // This is a placeholder
        return null;
    }
    async set(key, value, ttl) {
        // Implementation would depend on the specific database
        // This is a placeholder
    }
    async delete(key) {
        // Implementation would depend on the specific database
        // This is a placeholder
    }
    async exists(key) {
        // Implementation would depend on the specific database
        // This is a placeholder
        return false;
    }
    async clear() {
        // Implementation would depend on the specific database
        // This is a placeholder
    }
    async keys(pattern) {
        // Implementation would depend on the specific database
        // This is a placeholder
        return [];
    }
}
exports.DatabaseStorage = DatabaseStorage;
// Storage factory
function createStorage(config) {
    switch (config.type) {
        case 'memory':
            return new MemoryStorage();
        case 'redis':
            return new RedisStorage(config.config.redis);
        case 'database':
            return new DatabaseStorage(config.config.database);
        default:
            throw new Error(`Unsupported storage type: ${config.type}`);
    }
}
//# sourceMappingURL=storage.js.map