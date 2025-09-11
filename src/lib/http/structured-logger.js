const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

/**
 * Structured Logger - Enhanced logging with error taxonomy and NDJSON output
 * 
 * This module provides structured logging with:
 * - Error classification and taxonomy
 * - NDJSON output for easy parsing
 * - Job-specific log files
 * - Performance metrics and timing
 * - Request/response correlation
 */
class StructuredLogger {
  constructor(options = {}) {
    this.options = {
      logDir: options.logDir || './logs',
      level: options.level || 'info',
      jobId: options.jobId || randomUUID(),
      enableFileLogging: options.enableFileLogging !== false,
      enableConsoleLogging: options.enableConsoleLogging !== false,
      ...options
    };
    
    // Ensure log directory exists
    if (this.options.enableFileLogging) {
      if (!fs.existsSync(this.options.logDir)) {
        fs.mkdirSync(this.options.logDir, { recursive: true });
      }
    }
    
    // Create base logger
    this.baseLogger = pino({
      level: this.options.level,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({ 
          pid: bindings.pid,
          hostname: bindings.hostname,
          jobId: this.options.jobId
        })
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: pino.stdSerializers.err,
        req: this.serializeRequest,
        res: this.serializeResponse,
        error: this.serializeError
      }
    });
    
    // Create job-specific logger
    this.jobLogger = this.createJobLogger();
    
    // Error taxonomy
    this.errorTaxonomy = {
      // HTTP errors
      'http_200': { category: 'success', severity: 'info', description: 'Request successful' },
      'http_201': { category: 'success', severity: 'info', description: 'Resource created' },
      'http_204': { category: 'success', severity: 'info', description: 'No content' },
      'http_301': { category: 'redirect', severity: 'info', description: 'Permanent redirect' },
      'http_302': { category: 'redirect', severity: 'info', description: 'Temporary redirect' },
      'http_304': { category: 'cached', severity: 'info', description: 'Not modified' },
      'http_400': { category: 'client_error', severity: 'warn', description: 'Bad request' },
      'http_401': { category: 'client_error', severity: 'warn', description: 'Unauthorized' },
      'http_403': { category: 'client_error', severity: 'warn', description: 'Forbidden' },
      'http_404': { category: 'client_error', severity: 'warn', description: 'Not found' },
      'http_429': { category: 'rate_limit', severity: 'warn', description: 'Rate limited' },
      'http_500': { category: 'server_error', severity: 'error', description: 'Internal server error' },
      'http_502': { category: 'server_error', severity: 'error', description: 'Bad gateway' },
      'http_503': { category: 'server_error', severity: 'error', description: 'Service unavailable' },
      'http_504': { category: 'server_error', severity: 'error', description: 'Gateway timeout' },
      
      // Network errors
      'dns_error': { category: 'network_error', severity: 'error', description: 'DNS resolution failed' },
      'connection_refused': { category: 'network_error', severity: 'error', description: 'Connection refused' },
      'timeout': { category: 'network_error', severity: 'error', description: 'Request timeout' },
      'network_error': { category: 'network_error', severity: 'error', description: 'Generic network error' },
      
      // Application errors
      'invalid_url': { category: 'validation_error', severity: 'error', description: 'Invalid URL format' },
      'validation_error': { category: 'validation_error', severity: 'error', description: 'Validation failed' },
      'parse_error': { category: 'parse_error', severity: 'error', description: 'Content parsing failed' },
      'circuit_open': { category: 'circuit_breaker', severity: 'warn', description: 'Circuit breaker open' },
      'rate_limit_exhausted': { category: 'rate_limit', severity: 'warn', description: 'Rate limit retries exhausted' },
      
      // Discovery errors
      'canonicalization_failed': { category: 'discovery_error', severity: 'error', description: 'URL canonicalization failed' },
      'pagination_failed': { category: 'discovery_error', severity: 'warn', description: 'Pagination discovery failed' },
      'base_page_failed': { category: 'discovery_error', severity: 'error', description: 'Base page not accessible' },
      'discovery_error': { category: 'discovery_error', severity: 'error', description: 'Generic discovery error' },
      
      // Bot detection
      'blocked_by_robots': { category: 'bot_detection', severity: 'warn', description: 'Blocked by robots.txt' },
      'anti_bot_challenge': { category: 'bot_detection', severity: 'warn', description: 'Anti-bot challenge detected' },
      
      // Unknown
      'unknown': { category: 'unknown', severity: 'error', description: 'Unknown error type' }
    };
    
    // Metrics tracking
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      errorsByType: {},
      errorsByCategory: {},
      responseTimes: [],
      startTime: Date.now()
    };
  }

  /**
   * Create job-specific logger with file output
   * @returns {Object} Job logger instance
   */
  createJobLogger() {
    const logFile = path.join(this.options.logDir, `${this.options.jobId}.log`);
    
    const jobLogger = pino({
      level: this.options.level,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({ 
          pid: bindings.pid,
          hostname: bindings.hostname,
          jobId: this.options.jobId
        })
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: pino.stdSerializers.err,
        req: this.serializeRequest,
        res: this.serializeResponse,
        error: this.serializeError
      }
    }, this.options.enableFileLogging ? fs.createWriteStream(logFile) : process.stdout);
    
    return jobLogger;
  }

  /**
   * Serialize request object for logging
   * @param {Object} req - Request object
   * @returns {Object} Serialized request
   */
  serializeRequest(req) {
    if (!req) return req;
    
    return {
      method: req.method,
      url: req.url,
      headers: req.headers,
      correlationId: req.correlationId,
      requestId: req.requestId,
      timestamp: req.timestamp
    };
  }

  /**
   * Serialize response object for logging
   * @param {Object} res - Response object
   * @returns {Object} Serialized response
   */
  serializeResponse(res) {
    if (!res) return res;
    
    return {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      responseTime: res.responseTime,
      size: res.size,
      finalUrl: res.finalUrl,
      redirectChain: res.redirectChain
    };
  }

  /**
   * Serialize error object for logging
   * @param {Object} error - Error object
   * @returns {Object} Serialized error
   */
  serializeError(error) {
    if (!error) return error;
    
    return {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
      meta: error.meta,
      errorClass: error.errorClass,
      category: error.category,
      severity: error.severity
    };
  }

  /**
   * Classify error and add taxonomy information
   * @param {Error|Object} error - Error to classify
   * @returns {Object} Classified error with taxonomy
   */
  classifyError(error) {
    let errorClass = 'unknown';
    let category = 'unknown';
    let severity = 'error';
    let description = 'Unknown error';
    
    // Extract error class from error object
    if (error.errorClass) {
      errorClass = error.errorClass;
    } else if (error.code) {
      errorClass = error.code;
    } else if (error.status) {
      errorClass = `http_${error.status}`;
    } else if (error.name) {
      errorClass = error.name.toLowerCase().replace('error', '');
    }
    
    // Get taxonomy information
    const taxonomy = this.errorTaxonomy[errorClass];
    if (taxonomy) {
      category = taxonomy.category;
      severity = taxonomy.severity;
      description = taxonomy.description;
    }
    
    return {
      errorClass,
      category,
      severity,
      description,
      originalError: error
    };
  }

  /**
   * Log a request with structured data
   * @param {Object} data - Request data
   */
  logRequest(data) {
    const logData = {
      type: 'request',
      ...data,
      timestamp: new Date().toISOString()
    };
    
    this.jobLogger.info(logData);
    if (this.options.enableConsoleLogging) {
      this.baseLogger.info(logData);
    }
    
    this.updateMetrics('request', data);
  }

  /**
   * Log a response with structured data
   * @param {Object} data - Response data
   */
  logResponse(data) {
    const logData = {
      type: 'response',
      ...data,
      timestamp: new Date().toISOString()
    };
    
    this.jobLogger.info(logData);
    if (this.options.enableConsoleLogging) {
      this.baseLogger.info(logData);
    }
    
    this.updateMetrics('response', data);
  }

  /**
   * Log an error with structured data and taxonomy
   * @param {Object} data - Error data
   */
  logError(data) {
    const classifiedError = this.classifyError(data.error || data);
    
    const logData = {
      type: 'error',
      ...data,
      error: {
        ...classifiedError,
        ...data.error
      },
      timestamp: new Date().toISOString()
    };
    
    this.jobLogger.error(logData);
    if (this.options.enableConsoleLogging) {
      this.baseLogger.error(logData);
    }
    
    this.updateMetrics('error', { ...data, errorClass: classifiedError.errorClass });
  }

  /**
   * Log URL canonicalization result
   * @param {Object} data - Canonicalization data
   */
  logCanonicalization(data) {
    const logData = {
      type: 'canonicalization',
      ...data,
      timestamp: new Date().toISOString()
    };
    
    this.jobLogger.info(logData);
    if (this.options.enableConsoleLogging) {
      this.baseLogger.info(logData);
    }
    
    this.updateMetrics('canonicalization', data);
  }

  /**
   * Log pagination discovery result
   * @param {Object} data - Discovery data
   */
  logDiscovery(data) {
    const logData = {
      type: 'discovery',
      ...data,
      timestamp: new Date().toISOString()
    };
    
    this.jobLogger.info(logData);
    if (this.options.enableConsoleLogging) {
      this.baseLogger.info(logData);
    }
    
    this.updateMetrics('discovery', data);
  }

  /**
   * Log job summary
   * @param {Object} data - Summary data
   */
  logSummary(data) {
    const summary = {
      type: 'summary',
      jobId: this.options.jobId,
      ...data,
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    };
    
    this.jobLogger.info(summary);
    if (this.options.enableConsoleLogging) {
      this.baseLogger.info(summary);
    }
  }

  /**
   * Update metrics based on log data
   * @param {string} type - Log type
   * @param {Object} data - Log data
   */
  updateMetrics(type, data) {
    this.metrics.totalRequests++;
    
    if (type === 'response' && data.status < 400) {
      this.metrics.successfulRequests++;
    } else if (type === 'error' || (type === 'response' && data.status >= 400)) {
      this.metrics.failedRequests++;
    }
    
    if (data.errorClass) {
      this.metrics.errorsByType[data.errorClass] = (this.metrics.errorsByType[data.errorClass] || 0) + 1;
    }
    
    if (data.category) {
      this.metrics.errorsByCategory[data.category] = (this.metrics.errorsByCategory[data.category] || 0) + 1;
    }
    
    if (data.responseTime) {
      this.metrics.responseTimes.push(data.responseTime);
    }
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    const now = Date.now();
    const runtime = now - this.metrics.startTime;
    
    const avgResponseTime = this.metrics.responseTimes.length > 0 
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length 
      : 0;
    
    return {
      ...this.metrics,
      runtime,
      avgResponseTime: Math.round(avgResponseTime),
      successRate: this.metrics.totalRequests > 0 
        ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      errorRate: this.metrics.totalRequests > 0 
        ? (this.metrics.failedRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      errorsByType: {},
      errorsByCategory: {},
      responseTimes: [],
      startTime: Date.now()
    };
  }

  /**
   * Create a child logger with additional context
   * @param {Object} context - Additional context
   * @returns {Object} Child logger
   */
  child(context) {
    const childLogger = Object.create(this);
    childLogger.jobLogger = this.jobLogger.child(context);
    childLogger.baseLogger = this.baseLogger.child(context);
    
    // Delegate pino methods to the child loggers
    childLogger.info = (...args) => childLogger.jobLogger.info(...args);
    childLogger.warn = (...args) => childLogger.jobLogger.warn(...args);
    childLogger.error = (...args) => childLogger.jobLogger.error(...args);
    childLogger.debug = (...args) => childLogger.jobLogger.debug(...args);
    childLogger.trace = (...args) => childLogger.jobLogger.trace(...args);
    childLogger.fatal = (...args) => childLogger.jobLogger.fatal(...args);
    
    return childLogger;
  }

  /**
   * Get log file path for this job
   * @returns {string} Log file path
   */
  getLogFilePath() {
    return path.join(this.options.logDir, `${this.options.jobId}.log`);
  }

  /**
   * Export logs as NDJSON
   * @returns {string} NDJSON formatted logs
   */
  exportLogsAsNDJSON() {
    try {
      const logFile = this.getLogFilePath();
      if (fs.existsSync(logFile)) {
        return fs.readFileSync(logFile, 'utf8');
      }
      return '';
    } catch (error) {
      this.baseLogger.error({ error: error.message }, 'Failed to export logs');
      return '';
    }
  }
}

module.exports = { StructuredLogger };