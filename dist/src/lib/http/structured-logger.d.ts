/**
 * TypeScript wrapper for Structured Logger
 * Provides type definitions for the JavaScript implementation
 */
export interface StructuredLoggerOptions {
    jobId: string;
    logDirectory: string;
    enableConsoleLogging?: boolean;
    enableFileLogging?: boolean;
    logLevel?: string;
}
export interface LogEntry {
    level: string;
    message: string;
    timestamp: string;
    jobId: string;
    data?: any;
}
export declare class StructuredLogger {
    private options;
    constructor(options: StructuredLoggerOptions);
    log(level: string, message: string, data?: any): Promise<void>;
    info(message: string, data?: any): Promise<void>;
    warn(message: string, data?: any): Promise<void>;
    error(message: string, data?: any): Promise<void>;
    debug(message: string, data?: any): Promise<void>;
    finalize(): Promise<void>;
    setOptions(options: Partial<StructuredLoggerOptions>): void;
    getOptions(): StructuredLoggerOptions;
}
//# sourceMappingURL=structured-logger.d.ts.map