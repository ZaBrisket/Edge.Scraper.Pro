/**
 * Centralized Logger Utility for Edge.Scraper.Pro
 *
 * Provides a unified, typed logging interface that:
 * - Replaces console.log usage across the codebase
 * - Provides structured logging with Pino
 * - Supports different log levels and contexts
 * - Maintains backward compatibility with existing logging
 */

import pino, { Logger } from 'pino';
import { randomUUID } from 'crypto';

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

class TypedLogger {
  private logger: Logger;
  private context: string;
  private correlationId: string;

  constructor(options: LoggerOptions = {}) {
    this.context = options.context || 'app';
    this.correlationId = options.correlationId || randomUUID();

    const baseConfig = {
      level: options.level || (process.env.LOG_LEVEL as LogLevel) || 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token'],
        remove: true,
      },
      formatters: {
        level: (label: string) => ({ level: label }),
      },
    };

    this.logger = pino(baseConfig).child({
      correlationId: this.correlationId,
      context: this.context,
    });
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): TypedLogger {
    const childLogger = new TypedLogger({
      correlationId: this.correlationId,
      context: this.context,
    });
    childLogger.logger = this.logger.child(context);
    return childLogger;
  }

  /**
   * Log trace level message
   */
  trace(message: string, context?: LogContext): void {
    this.logger.trace(context, message);
  }

  /**
   * Log debug level message
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug(context, message);
  }

  /**
   * Log info level message
   */
  info(message: string, context?: LogContext): void {
    this.logger.info(context, message);
  }

  /**
   * Log warn level message
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn(context, message);
  }

  /**
   * Log error level message
   */
  error(message: string, context?: LogContext): void {
    this.logger.error(context, message);
  }

  /**
   * Log fatal level message
   */
  fatal(message: string, context?: LogContext): void {
    this.logger.fatal(context, message);
  }

  /**
   * Log with custom level
   */
  log(level: LogLevel, message: string, context?: LogContext): void {
    this.logger[level](context, message);
  }

  /**
   * Get the underlying Pino logger for advanced usage
   */
  getPinoLogger(): Logger {
    return this.logger;
  }

  /**
   * Get correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Get context
   */
  getContext(): string {
    return this.context;
  }
}

// Create default logger instance
const defaultLogger = new TypedLogger();

// Export both the class and default instance
export { TypedLogger, defaultLogger as logger };

// Export convenience functions for backward compatibility
export const createLogger = (context?: string, correlationId?: string): TypedLogger => {
  return new TypedLogger({ context, correlationId });
};

// Export a function that replaces console.log usage
export const replaceConsoleLog = (context?: string): (() => void) => {
  const logger = createLogger(context || 'console-replacement');

  // Override console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  console.log = (message: string, ...args: any[]) => {
    logger.info(message, { args });
  };

  console.info = (message: string, ...args: any[]) => {
    logger.info(message, { args });
  };

  console.warn = (message: string, ...args: any[]) => {
    logger.warn(message, { args });
  };

  console.error = (message: string, ...args: any[]) => {
    logger.error(message, { args });
  };

  console.debug = (message: string, ...args: any[]) => {
    logger.debug(message, { args });
  };

  // Return restore function
  const restore = () => {
    Object.assign(console, originalConsole);
  };
  return restore;
};
