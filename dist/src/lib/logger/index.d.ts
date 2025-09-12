/**
 * Centralized Logger Utility for Edge.Scraper.Pro
 *
 * Provides a unified, typed logging interface that:
 * - Replaces console.log usage across the codebase
 * - Provides structured logging with Pino
 * - Supports different log levels and contexts
 * - Maintains backward compatibility with existing logging
 */
import { Logger } from 'pino';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface LoggerOptions {
    correlationId?: string;
    context?: string;
    level?: LogLevel;
    enableConsole?: boolean;
    enableFile?: boolean;
    logDirectory?: string;
}
export interface LogContext {
    [key: string]: any;
}
declare class TypedLogger {
    private logger;
    private context;
    private correlationId;
    constructor(options?: LoggerOptions);
    /**
     * Create a child logger with additional context
     */
    child(context: LogContext): TypedLogger;
    /**
     * Log trace level message
     */
    trace(message: string, context?: LogContext): void;
    /**
     * Log debug level message
     */
    debug(message: string, context?: LogContext): void;
    /**
     * Log info level message
     */
    info(message: string, context?: LogContext): void;
    /**
     * Log warn level message
     */
    warn(message: string, context?: LogContext): void;
    /**
     * Log error level message
     */
    error(message: string, context?: LogContext): void;
    /**
     * Log fatal level message
     */
    fatal(message: string, context?: LogContext): void;
    /**
     * Log with custom level
     */
    log(level: LogLevel, message: string, context?: LogContext): void;
    /**
     * Get the underlying Pino logger for advanced usage
     */
    getPinoLogger(): Logger;
    /**
     * Get correlation ID
     */
    getCorrelationId(): string;
    /**
     * Get context
     */
    getContext(): string;
}
declare const defaultLogger: TypedLogger;
export { TypedLogger, defaultLogger as logger };
export declare const createLogger: (context?: string, correlationId?: string) => TypedLogger;
export declare const replaceConsoleLog: (context?: string) => (() => void);
//# sourceMappingURL=index.d.ts.map