/**
 * Configuration Management
 * Centralized configuration for the core system
 */
import { CoreConfig } from './types';
export declare class ConfigManager {
    private config;
    constructor(config?: Partial<CoreConfig>);
    get<K extends keyof CoreConfig>(key: K): CoreConfig[K];
    set<K extends keyof CoreConfig>(key: K, value: CoreConfig[K]): void;
    getAll(): CoreConfig;
    static fromEnvironment(): ConfigManager;
    validate(): {
        valid: boolean;
        errors: string[];
    };
}
export declare const defaultConfig: ConfigManager;
export declare const envConfig: ConfigManager;
//# sourceMappingURL=config.d.ts.map