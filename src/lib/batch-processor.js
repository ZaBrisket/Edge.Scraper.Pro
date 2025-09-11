/**
 * Enhanced Batch Processing Module for Edge.Scraper.Pro
 * 
 * Hardened implementation with:
 * - Comprehensive input validation
 * - Thread-safe state management
 * - Graceful shutdown handling
 * - Memory-efficient processing
 * - Idempotent operations
 * - Detailed error tracking with bounded memory usage
 */

const { URL } = require('url');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const config = require('./config');
const createLogger = require('./http/logging');

// Input validation schemas
const urlArraySchema = z.array(z.string()).min(1).max(10000);

const batchOptionsSchema = z.object({
  concurrency: z.number().int().min(1).max(100).optional(),
  delayMs: z.number().int().min(0).max(60000).optional(),
  timeout: z.number().int().min(100).max(300000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  errorReportSize: z.number().int().min(10).max(1000).optional(),
  onProgress: z.function().optional(),
  onError: z.function().optional(),
  onComplete: z.function().optional(),
  correlationId: z.string().uuid().optional()
}).strict();

// Error categories for detailed reporting
const ERROR_CATEGORIES = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  PARSING: 'parsing',
  VALIDATION: 'validation',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  CLIENT_ERROR: 'client_error',
  UNKNOWN: 'unknown'
};

// Batch processing states
const BATCH_STATES = {
  IDLE: 'idle',
  VALIDATING: 'validating',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Global tracking for graceful shutdown
const activeBatches = new Map();

class BatchProcessor {
  constructor(options = {}) {
    // Validate options
    const validatedOptions = batchOptionsSchema.parse(options);
    
    this.batchId = randomUUID();
    this.correlationId = validatedOptions.correlationId || this.batchId;
    this.logger = createLogger(this.correlationId);
    
    this.options = {
      concurrency: validatedOptions.concurrency || config.MAX_CONCURRENCY || 5,
      delayMs: validatedOptions.delayMs ?? 250,
      timeout: validatedOptions.timeout || config.DEFAULT_TIMEOUT_MS || 30000,
      maxRetries: validatedOptions.maxRetries ?? config.MAX_RETRIES ?? 3,
      errorReportSize: validatedOptions.errorReportSize || 50,
      ...validatedOptions
    };
    
    // Validate final options
    this.validateConfiguration();
    
    this.state = BATCH_STATES.IDLE;
    this.results = [];
    this.errors = [];
    this.errorPatterns = new Map();
    this.processedCount = 0;
    this.totalCount = 0;
    this.startTime = null;
    this.endTime = null;
    
    // Control flags with thread-safe access
    this.controls = {
      paused: false,
      aborted: false,
      shutdownRequested: false
    };
    
    // Progress callbacks with error boundaries
    this.onProgress = this.wrapCallback(validatedOptions.onProgress || (() => {}));
    this.onError = this.wrapCallback(validatedOptions.onError || (() => {}));
    this.onComplete = this.wrapCallback(validatedOptions.onComplete || (() => {}));
    
    // Memory management
    this.maxMemoryUsage = 100 * 1024 * 1024; // 100MB limit
    this.lastMemoryCheck = Date.now();
    this.memoryCheckInterval = 5000; // Check every 5 seconds
    
    // Track active batch
    activeBatches.set(this.batchId, this);
    
    this.logger.info({ batchId: this.batchId, options: this.options }, 'Batch processor created');
  }

  /**
   * Validate configuration values
   */
  validateConfiguration() {
    if (this.options.timeout <= this.options.delayMs) {
      throw new Error('Timeout must be greater than delay between requests');
    }
    
    if (this.options.concurrency * this.options.errorReportSize > 10000) {
      this.logger.warn('Large concurrency and error report size may consume significant memory');
    }
  }

  /**
   * Wrap callbacks with error boundaries
   */
  wrapCallback(callback) {
    return (...args) => {
      try {
        return callback(...args);
      } catch (error) {
        this.logger.error({ error: error.message, stack: error.stack }, 'Callback error');
        // Don't let callback errors break the processing
      }
    };
  }

  /**
   * Process a batch of URLs with comprehensive validation and error handling
   * @param {string[]} urls - Array of URLs to process
   * @param {Function} processor - Function to process each URL
   * @returns {Promise<BatchResult>} Batch processing result
   */
  async processBatch(urls, processor) {
    // Validate inputs
    const validatedUrls = urlArraySchema.parse(urls);
    if (typeof processor !== 'function') {
      throw new TypeError('Processor must be a function');
    }
    
    // Check if already processing
    if (this.state !== BATCH_STATES.IDLE && this.state !== BATCH_STATES.COMPLETED) {
      throw new Error(`Cannot start new batch while in ${this.state} state`);
    }
    
    this.reset();
    this.state = BATCH_STATES.VALIDATING;
    this.totalCount = validatedUrls.length;
    this.startTime = Date.now();
    
    this.logger.info({ 
      batchId: this.batchId, 
      urlCount: this.totalCount 
    }, 'Starting batch processing');
    
    try {
      // Phase 1: Validation and deduplication
      const validationResult = await this.validateAndDeduplicate(validatedUrls);
      
      if (validationResult.validUrls.length === 0) {
        throw new Error('No valid URLs to process after validation');
      }
      
      // Report validation results
      this.onProgress({
        phase: 'validation',
        total: validatedUrls.length,
        valid: validationResult.validUrls.length,
        invalid: validationResult.invalidUrls.length,
        duplicates: validationResult.duplicates.length,
        validationDetails: validationResult
      });
      
      // Phase 2: Process valid URLs
      this.state = BATCH_STATES.PROCESSING;
      const processedResults = await this.processUrls(
        validationResult.validUrls,
        processor
      );
      
      // Phase 3: Compile final results
      this.state = BATCH_STATES.COMPLETED;
      this.endTime = Date.now();
      
      const finalResult = this.compileFinalResult(
        validationResult,
        processedResults
      );
      
      this.logger.info({ 
        batchId: this.batchId,
        stats: finalResult.stats 
      }, 'Batch processing completed');
      
      this.onComplete(finalResult);
      return finalResult;
      
    } catch (error) {
      this.state = BATCH_STATES.ERROR;
      this.endTime = Date.now();
      
      this.logger.error({ 
        batchId: this.batchId,
        error: error.message,
        stack: error.stack 
      }, 'Batch processing failed');
      
      const errorResult = this.createErrorResult(error);
      this.onError(errorResult);
      throw error;
    } finally {
      // Clean up
      activeBatches.delete(this.batchId);
    }
  }

  /**
   * Validate and deduplicate URLs with proper error handling
   * @param {string[]} urls - Raw URLs to validate
   * @returns {Promise<ValidationResult>} Validation result with categorized URLs
   */
  async validateAndDeduplicate(urls) {
    const validUrls = [];
    const invalidUrls = [];
    const duplicates = [];
    const normalizedMap = new Map();
    
    // Process in chunks to avoid blocking
    const chunkSize = 1000;
    for (let i = 0; i < urls.length; i += chunkSize) {
      if (this.controls.shutdownRequested) {
        throw new Error('Shutdown requested during validation');
      }
      
      const chunk = urls.slice(i, Math.min(i + chunkSize, urls.length));
      
      for (let j = 0; j < chunk.length; j++) {
        const url = chunk[j];
        const index = i + j;
        
        try {
          const validation = this.validateUrl(url);
          
          if (validation.isValid) {
            const normalized = validation.normalized;
            
            // Check for duplicates
            if (normalizedMap.has(normalized)) {
              duplicates.push({
                url,
                normalized,
                index,
                firstOccurrenceIndex: normalizedMap.get(normalized),
                reason: 'duplicate_url'
              });
            } else {
              normalizedMap.set(normalized, index);
              validUrls.push({
                url: normalized,
                originalUrl: url,
                index
              });
            }
          } else {
            invalidUrls.push({
              url,
              index,
              ...validation
            });
          }
        } catch (error) {
          // Validation error should not break the entire process
          invalidUrls.push({
            url,
            index,
            isValid: false,
            category: 'validation_error',
            error: error.message
          });
        }
      }
      
      // Allow event loop to process other tasks
      await this.delay(0);
    }
    
    // Sort to preserve original order
    validUrls.sort((a, b) => a.index - b.index);
    invalidUrls.sort((a, b) => a.index - b.index);
    duplicates.sort((a, b) => a.index - b.index);
    
    return {
      total: urls.length,
      validUrls,
      invalidUrls,
      duplicates,
      summary: {
        totalCount: urls.length,
        validCount: validUrls.length,
        invalidCount: invalidUrls.length,
        duplicateCount: duplicates.length
      }
    };
  }

  /**
   * Validate a single URL with comprehensive checks
   * @param {string} urlString - URL to validate
   * @returns {ValidationResult} Validation result
   */
  validateUrl(urlString) {
    try {
      if (!urlString || typeof urlString !== 'string') {
        return {
          isValid: false,
          category: 'malformed',
          error: 'URL must be a non-empty string'
        };
      }
      
      // Trim whitespace
      const trimmed = urlString.trim();
      if (trimmed.length === 0) {
        return {
          isValid: false,
          category: 'empty',
          error: 'URL is empty after trimming'
        };
      }
      
      // Check URL length
      if (trimmed.length > 2048) {
        return {
          isValid: false,
          category: 'too_long',
          error: 'URL exceeds maximum length of 2048 characters'
        };
      }
      
      const url = new URL(trimmed);
      
      // Protocol validation
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          isValid: false,
          category: 'invalid_protocol',
          error: `Invalid protocol: ${url.protocol}`
        };
      }
      
      // Host validation
      if (!url.hostname || url.hostname.length === 0) {
        return {
          isValid: false,
          category: 'invalid_host',
          error: 'URL must have a valid hostname'
        };
      }
      
      // Check for localhost/private IPs (optional security check)
      if (this.isPrivateHost(url.hostname)) {
        return {
          isValid: false,
          category: 'private_host',
          error: 'Private/localhost URLs are not allowed'
        };
      }
      
      // Normalize URL
      const normalized = this.normalizeUrl(url);
      
      return {
        isValid: true,
        normalized,
        category: 'valid'
      };
      
    } catch (error) {
      return {
        isValid: false,
        category: 'malformed',
        error: error.message
      };
    }
  }

  /**
   * Check if hostname is private/localhost
   */
  isPrivateHost(hostname) {
    const privatePatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^::1$/,
      /^fe80:/i
    ];
    
    return privatePatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * Normalize URL by removing tracking parameters and standardizing format
   * @param {URL} url - URL object to normalize
   * @returns {string} Normalized URL string
   */
  normalizeUrl(url) {
    try {
      // Remove hash
      url.hash = '';
      
      // Remove common tracking parameters
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'gclid', 'fbclid', 'msclkid', 'dclid', 'ref', 'source',
        '_ga', '_gid', '_utm', 'mc_cid', 'mc_eid'
      ];
      
      trackingParams.forEach(param => url.searchParams.delete(param));
      
      // Sort remaining parameters for consistency
      const sortedParams = new URLSearchParams(
        [...url.searchParams].sort()
      );
      url.search = sortedParams.toString();
      
      // Lowercase hostname
      url.hostname = url.hostname.toLowerCase();
      
      // Remove default ports
      if ((url.protocol === 'http:' && url.port === '80') ||
          (url.protocol === 'https:' && url.port === '443')) {
        url.port = '';
      }
      
      return url.href;
    } catch (error) {
      // If normalization fails, return original
      this.logger.warn({ error: error.message }, 'URL normalization failed');
      return url.href;
    }
  }

  /**
   * Process URLs with concurrency control and error handling
   * @param {Array} validUrls - Validated URLs to process
   * @param {Function} processor - Processing function
   * @returns {Promise<Array>} Processing results
   */
  async processUrls(validUrls, processor) {
    const results = new Array(validUrls.length);
    const queue = [...validUrls];
    let completed = 0;
    const activeWorkers = new Set();
    
    const worker = async (workerId) => {
      activeWorkers.add(workerId);
      
      try {
        while (queue.length > 0 && !this.controls.aborted) {
          // Check pause state
          while (this.controls.paused && !this.controls.aborted) {
            await this.delay(200);
          }
          
          if (this.controls.aborted || this.controls.shutdownRequested) {
            break;
          }
          
          // Check memory usage periodically
          if (Date.now() - this.lastMemoryCheck > this.memoryCheckInterval) {
            this.checkMemoryUsage();
            this.lastMemoryCheck = Date.now();
          }
          
          const item = queue.shift();
          if (!item) continue;
          
          const itemLogger = this.logger.child({ 
            url: item.url, 
            index: item.index 
          });
          
          try {
            const startTime = Date.now();
            itemLogger.debug('Processing URL');
            
            // Create timeout wrapper
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error(`Processing timeout after ${this.options.timeout}ms`));
              }, this.options.timeout);
            });
            
            // Process with timeout
            const result = await Promise.race([
              processor(item.url, item),
              timeoutPromise
            ]);
            
            const processingTime = Date.now() - startTime;
            
            results[item.index] = {
              ...item,
              success: true,
              result,
              processingTime,
              timestamp: new Date().toISOString()
            };
            
            itemLogger.info({ processingTime }, 'URL processed successfully');
            
          } catch (error) {
            const errorInfo = this.categorizeError(error);
            
            results[item.index] = {
              ...item,
              success: false,
              error: error.message,
              errorCategory: errorInfo.category,
              errorDetails: errorInfo,
              timestamp: new Date().toISOString()
            };
            
            itemLogger.error({ 
              error: error.message,
              category: errorInfo.category 
            }, 'URL processing failed');
            
            this.recordError(item.url, errorInfo);
          }
          
          completed++;
          this.processedCount = completed;
          
          // Report progress
          this.onProgress({
            phase: 'processing',
            completed,
            total: validUrls.length,
            percentage: Math.round((completed / validUrls.length) * 100),
            currentUrl: item.url,
            workerId
          });
          
          // Delay between requests with jitter
          if (this.options.delayMs > 0) {
            const jitter = Math.random() * 0.2 * this.options.delayMs;
            await this.delay(this.options.delayMs + jitter);
          }
        }
      } finally {
        activeWorkers.delete(workerId);
      }
    };
    
    // Create worker pool
    const workers = Array(this.options.concurrency)
      .fill(null)
      .map((_, index) => worker(`worker-${index}`));
    
    await Promise.all(workers);
    
    return results.filter(Boolean);
  }

  /**
   * Check memory usage and clean up if necessary
   */
  checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    
    if (memUsage.heapUsed > this.maxMemoryUsage) {
      this.logger.warn({ 
        heapUsed: memUsage.heapUsed,
        limit: this.maxMemoryUsage 
      }, 'High memory usage detected, cleaning up');
      
      // Trim error history if it's getting too large
      if (this.errors.length > this.options.errorReportSize) {
        this.errors = this.errors.slice(-this.options.errorReportSize);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Categorize error for intelligent reporting
   * @param {Error} error - Error to categorize
   * @returns {ErrorInfo} Categorized error information
   */
  categorizeError(error) {
    const errorInfo = {
      message: error.message?.substring(0, 500), // Limit message length
      category: ERROR_CATEGORIES.UNKNOWN,
      code: error.code,
      status: error.status,
      timestamp: new Date().toISOString()
    };
    
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || 
        error.code === 'ENETUNREACH' || error.code === 'ECONNRESET' ||
        error.message?.includes('network')) {
      errorInfo.category = ERROR_CATEGORIES.NETWORK;
    }
    // Timeout errors
    else if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT' ||
             error.code === 'ESOCKETTIMEDOUT') {
      errorInfo.category = ERROR_CATEGORIES.TIMEOUT;
    }
    // Rate limiting
    else if (error.status === 429 || error.message?.includes('rate limit')) {
      errorInfo.category = ERROR_CATEGORIES.RATE_LIMIT;
    }
    // Server errors
    else if (error.status >= 500 && error.status < 600) {
      errorInfo.category = ERROR_CATEGORIES.SERVER_ERROR;
    }
    // Client errors
    else if (error.status >= 400 && error.status < 500) {
      errorInfo.category = ERROR_CATEGORIES.CLIENT_ERROR;
    }
    // Parsing errors
    else if (error.message?.includes('parse') || error.message?.includes('JSON') ||
             error.message?.includes('XML')) {
      errorInfo.category = ERROR_CATEGORIES.PARSING;
    }
    // Validation errors
    else if (error.message?.includes('validation') || error.message?.includes('invalid')) {
      errorInfo.category = ERROR_CATEGORIES.VALIDATION;
    }
    
    return errorInfo;
  }

  /**
   * Record error for pattern detection with memory bounds
   * @param {string} url - URL that caused the error
   * @param {ErrorInfo} errorInfo - Error information
   */
  recordError(url, errorInfo) {
    // Add to error list (with size limit)
    if (this.errors.length < this.options.errorReportSize) {
      this.errors.push({
        url: url.substring(0, 500), // Limit URL length
        ...errorInfo
      });
    }
    
    // Track error patterns
    const patternKey = `${errorInfo.category}:${errorInfo.code || 'unknown'}`;
    
    if (!this.errorPatterns.has(patternKey)) {
      this.errorPatterns.set(patternKey, {
        category: errorInfo.category,
        code: errorInfo.code,
        count: 0,
        firstSeen: errorInfo.timestamp,
        lastSeen: errorInfo.timestamp,
        exampleUrls: []
      });
    }
    
    const pattern = this.errorPatterns.get(patternKey);
    pattern.count++;
    pattern.lastSeen = errorInfo.timestamp;
    
    // Keep only a few example URLs
    if (pattern.exampleUrls.length < 5) {
      pattern.exampleUrls.push(url.substring(0, 200));
    }
    
    // Limit total number of patterns tracked
    if (this.errorPatterns.size > 100) {
      // Remove least frequent patterns
      const patterns = Array.from(this.errorPatterns.entries())
        .sort((a, b) => a[1].count - b[1].count);
      
      for (let i = 0; i < 10; i++) {
        this.errorPatterns.delete(patterns[i][0]);
      }
    }
  }

  /**
   * Compile final batch processing result
   * @param {ValidationResult} validationResult - Validation phase result
   * @param {Array} processedResults - Processing phase results
   * @returns {BatchResult} Final batch result
   */
  compileFinalResult(validationResult, processedResults) {
    const successful = processedResults.filter(r => r && r.success);
    const failed = processedResults.filter(r => r && !r.success);
    
    // Calculate statistics
    const processingTime = (this.endTime || Date.now()) - this.startTime;
    const stats = {
      totalUrls: validationResult.total,
      validUrls: validationResult.validUrls.length,
      invalidUrls: validationResult.invalidUrls.length,
      duplicateUrls: validationResult.duplicates.length,
      processedUrls: processedResults.length,
      successfulUrls: successful.length,
      failedUrls: failed.length,
      processingTime,
      averageProcessingTime: successful.length > 0
        ? successful.reduce((sum, r) => sum + (r.processingTime || 0), 0) / successful.length
        : 0,
      throughput: processedResults.length > 0
        ? (processedResults.length / (processingTime / 1000)).toFixed(2)
        : 0
    };
    
    // Generate error report
    const errorReport = this.generateErrorReport(failed);
    
    return {
      batchId: this.batchId,
      state: this.state,
      stats,
      validation: {
        invalid: validationResult.invalidUrls.slice(0, 100), // Limit size
        duplicates: validationResult.duplicates.slice(0, 100)
      },
      results: processedResults,
      errorReport,
      summary: this.generateSummary(stats, errorReport)
    };
  }

  /**
   * Generate intelligent error report
   * @param {Array} failedResults - Failed processing results
   * @returns {ErrorReport} Error report with patterns and recommendations
   */
  generateErrorReport(failedResults) {
    const errorsByCategory = {};
    
    // Group errors by category
    failedResults.forEach(result => {
      const category = result.errorCategory || ERROR_CATEGORIES.UNKNOWN;
      if (!errorsByCategory[category]) {
        errorsByCategory[category] = [];
      }
      
      // Limit stored errors per category
      if (errorsByCategory[category].length < 20) {
        errorsByCategory[category].push({
          url: result.url,
          error: result.error,
          details: result.errorDetails
        });
      }
    });
    
    // Convert error patterns to array
    const patterns = Array.from(this.errorPatterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Limit patterns
    
    // Generate recommendations based on patterns
    const recommendations = this.generateRecommendations(patterns, errorsByCategory);
    
    return {
      totalErrors: failedResults.length,
      errorsByCategory: Object.fromEntries(
        Object.entries(errorsByCategory).map(([cat, errors]) => [
          cat,
          {
            count: failedResults.filter(r => r.errorCategory === cat).length,
            examples: errors.slice(0, 5)
          }
        ])
      ),
      patterns,
      recommendations,
      detailedErrors: this.errors.slice(0, this.options.errorReportSize),
      exportData: this.generateCursorOptimizedExport(failedResults)
    };
  }

  /**
   * Generate recommendations based on error patterns
   * @param {Array} patterns - Error patterns
   * @param {Object} errorsByCategory - Errors grouped by category
   * @returns {Array} Recommendations
   */
  generateRecommendations(patterns, errorsByCategory) {
    const recommendations = [];
    
    // Timeout errors
    const timeoutCount = errorsByCategory[ERROR_CATEGORIES.TIMEOUT]?.length || 0;
    if (timeoutCount > 3) {
      recommendations.push({
        type: 'timeout',
        severity: 'high',
        message: `${timeoutCount} timeout errors detected. Consider increasing timeout or reducing concurrency.`,
        action: 'Increase timeout value or reduce concurrent requests.',
        config: {
          timeout: this.options.timeout * 2,
          concurrency: Math.max(1, Math.floor(this.options.concurrency / 2))
        }
      });
    }
    
    // Network errors
    const networkCount = errorsByCategory[ERROR_CATEGORIES.NETWORK]?.length || 0;
    if (networkCount > 5) {
      recommendations.push({
        type: 'network',
        severity: 'high',
        message: `${networkCount} network errors detected. Check network connectivity or target server availability.`,
        action: 'Verify network connection and target server status. Consider adding retries.',
        config: {
          maxRetries: Math.min(5, this.options.maxRetries + 2)
        }
      });
    }
    
    // Rate limiting
    const rateLimitCount = errorsByCategory[ERROR_CATEGORIES.RATE_LIMIT]?.length || 0;
    if (rateLimitCount > 0) {
      recommendations.push({
        type: 'rate_limit',
        severity: 'medium',
        message: `${rateLimitCount} rate limit errors detected. Reduce request frequency.`,
        action: 'Increase delay between requests or reduce concurrency.',
        config: {
          delayMs: Math.max(1000, this.options.delayMs * 2),
          concurrency: Math.max(1, this.options.concurrency - 1)
        }
      });
    }
    
    // Server errors
    const serverErrorCount = errorsByCategory[ERROR_CATEGORIES.SERVER_ERROR]?.length || 0;
    if (serverErrorCount > 2) {
      recommendations.push({
        type: 'server',
        severity: 'medium',
        message: `Target server returned ${serverErrorCount} server errors. The server may be experiencing issues.`,
        action: 'Try again later or contact the website administrator.'
      });
    }
    
    // High error rate
    const totalErrors = Object.values(errorsByCategory).reduce((sum, errors) => sum + errors.length, 0);
    const errorRate = this.processedCount > 0 ? (totalErrors / this.processedCount) : 0;
    
    if (errorRate > 0.3) {
      recommendations.push({
        type: 'high_error_rate',
        severity: 'critical',
        message: `High error rate detected (${(errorRate * 100).toFixed(1)}%). Review configuration and target availability.`,
        action: 'Check if the target service is available and review all recommendations above.'
      });
    }
    
    return recommendations;
  }

  /**
   * Generate Cursor-optimized error export
   * @param {Array} failedResults - Failed results
   * @returns {Object} Export data optimized for Cursor consumption
   */
  generateCursorOptimizedExport(failedResults) {
    // Create a concise but comprehensive export format
    const exportData = {
      summary: {
        total_errors: failedResults.length,
        error_categories: {},
        timestamp: new Date().toISOString(),
        batch_id: this.batchId
      },
      errors: [],
      patterns: []
    };
    
    // Count by category
    failedResults.forEach(result => {
      const category = result.errorCategory || 'unknown';
      exportData.summary.error_categories[category] = 
        (exportData.summary.error_categories[category] || 0) + 1;
    });
    
    // Include limited error details (optimized for context window)
    exportData.errors = failedResults.slice(0, 20).map(result => ({
      url: result.url.substring(0, 100),
      error: result.error.substring(0, 200),
      category: result.errorCategory,
      timestamp: result.timestamp
    }));
    
    // Add pattern summary
    if (this.errorPatterns.size > 0) {
      exportData.patterns = Array.from(this.errorPatterns.values())
        .slice(0, 10)
        .map(pattern => ({
          pattern: `${pattern.category}:${pattern.code || 'unknown'}`,
          count: pattern.count,
          examples: pattern.exampleUrls.slice(0, 3)
        }));
    }
    
    return exportData;
  }

  /**
   * Generate processing summary
   * @param {Object} stats - Processing statistics
   * @param {ErrorReport} errorReport - Error report
   * @returns {Object} Summary object
   */
  generateSummary(stats, errorReport) {
    const successRate = stats.processedUrls > 0
      ? (stats.successfulUrls / stats.processedUrls * 100).toFixed(1)
      : 0;
    
    return {
      overview: `Processed ${stats.processedUrls} URLs with ${successRate}% success rate`,
      validation: `${stats.invalidUrls} invalid URLs and ${stats.duplicateUrls} duplicates filtered`,
      errors: `${stats.failedUrls} URLs failed processing`,
      performance: `Average processing time: ${Math.round(stats.averageProcessingTime)}ms`,
      throughput: `Throughput: ${stats.throughput} URLs/second`,
      duration: `Total time: ${Math.round(stats.processingTime / 1000)}s`,
      recommendations: errorReport.recommendations.length
    };
  }

  /**
   * Helper: Delay execution with cancellation support
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Delay promise
   */
  delay(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      // Allow timer to be garbage collected if process exits
      if (timer.unref) timer.unref();
    });
  }

  /**
   * Control methods
   */
  pause() {
    if (this.state === BATCH_STATES.PROCESSING) {
      this.controls.paused = true;
      this.state = BATCH_STATES.PAUSED;
      this.logger.info({ batchId: this.batchId }, 'Batch processing paused');
    }
  }

  resume() {
    if (this.state === BATCH_STATES.PAUSED) {
      this.controls.paused = false;
      this.state = BATCH_STATES.PROCESSING;
      this.logger.info({ batchId: this.batchId }, 'Batch processing resumed');
    }
  }

  stop() {
    this.controls.aborted = true;
    this.state = BATCH_STATES.STOPPED;
    this.logger.info({ batchId: this.batchId }, 'Batch processing stopped');
  }

  /**
   * Reset processor state
   */
  reset() {
    this.state = BATCH_STATES.IDLE;
    this.results = [];
    this.errors = [];
    this.errorPatterns.clear();
    this.processedCount = 0;
    this.totalCount = 0;
    this.startTime = null;
    this.endTime = null;
    this.controls = {
      paused: false,
      aborted: false,
      shutdownRequested: false
    };
  }

  /**
   * Create error result for fatal errors
   * @param {Error} error - Fatal error
   * @returns {Object} Error result
   */
  createErrorResult(error) {
    return {
      batchId: this.batchId,
      state: this.state,
      error: error.message,
      errorDetails: this.categorizeError(error),
      stats: {
        totalUrls: this.totalCount,
        processedUrls: this.processedCount,
        processingTime: (this.endTime || Date.now()) - this.startTime
      }
    };
  }
}

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  const logger = createLogger('shutdown');
  logger.info({ signal, activeBatches: activeBatches.size }, 'Graceful shutdown initiated');
  
  // Mark all active batches for shutdown
  for (const [batchId, processor] of activeBatches.entries()) {
    processor.controls.shutdownRequested = true;
    processor.stop();
  }
  
  // Wait for active batches to complete (with timeout)
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30000);
  
  while (activeBatches.size > 0) {
    logger.info({ remaining: activeBatches.size }, 'Waiting for active batches');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  clearTimeout(shutdownTimeout);
  logger.info('All batches completed, exiting gracefully');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = {
  BatchProcessor,
  ERROR_CATEGORIES,
  BATCH_STATES
};