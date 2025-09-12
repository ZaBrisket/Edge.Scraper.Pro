"use strict";
/**
 * Logging Utilities
 * Centralized logging with structured output and context
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultLogger = exports.Logger = void 0;
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
class Logger {
    constructor(config = { level: 'info', format: 'json' }) {
        this.config = config;
        this.pino = (0, pino_1.default)({
            level: config.level,
            formatters: {
                level: (label) => ({ level: label }),
            },
            timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
        });
    }
    debug(message, context) {
        this.pino.debug(this.formatContext(context), message);
    }
    info(message, context) {
        this.pino.info(this.formatContext(context), message);
    }
    warn(message, context) {
        this.pino.warn(this.formatContext(context), message);
    }
    error(message, context) {
        this.pino.error(this.formatContext(context), message);
    }
    // Task-specific logging methods
    taskStart(taskName, context) {
        this.info('Task started', {
            ...context,
            taskName,
            event: 'task_start',
        });
    }
    taskComplete(taskName, context) {
        this.info('Task completed', {
            ...context,
            taskName,
            event: 'task_complete',
        });
    }
    taskError(taskName, error, context) {
        this.error('Task failed', {
            ...context,
            taskName,
            error: error.message,
            stack: error.stack,
            event: 'task_error',
        });
    }
    httpRequest(method, url, context) {
        this.info('HTTP request', {
            ...context,
            method,
            url,
            event: 'http_request',
        });
    }
    httpResponse(method, url, status, duration, context) {
        this.info('HTTP response', {
            ...context,
            method,
            url,
            status,
            duration_ms: duration,
            event: 'http_response',
        });
    }
    rateLimitHit(context) {
        this.warn('Rate limit hit', {
            ...context,
            rateLimitHit: true,
            event: 'rate_limit_hit',
        });
    }
    retryAttempt(attempt, error, context) {
        this.warn('Retry attempt', {
            ...context,
            retries: attempt,
            error: error.message,
            event: 'retry_attempt',
        });
    }
    formatContext(context) {
        if (!context)
            return {};
        // Ensure required fields are present
        const formatted = {
            ...context,
        };
        // Add timestamp if not present
        if (!formatted.timestamp) {
            formatted.timestamp = new Date().toISOString();
        }
        return formatted;
    }
}
exports.Logger = Logger;
// Create logger instance
function createLogger(name, config) {
    const logger = new Logger(config);
    return logger;
}
// Default logger instance
exports.defaultLogger = new Logger();
//# sourceMappingURL=log.js.map