/**
 * Storage Abstractions
 * Centralized storage interface for different backends
 */

import { createLogger } from '../src/lib/logger';

export interface StorageConfig {
  type: 'memory' | 'redis' | 'database';
  config: Record<string, any>;
}

export interface StorageItem<T = any> {
  key: string;
  value: T;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export abstract class Storage {
  protected logger = createLogger('storage');

  abstract get<T>(key: string): Promise<T | null>;
  abstract set<T>(key: string, value: T, ttl?: number): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract clear(): Promise<void>;
  abstract keys(pattern?: string): Promise<string[]>;
}

// Memory storage implementation
export class MemoryStorage extends Storage {
  private data = new Map<string, { value: any; expiresAt?: Date }>();

  async get<T>(key: string): Promise<T | null> {
    const item = this.data.get(key);
    if (!item) return null;

    if (item.expiresAt && item.expiresAt < new Date()) {
      this.data.delete(key);
      return null;
    }

    return item.value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : undefined;
    this.data.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const item = this.data.get(key);
    if (!item) return false;
    
    if (item.expiresAt && item.expiresAt < new Date()) {
      this.data.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.data.keys());
    if (!pattern) return allKeys;
    
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return allKeys.filter(key => regex.test(key));
  }
}

// Redis storage implementation (placeholder)
export class RedisStorage extends Storage {
  private redis: any;

  constructor(redis: any) {
    super();
    this.redis = redis;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.error('Redis get error', { key, error });
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      this.logger.error('Redis set error', { key, error });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error('Redis delete error', { key, error });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error('Redis exists error', { key, error });
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (error) {
      this.logger.error('Redis clear error', { error });
      throw error;
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    try {
      const patternToUse = pattern || '*';
      return await this.redis.keys(patternToUse);
    } catch (error) {
      this.logger.error('Redis keys error', { pattern, error });
      return [];
    }
  }
}

// Database storage implementation (placeholder)
export class DatabaseStorage extends Storage {
  private db: any;

  constructor(db: any) {
    super();
    this.db = db;
  }

  async get<T>(key: string): Promise<T | null> {
    // Implementation would depend on the specific database
    // This is a placeholder
    return null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Implementation would depend on the specific database
    // This is a placeholder
  }

  async delete(key: string): Promise<void> {
    // Implementation would depend on the specific database
    // This is a placeholder
  }

  async exists(key: string): Promise<boolean> {
    // Implementation would depend on the specific database
    // This is a placeholder
    return false;
  }

  async clear(): Promise<void> {
    // Implementation would depend on the specific database
    // This is a placeholder
  }

  async keys(pattern?: string): Promise<string[]> {
    // Implementation would depend on the specific database
    // This is a placeholder
    return [];
  }
}

// Storage factory
export function createStorage(config: StorageConfig): Storage {
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