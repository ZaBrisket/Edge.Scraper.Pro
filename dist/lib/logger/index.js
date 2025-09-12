"use strict";
/**
 * Centralized Logger Utility for Edge.Scraper.Pro
 *
 * Provides a unified, typed logging interface that:
 * - Replaces console.log usage across the codebase
 * - Provides structured logging with Pino
 * - Supports different log levels and contexts
 * - Maintains backward compatibility with existing logging
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceConsoleLog = exports.createLogger = exports.logger = exports.TypedLogger = void 0;
const pino_1 = __importDefault(require("pino"));
const crypto_1 = require("crypto");
class TypedLogger {
    constructor(options = {}) {
        this.context = options.context || 'app';
        this.correlationId = options.correlationId || (0, crypto_1.randomUUID)();
        const baseConfig = {
            level: options.level || process.env.LOG_LEVEL || 'info',
            redact: {
                paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token'],
                remove: true,
            },
            formatters: {
                level: (label) => ({ level: label }),
            },
        };
        this.logger = (0, pino_1.default)(baseConfig).child({
            correlationId: this.correlationId,
            context: this.context,
        });
    }
    /**
     * Create a child logger with additional context
     */
    child(context) {
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
    trace(message, context) {
        this.logger.trace(context, message);
    }
    /**
     * Log debug level message
     */
    debug(message, context) {
        this.logger.debug(context, message);
    }
    /**
     * Log info level message
     */
    info(message, context) {
        this.logger.info(context, message);
    }
    /**
     * Log warn level message
     */
    warn(message, context) {
        this.logger.warn(context, message);
    }
    /**
     * Log error level message
     */
    error(message, context) {
        this.logger.error(context, message);
    }
    /**
     * Log fatal level message
     */
    fatal(message, context) {
        this.logger.fatal(context, message);
    }
    /**
     * Log with custom level
     */
    log(level, message, context) {
        this.logger[level](context, message);
    }
    /**
     * Get the underlying Pino logger for advanced usage
     */
    getPinoLogger() {
        return this.logger;
    }
    /**
     * Get correlation ID
     */
    getCorrelationId() {
        return this.correlationId;
    }
    /**
     * Get context
     */
    getContext() {
        return this.context;
    }
}
exports.TypedLogger = TypedLogger;
// Create default logger instance
const defaultLogger = new TypedLogger();
exports.logger = defaultLogger;
// Export convenience functions for backward compatibility
const createLogger = (context, correlationId) => {
    return new TypedLogger({ context, correlationId });
};
exports.createLogger = createLogger;
// Export a function that replaces console.log usage
const replaceConsoleLog = (context) => {
    const logger = (0, exports.createLogger)(context || 'console-replacement');
    // Override console methods
    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
    };
    console.log = (message, ...args) => {
        logger.info(message, { args });
    };
    console.info = (message, ...args) => {
        logger.info(message, { args });
    };
    console.warn = (message, ...args) => {
        logger.warn(message, { args });
    };
    console.error = (message, ...args) => {
        logger.error(message, { args });
    };
    console.debug = (message, ...args) => {
        logger.debug(message, { args });
    };
    // Return restore function
    const restore = () => {
        Object.assign(console, originalConsole);
    };
    return restore;
};
exports.replaceConsoleLog = replaceConsoleLog;
//# sourceMappingURL=index.js.map