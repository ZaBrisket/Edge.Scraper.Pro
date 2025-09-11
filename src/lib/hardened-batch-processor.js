/**
 * Hardened Batch Processing Module for Edge.Scraper.Pro
 * 
 * This module provides production-ready batch processing with comprehensive:
 * - Input validation and sanitization
 * - Robust error handling with structured errors
 * - Resource management and cleanup
 * - Concurrency control with bounded workers
 * - Graceful shutdown and pause/resume
 * - Comprehensive observability and metrics
 * - Deterministic testing support
 */

const { URL } = require('url');
const { z } = require('zod');
const { EventEmitter } = require('events');
const config = require('./config');

// Input validation schemas
const BATCH_OPTIONS_SCHEMA = z.object({
  concurrency: z.number().int().min(1).max(50).default(5),
  delayMs: z.number().int().min(0).max(10000).default(250),
  timeout: z.number().int().positive().max(300000).default(10000),
  maxRetries: z.number().int().min(0).max(10).default(3),
  errorReportSize: z.number().int().min(1).max(1000).default(50),
  maxBatchSize: z.number().int().min(1).max(10000).default(1000),
  retryDelayMs: z.number().int().min(0).max(60000).default(1000),
  jitterMs: z.number().int().min(0).max(5000).default(100),
  gracefulShutdownTimeoutMs: z.number().int().positive().max(300000).default(30000),
  memoryThresholdMB: z.number().int().positive().max(1000).default(100),
  enableMetrics: z.boolean().default(true),
  enableProgressTracking: z.boolean().default(true)
}).strict();

const URL_VALIDATION_SCHEMA = z.string().url().min(1).max(2048);

// Error categories for detailed reporting
const ERROR_CATEGORIES = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  PARSING: 'parsing',
  VALIDATION: 'validation',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  CLIENT_ERROR: 'client_error',
  MEMORY: 'memory',
  CONCURRENCY: 'concurrency',
  UNKNOWN: 'unknown'
};

// Batch processing states
const BATCH_STATES = {
  IDLE: 'idle',
  VALIDATING: 'validating',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Worker states
const WORKER_STATES = {
  IDLE: 'idle',
  WORKING: 'working',
  ERROR: 'error',
  STOPPED: 'stopped'
};

/**
 * Hardened Batch Processor with comprehensive reliability features
 */
class HardenedBatchProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Validate and set options
    this.options = BATCH_OPTIONS_SCHEMA.parse(options);
    
    // State management
    this.state = BATCH_STATES.IDLE;
    this.results = [];
    this.errors = [];
    this.errorPatterns = new Map();
    this.processedCount = 0;
    this.totalCount = 0;
    this.startTime = null;
    this.endTime = null;
    
    // Control flags
    this.controls = {
      paused: false,
      stopping: false,
      aborted: false
    };
    
    // Worker management
    this.workers = [];
    this.activeWorkers = 0;
    this.workerQueue = [];
    this.workerStates = new Map();
    
    // Resource management
    this.resourceCleanup = new Set();
    this.memoryCheckInterval = null;
    this.lastMemoryCheck = 0;
    
    // Metrics
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0, retried: 0 },
      timing: { totalMs: 0, averageMs: 0, minMs: Infinity, maxMs: 0 },
      memory: { peakMB: 0, currentMB: 0, checks: 0 },
      workers: { created: 0, active: 0, errors: 0, completed: 0 },
      errors: { byCategory: {}, byWorker: {}, total: 0 },
      performance: { throughput: 0, efficiency: 0 }
    };
    
    // Progress tracking
    this.progress = {
      phase: 'idle',
      percentage: 0,
      currentItem: null,
      estimatedTimeRemaining: 0,
      lastUpdate: Date.now()
    };
    
    // Event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for cleanup and error handling
   */
  setupEventHandlers() {
    // Only set up process listeners if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      // Graceful shutdown on process signals
      process.on('SIGINT', () => this.gracefulShutdown());
      process.on('SIGTERM', () => this.gracefulShutdown());
    }
    
    // Memory monitoring
    if (this.options.enableMetrics) {
      this.startMemoryMonitoring();
    }
  }

  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 5000);
  }

  /**
   * Check memory usage and emit warnings if needed
   */
  checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const currentMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    this.metrics.memory.currentMB = currentMB;
    this.metrics.memory.checks++;
    this.lastMemoryCheck = Date.now();
    
    if (currentMB > this.metrics.memory.peakMB) {
      this.metrics.memory.peakMB = currentMB;
    }
    
    if (currentMB > this.options.memoryThresholdMB) {
      this.emit('memoryWarning', {
        currentMB,
        thresholdMB: this.options.memoryThresholdMB,
        peakMB: this.metrics.memory.peakMB
      });
    }
  }

  /**
   * Process a batch of URLs with comprehensive validation and error handling
   */
  async processBatch(urls, processor) {
    if (this.state !== BATCH_STATES.IDLE) {
      throw new Error(`Cannot start processing in state: ${this.state}`);
    }

    this.reset();
    this.state = BATCH_STATES.VALIDATING;
    this.totalCount = urls.length;
    this.startTime = new Date();
    
    try {
      // Phase 1: Input validation
      this.validateInput(urls, processor);
      
      // Phase 2: URL validation and deduplication
      const validationResult = this.validateAndDeduplicateUrls(urls);
      
      if (validationResult.validUrls.length === 0) {
        throw new Error('No valid URLs to process after validation');
      }
      
      // Emit validation progress
      this.emitProgress({
        phase: 'validation',
        total: urls.length,
        valid: validationResult.validUrls.length,
        invalid: validationResult.invalidUrls.length,
        duplicates: validationResult.duplicates.length
      });
      
      // Phase 3: Process valid URLs with workers
      this.state = BATCH_STATES.PROCESSING;
      const processedResults = await this.processUrlsWithWorkers(
        validationResult.validUrls,
        processor
      );
      
      // Phase 4: Compile final results
      this.state = BATCH_STATES.COMPLETED;
      this.endTime = new Date();
      
      const finalResult = this.compileFinalResult(
        validationResult,
        processedResults
      );
      
      this.emit('complete', finalResult);
      return finalResult;
      
    } catch (error) {
      this.state = BATCH_STATES.ERROR;
      this.endTime = new Date();
      
      const errorResult = this.createErrorResult(error);
      this.emit('error', errorResult);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Validate input parameters
   */
  validateInput(urls, processor) {
    if (!Array.isArray(urls)) {
      throw new Error('URLs must be an array');
    }
    
    if (urls.length === 0) {
      throw new Error('URLs array cannot be empty');
    }
    
    if (urls.length > this.options.maxBatchSize) {
      throw new Error(`Batch size ${urls.length} exceeds maximum ${this.options.maxBatchSize}`);
    }
    
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }
    
    // Validate each URL
    urls.forEach((url, index) => {
      if (typeof url !== 'string') {
        throw new Error(`URL at index ${index} must be a string, got ${typeof url}`);
      }
    });
  }

  /**
   * Validate and deduplicate URLs with comprehensive error handling
   */
  validateAndDeduplicateUrls(urls) {
    const validUrls = [];
    const invalidUrls = [];
    const duplicates = [];
    const seen = new Map();
    const normalizedMap = new Map();
    
    urls.forEach((url, index) => {
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
        invalidUrls.push({
          url,
          index,
          isValid: false,
          category: 'validation_error',
          error: error.message
        });
      }
    });
    
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
      
      // Basic length check
      if (urlString.length > 2048) {
        return {
          isValid: false,
          category: 'malformed',
          error: 'URL exceeds maximum length of 2048 characters'
        };
      }
      
      // Validate with schema
      const validatedUrl = URL_VALIDATION_SCHEMA.parse(urlString);
      const url = new URL(validatedUrl);
      
      // Protocol validation
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          isValid: false,
          category: 'invalid_protocol',
          error: `Invalid protocol: ${url.protocol}. Only HTTP and HTTPS are supported`
        };
      }
      
      // Hostname validation
      if (!url.hostname || url.hostname.length === 0) {
        return {
          isValid: false,
          category: 'malformed',
          error: 'URL must have a valid hostname'
        };
      }
      
      // Check for suspicious patterns
      if (url.hostname.includes('..') || url.hostname.includes('//')) {
        return {
          isValid: false,
          category: 'malformed',
          error: 'Invalid hostname pattern detected'
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
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          category: 'malformed',
          error: `URL validation failed: ${error.errors.map(e => e.message).join(', ')}`
        };
      }
      return {
        isValid: false,
        category: 'malformed',
        error: error.message
      };
    }
  }

  /**
   * Normalize URL by removing tracking parameters
   */
  normalizeUrl(url) {
    // Remove hash
    url.hash = '';
    
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'msclkid', 'dclid', 'ref', 'source',
      '_ga', '_gid', '_utm', 'fbclid', 'gclid'
    ];
    
    trackingParams.forEach(param => url.searchParams.delete(param));
    
    return url.href;
  }

  /**
   * Process URLs using worker pool with comprehensive error handling
   */
  async processUrlsWithWorkers(validUrls, processor) {
    const results = new Array(validUrls.length);
    const queue = [...validUrls];
    let completed = 0;
    
    // Create worker pool
    const workers = this.createWorkerPool(processor);
    
    try {
      // Process queue with workers
      const workerPromises = workers.map(worker => this.runWorker(worker, queue, results, validUrls.length));
      
      // Wait for all workers to complete
      await Promise.all(workerPromises);
      
      // Update final metrics
      this.updateMetrics();
      
      return results.filter(Boolean);
      
    } finally {
      // Cleanup workers
      await this.cleanupWorkers(workers);
    }
  }

  /**
   * Create worker pool
   */
  createWorkerPool(processor) {
    const workers = [];
    
    for (let i = 0; i < this.options.concurrency; i++) {
      const worker = {
        id: i,
        state: WORKER_STATES.IDLE,
        processor,
        processed: 0,
        errors: 0,
        startTime: Date.now()
      };
      
      workers.push(worker);
      this.workers.push(worker);
      this.workerStates.set(worker.id, WORKER_STATES.IDLE);
      this.metrics.workers.created++;
    }
    
    return workers;
  }

  /**
   * Run a single worker
   */
  async runWorker(worker, queue, results, totalCount) {
    let completed = 0;
    
    while (queue.length > 0 && !this.controls.aborted && !this.controls.stopping) {
      // Check pause state
      while (this.controls.paused && !this.controls.aborted && !this.controls.stopping) {
        await this.delay(100);
      }
      
      if (this.controls.aborted || this.controls.stopping) break;
      
      const item = queue.shift();
      if (!item) continue;
      
      this.workerStates.set(worker.id, WORKER_STATES.WORKING);
      this.activeWorkers++;
      
      try {
        const startTime = Date.now();
        
        // Process with timeout and retries
        const result = await this.processWithRetries(
          item,
          worker.processor,
          worker.id
        );
        
        const processingTime = Date.now() - startTime;
        
        results[item.index] = {
          ...item,
          success: true,
          result,
          processingTime,
          workerId: worker.id,
          timestamp: new Date().toISOString()
        };
        
        worker.processed++;
        this.processedCount++;
        this.metrics.requests.successful++;
        
        // Update timing metrics
        this.updateTimingMetrics(processingTime);
        
      } catch (error) {
        const errorInfo = this.categorizeError(error, worker.id);
        
        results[item.index] = {
          ...item,
          success: false,
          error: error.message,
          errorCategory: errorInfo.category,
          errorDetails: errorInfo,
          workerId: worker.id,
          timestamp: new Date().toISOString()
        };
        
        worker.errors++;
        this.metrics.requests.failed++;
        this.recordError(item.url, errorInfo, worker.id);
      }
      
      this.activeWorkers--;
      this.workerStates.set(worker.id, WORKER_STATES.IDLE);
      
      // Update progress
      completed++;
      this.updateProgress(completed, totalCount, item);
      
      // Delay between requests
      if (this.options.delayMs > 0) {
        await this.delay(this.options.delayMs);
      }
    }
    
    this.workerStates.set(worker.id, WORKER_STATES.STOPPED);
  }

  /**
   * Process item with retries and timeout
   */
  async processWithRetries(item, processor, workerId) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
        
        try {
          const result = await processor(item.url, item, {
            signal: controller.signal,
            attempt,
            workerId,
            maxRetries: this.options.maxRetries
          });
          
          clearTimeout(timeoutId);
          return result;
          
        } catch (error) {
          clearTimeout(timeoutId);
          
          if (error.name === 'AbortError') {
            throw new Error(`Request timed out after ${this.options.timeout}ms`);
          }
          
          throw error;
        }
        
      } catch (error) {
        lastError = error;
        
        if (attempt < this.options.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          this.metrics.requests.retried++;
          
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Calculate retry delay with jitter
   */
  calculateRetryDelay(attempt) {
    const baseDelay = this.options.retryDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.options.jitterMs;
    return Math.min(baseDelay + jitter, 60000); // Cap at 60 seconds
  }

  /**
   * Categorize error for intelligent reporting
   */
  categorizeError(error, workerId = null) {
    const errorInfo = {
      message: error.message,
      category: ERROR_CATEGORIES.UNKNOWN,
      code: error.code,
      status: error.status,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      workerId
    };
    
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || 
        error.code === 'ENETUNREACH' || error.message.includes('network')) {
      errorInfo.category = ERROR_CATEGORIES.NETWORK;
    }
    // Timeout errors
    else if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
      errorInfo.category = ERROR_CATEGORIES.TIMEOUT;
    }
    // Rate limiting
    else if (error.status === 429 || error.message.includes('rate limit')) {
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
    else if (error.message.includes('parse') || error.message.includes('JSON')) {
      errorInfo.category = ERROR_CATEGORIES.PARSING;
    }
    // Memory errors
    else if (error.message.includes('memory') || error.message.includes('heap')) {
      errorInfo.category = ERROR_CATEGORIES.MEMORY;
    }
    
    return errorInfo;
  }

  /**
   * Record error for pattern detection
   */
  recordError(url, errorInfo, workerId = null) {
    // Add to error list (with size limit)
    if (this.errors.length < this.options.errorReportSize) {
      this.errors.push({
        url,
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
        exampleUrls: [],
        workers: new Set()
      });
    }
    
    const pattern = this.errorPatterns.get(patternKey);
    pattern.count++;
    pattern.lastSeen = errorInfo.timestamp;
    if (workerId) pattern.workers.add(workerId);
    
    if (pattern.exampleUrls.length < 5) {
      pattern.exampleUrls.push(url);
    }
    
    // Update metrics
    this.metrics.errors.total++;
    this.metrics.errors.byCategory[errorInfo.category] = 
      (this.metrics.errors.byCategory[errorInfo.category] || 0) + 1;
    
    if (workerId) {
      this.metrics.errors.byWorker[workerId] = 
        (this.metrics.errors.byWorker[workerId] || 0) + 1;
    }
  }

  /**
   * Update timing metrics
   */
  updateTimingMetrics(processingTime) {
    this.metrics.timing.totalMs += processingTime;
    this.metrics.timing.minMs = Math.min(this.metrics.timing.minMs, processingTime);
    this.metrics.timing.maxMs = Math.max(this.metrics.timing.maxMs, processingTime);
    
    if (this.processedCount > 0) {
      this.metrics.timing.averageMs = this.metrics.timing.totalMs / this.processedCount;
    }
  }

  /**
   * Update progress tracking
   */
  updateProgress(completed, total, currentItem) {
    const percentage = Math.round((completed / total) * 100);
    const now = Date.now();
    
    this.progress = {
      phase: this.state,
      percentage,
      currentItem: currentItem?.url || null,
      estimatedTimeRemaining: this.calculateEstimatedTimeRemaining(completed, total),
      lastUpdate: now
    };
    
    if (this.options.enableProgressTracking) {
      this.emit('progress', this.progress);
    }
  }

  /**
   * Calculate estimated time remaining
   */
  calculateEstimatedTimeRemaining(completed, total) {
    if (completed === 0) return 0;
    
    const elapsed = Date.now() - this.startTime.getTime();
    const rate = completed / elapsed;
    const remaining = total - completed;
    
    return Math.round(remaining / rate);
  }

  /**
   * Emit progress event
   */
  emitProgress(data) {
    this.emit('progress', {
      ...this.progress,
      ...data
    });
  }

  /**
   * Compile final batch processing result
   */
  compileFinalResult(validationResult, processedResults) {
    const successful = processedResults.filter(r => r.success);
    const failed = processedResults.filter(r => !r.success);
    
    // Calculate statistics
    const stats = {
      totalUrls: validationResult.total,
      validUrls: validationResult.validUrls.length,
      invalidUrls: validationResult.invalidUrls.length,
      duplicateUrls: validationResult.duplicates.length,
      processedUrls: processedResults.length,
      successfulUrls: successful.length,
      failedUrls: failed.length,
      processingTime: this.endTime - this.startTime,
      averageProcessingTime: successful.length > 0
        ? successful.reduce((sum, r) => sum + (r.processingTime || 0), 0) / successful.length
        : 0
    };
    
    // Generate error report
    const errorReport = this.generateErrorReport(failed);
    
    return {
      state: this.state,
      stats,
      validation: {
        invalid: validationResult.invalidUrls,
        duplicates: validationResult.duplicates
      },
      results: processedResults,
      errorReport,
      metrics: this.metrics,
      summary: this.generateSummary(stats, errorReport)
    };
  }

  /**
   * Generate intelligent error report
   */
  generateErrorReport(failedResults) {
    const errorsByCategory = {};
    
    // Group errors by category
    failedResults.forEach(result => {
      const category = result.errorCategory || ERROR_CATEGORIES.UNKNOWN;
      if (!errorsByCategory[category]) {
        errorsByCategory[category] = [];
      }
      errorsByCategory[category].push({
        url: result.url,
        error: result.error,
        details: result.errorDetails
      });
    });
    
    // Convert error patterns to array
    const patterns = Array.from(this.errorPatterns.values())
      .sort((a, b) => b.count - a.count);
    
    // Generate recommendations based on patterns
    const recommendations = this.generateRecommendations(patterns, errorsByCategory);
    
    return {
      totalErrors: failedResults.length,
      errorsByCategory,
      patterns,
      recommendations,
      detailedErrors: this.errors,
      metrics: this.metrics
    };
  }

  /**
   * Generate recommendations based on error patterns
   */
  generateRecommendations(patterns, errorsByCategory) {
    const recommendations = [];
    
    // Timeout errors
    if (errorsByCategory[ERROR_CATEGORIES.TIMEOUT]?.length > 3) {
      recommendations.push({
        type: 'timeout',
        severity: 'high',
        message: 'Multiple timeout errors detected. Consider increasing timeout or reducing concurrency.',
        action: 'Increase timeout or reduce concurrent requests.'
      });
    }
    
    // Network errors
    if (errorsByCategory[ERROR_CATEGORIES.NETWORK]?.length > 5) {
      recommendations.push({
        type: 'network',
        severity: 'high',
        message: 'Multiple network errors detected. Check network connectivity or target server availability.',
        action: 'Verify network connection and target server status.'
      });
    }
    
    // Rate limiting
    if (errorsByCategory[ERROR_CATEGORIES.RATE_LIMIT]?.length > 0) {
      recommendations.push({
        type: 'rate_limit',
        severity: 'medium',
        message: 'Rate limiting detected. Reduce request frequency.',
        action: 'Increase delay between requests or reduce concurrency.'
      });
    }
    
    // Memory errors
    if (errorsByCategory[ERROR_CATEGORIES.MEMORY]?.length > 0) {
      recommendations.push({
        type: 'memory',
        severity: 'high',
        message: 'Memory errors detected. Consider reducing batch size or increasing memory limits.',
        action: 'Reduce batch size or increase available memory.'
      });
    }
    
    return recommendations;
  }

  /**
   * Generate processing summary
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
      duration: `Total time: ${Math.round(stats.processingTime / 1000)}s`,
      recommendations: errorReport.recommendations.length
    };
  }

  /**
   * Create error result for fatal errors
   */
  createErrorResult(error) {
    return {
      state: this.state,
      error: error.message,
      errorDetails: this.categorizeError(error),
      stats: {
        totalUrls: this.totalCount,
        processedUrls: this.processedCount,
        processingTime: this.endTime - this.startTime
      },
      metrics: this.metrics
    };
  }

  /**
   * Update comprehensive metrics
   */
  updateMetrics() {
    this.metrics.requests.total = this.processedCount;
    this.metrics.workers.active = this.activeWorkers;
    this.metrics.workers.completed = this.workers.filter(w => w.state === WORKER_STATES.STOPPED).length;
    
    // Calculate throughput (requests per second)
    if (this.startTime && this.endTime) {
      const durationSeconds = (this.endTime - this.startTime) / 1000;
      this.metrics.performance.throughput = this.processedCount / durationSeconds;
    }
    
    // Calculate efficiency (success rate)
    if (this.processedCount > 0) {
      this.metrics.performance.efficiency = (this.metrics.requests.successful / this.processedCount) * 100;
    }
  }

  /**
   * Cleanup workers
   */
  async cleanupWorkers(workers) {
    const cleanupPromises = workers.map(async (worker) => {
      try {
        worker.state = WORKER_STATES.STOPPED;
        this.workerStates.set(worker.id, WORKER_STATES.STOPPED);
      } catch (error) {
        this.emit('workerError', { workerId: worker.id, error: error.message });
      }
    });
    
    await Promise.all(cleanupPromises);
  }

  /**
   * Control methods
   */
  pause() {
    this.controls.paused = true;
    this.state = BATCH_STATES.PAUSED;
    this.emit('paused');
  }

  resume() {
    this.controls.paused = false;
    this.state = BATCH_STATES.PROCESSING;
    this.emit('resumed');
  }

  async stop() {
    this.controls.stopping = true;
    this.state = BATCH_STATES.STOPPING;
    this.emit('stopping');
    
    // Wait for active workers to finish current tasks
    await this.waitForWorkersToFinish();
    
    this.controls.aborted = true;
    this.state = BATCH_STATES.STOPPED;
    this.emit('stopped');
  }

  /**
   * Wait for workers to finish current tasks
   */
  async waitForWorkersToFinish() {
    const maxWaitTime = this.options.gracefulShutdownTimeoutMs;
    const startTime = Date.now();
    
    while (this.activeWorkers > 0 && (Date.now() - startTime) < maxWaitTime) {
      await this.delay(100);
    }
    
    if (this.activeWorkers > 0) {
      this.emit('warning', {
        message: 'Some workers did not finish within timeout',
        activeWorkers: this.activeWorkers
      });
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown() {
    if (this.state === BATCH_STATES.PROCESSING) {
      await this.stop();
    }
    this.cleanup();
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Clear memory monitoring
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    
    // Cleanup workers
    this.workers.forEach(worker => {
      worker.state = WORKER_STATES.STOPPED;
    });
    
    // Clear resource cleanup callbacks
    this.resourceCleanup.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        this.emit('cleanupError', error);
      }
    });
    this.resourceCleanup.clear();
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
      stopping: false,
      aborted: false
    };
    this.workers = [];
    this.activeWorkers = 0;
    this.workerQueue = [];
    this.workerStates.clear();
    
    // Reset metrics
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0, retried: 0 },
      timing: { totalMs: 0, averageMs: 0, minMs: Infinity, maxMs: 0 },
      memory: { peakMB: 0, currentMB: 0, checks: 0 },
      workers: { created: 0, active: 0, errors: 0, completed: 0 },
      errors: { byCategory: {}, byWorker: {}, total: 0 },
      performance: { throughput: 0, efficiency: 0 }
    };
  }

  /**
   * Helper: Delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      state: this.state,
      progress: this.progress,
      workers: this.workers.map(w => ({
        id: w.id,
        state: w.state,
        processed: w.processed,
        errors: w.errors
      }))
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const memoryUsage = process.memoryUsage();
    const currentMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    
    return {
      status: this.state === BATCH_STATES.COMPLETED ? 'healthy' : 'processing',
      state: this.state,
      activeWorkers: this.activeWorkers,
      memory: {
        currentMB,
        peakMB: this.metrics.memory.peakMB,
        thresholdMB: this.options.memoryThresholdMB
      },
      progress: this.progress,
      metrics: this.metrics
    };
  }
}

module.exports = {
  HardenedBatchProcessor,
  ERROR_CATEGORIES,
  BATCH_STATES,
  WORKER_STATES
};