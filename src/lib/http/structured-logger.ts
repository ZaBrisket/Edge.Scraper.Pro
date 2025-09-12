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

// Import the JavaScript implementation
// @ts-ignore - JavaScript module without types
const StructuredLoggerJS = require('./structured-logger');

export class StructuredLogger {
  private options: StructuredLoggerOptions;

  constructor(options: StructuredLoggerOptions) {
    this.options = {
      enableConsoleLogging: true,
      enableFileLogging: true,
      logLevel: 'info',
      ...options,
    };
  }

  async log(level: string, message: string, data?: any): Promise<void> {
    // Create a new instance of the JavaScript logger
    const logger = new StructuredLoggerJS.StructuredLogger(this.options);
    
    // Call the log method
    await logger.log(level, message, data);
  }

  async info(message: string, data?: any): Promise<void> {
    return this.log('info', message, data);
  }

  async warn(message: string, data?: any): Promise<void> {
    return this.log('warn', message, data);
  }

  async error(message: string, data?: any): Promise<void> {
    return this.log('error', message, data);
  }

  async debug(message: string, data?: any): Promise<void> {
    return this.log('debug', message, data);
  }

  async finalize(): Promise<void> {
    const logger = new StructuredLoggerJS.StructuredLogger(this.options);
    await logger.finalize();
  }

  // Delegate other methods to the JavaScript implementation
  setOptions(options: Partial<StructuredLoggerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): StructuredLoggerOptions {
    return { ...this.options };
  }
}