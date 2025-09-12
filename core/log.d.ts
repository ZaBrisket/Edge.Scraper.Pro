/**
 * Logging Utilities
 * Centralized logging with structured output and context
 */
import { CoreConfig } from './types';
export interface LogContext {
    taskName?: string;
    requestId?: string;
    targetHost?: string;
    retries?: number;
    rateLimitHit?: boolean;
    duration_ms?: number;
    item_count?: number;
    [key: string]: any;
}
export declare class Logger {
    private pino;
    private config;
    constructor(config?: CoreConfig['logging']);
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
    taskStart(taskName: string, context?: LogContext): void;
    taskComplete(taskName: string, context?: LogContext): void;
    taskError(taskName: string, error: Error, context?: LogContext): void;
    httpRequest(method: string, url: string, context?: LogContext): void;
    httpResponse(method: string, url: string, status: number, duration: number, context?: LogContext): void;
    rateLimitHit(context?: LogContext): void;
    retryAttempt(attempt: number, error: Error, context?: LogContext): void;
    private formatContext;
}
export declare function createLogger(name: string, config?: CoreConfig['logging']): Logger;
export declare const defaultLogger: Logger;
//# sourceMappingURL=log.d.ts.map