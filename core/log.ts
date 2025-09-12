/**
 * Logging Utilities
 * Centralized logging with structured output and context
 */

import pino from 'pino';
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

export class Logger {
  private pino: any;
  private config: CoreConfig['logging'];

  constructor(config: CoreConfig['logging'] = { level: 'info', format: 'json' }) {
    this.config = config;
    this.pino = pino({
      level: config.level,
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    });
  }

  debug(message: string, context?: LogContext): void {
    this.pino.debug(this.formatContext(context), message);
  }

  info(message: string, context?: LogContext): void {
    this.pino.info(this.formatContext(context), message);
  }

  warn(message: string, context?: LogContext): void {
    this.pino.warn(this.formatContext(context), message);
  }

  error(message: string, context?: LogContext): void {
    this.pino.error(this.formatContext(context), message);
  }

  // Task-specific logging methods
  taskStart(taskName: string, context?: LogContext): void {
    this.info('Task started', {
      ...context,
      taskName,
      event: 'task_start',
    });
  }

  taskComplete(taskName: string, context?: LogContext): void {
    this.info('Task completed', {
      ...context,
      taskName,
      event: 'task_complete',
    });
  }

  taskError(taskName: string, error: Error, context?: LogContext): void {
    this.error('Task failed', {
      ...context,
      taskName,
      error: error.message,
      stack: error.stack,
      event: 'task_error',
    });
  }

  httpRequest(method: string, url: string, context?: LogContext): void {
    this.info('HTTP request', {
      ...context,
      method,
      url,
      event: 'http_request',
    });
  }

  httpResponse(method: string, url: string, status: number, duration: number, context?: LogContext): void {
    this.info('HTTP response', {
      ...context,
      method,
      url,
      status,
      duration_ms: duration,
      event: 'http_response',
    });
  }

  rateLimitHit(context?: LogContext): void {
    this.warn('Rate limit hit', {
      ...context,
      rateLimitHit: true,
      event: 'rate_limit_hit',
    });
  }

  retryAttempt(attempt: number, error: Error, context?: LogContext): void {
    this.warn('Retry attempt', {
      ...context,
      retries: attempt,
      error: error.message,
      event: 'retry_attempt',
    });
  }

  private formatContext(context?: LogContext): LogContext {
    if (!context) return {};
    
    // Ensure required fields are present
    const formatted: LogContext = {
      ...context,
    };

    // Add timestamp if not present
    if (!formatted.timestamp) {
      formatted.timestamp = new Date().toISOString();
    }

    return formatted;
  }
}

// Create logger instance
export function createLogger(name: string, config?: CoreConfig['logging']): Logger {
  const logger = new Logger(config);
  return logger;
}

// Default logger instance
export const defaultLogger = new Logger();