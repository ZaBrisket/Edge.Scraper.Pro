/**
 * Storage Abstractions
 * Centralized storage interface for different backends
 */
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
export declare abstract class Storage {
    protected logger: import("../src/lib/logger").TypedLogger;
    abstract get<T>(key: string): Promise<T | null>;
    abstract set<T>(key: string, value: T, ttl?: number): Promise<void>;
    abstract delete(key: string): Promise<void>;
    abstract exists(key: string): Promise<boolean>;
    abstract clear(): Promise<void>;
    abstract keys(pattern?: string): Promise<string[]>;
}
export declare class MemoryStorage extends Storage {
    private data;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(): Promise<void>;
    keys(pattern?: string): Promise<string[]>;
}
export declare class RedisStorage extends Storage {
    private redis;
    constructor(redis: any);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(): Promise<void>;
    keys(pattern?: string): Promise<string[]>;
}
export declare class DatabaseStorage extends Storage {
    private db;
    constructor(db: any);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(): Promise<void>;
    keys(pattern?: string): Promise<string[]>;
}
export declare function createStorage(config: StorageConfig): Storage;
//# sourceMappingURL=storage.d.ts.map