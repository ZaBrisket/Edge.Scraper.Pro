/**
 * Enhanced Batch Processing Module for Edge.Scraper.Pro (Browser Version)
 * 
 * Browser-compatible version of the batch processor with all features:
 * - Pre-fetch URL validation with invalid URL reporting
 * - Upfront duplicate detection and user notification
 * - Order preservation throughout processing pipeline
 * - Unified timeout configuration
 * - Intelligent error management and reporting
 */

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

class BatchProcessor {
  constructor(options = {}) {
    this.options = {
      concurrency: options.concurrency || 5,
      delayMs: options.delayMs || 250,
      timeout: options.timeout || 10000,
      maxRetries: options.maxRetries || 2,
      errorReportSize: options.errorReportSize || 50,
      // Enhanced options for large batches
      chunkSize: options.chunkSize || 100, // Process URLs in chunks for memory management
      memoryThreshold: options.memoryThreshold || 50 * 1024 * 1024, // 50MB memory threshold
      progressReportInterval: options.progressReportInterval || 10, // Report progress every N URLs
      enableMemoryOptimization: options.enableMemoryOptimization !== false, // Default true
      maxUrlsPerBatch: options.maxUrlsPerBatch || 1500, // Maximum URLs allowed
      // Circuit breaker monitoring
      circuitMonitoringInterval: options.circuitMonitoringInterval || 5000, // Check every 5 seconds
      enableCircuitMonitoring: options.enableCircuitMonitoring !== false,
      autoPauseOnCircuitOpen: options.autoPauseOnCircuitOpen !== false,
      ...options
    };
    
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
      aborted: false,
      autoPausedByCircuit: false
    };
    
    // Circuit breaker monitoring
    this.circuitMonitor = null;
    this.circuitStatus = {};
    this.failedUrlQueue = [];
    
    // Progress callback
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onCircuitStatusChange = options.onCircuitStatusChange || (() => {});
  }

  /**
   * Start circuit breaker monitoring
   */
  startCircuitMonitoring() {
    if (!this.options.enableCircuitMonitoring) return;
    
    this.stopCircuitMonitoring(); // Ensure no duplicate monitors
    
    const checkCircuits = async () => {
      try {
        const response = await fetch('/api/circuit-status');
        if (!response.ok) return;
        
        const status = await response.json();
        this.circuitStatus = status;
        
        // Check for open circuits
        const openCircuits = [];
        Object.entries(status.circuits).forEach(([host, circuit]) => {
          if (circuit.state === 'open' || circuit.state === 'half-open') {
            openCircuits.push({
              host,
              state: circuit.state,
              timeUntilReset: circuit.timeUntilReset,
              resetTime: circuit.resetTime
            });
          }
        });
        
        // Notify about circuit status changes
        this.onCircuitStatusChange({
          circuits: status.circuits,
          openCircuits,
          rateLimits: status.rateLimits,
          metrics: status.metrics
        });
        
        // Auto-pause if circuits are open
        if (this.options.autoPauseOnCircuitOpen && openCircuits.length > 0 && !this.controls.paused && this.state === BATCH_STATES.PROCESSING) {
          console.log('Auto-pausing batch processing due to open circuits:', openCircuits);
          this.controls.autoPausedByCircuit = true;
          this.pause();
          
          // Schedule auto-resume when circuit will reset
          const minResetTime = Math.min(...openCircuits.map(c => c.timeUntilReset));
          if (minResetTime > 0) {
            console.log(`Will auto-resume in ${Math.ceil(minResetTime / 1000)}s when circuit resets`);
            setTimeout(() => {
              if (this.controls.autoPausedByCircuit && this.state === BATCH_STATES.PAUSED) {
                console.log('Auto-resuming batch processing after circuit reset');
                this.controls.autoPausedByCircuit = false;
                this.resume();
              }
            }, minResetTime + 1000); // Add 1 second buffer
          }
        }
        
      } catch (error) {
        console.error('Failed to check circuit status:', error);
      }
    };
    
    // Initial check
    checkCircuits();
    
    // Set up periodic monitoring
    this.circuitMonitor = setInterval(checkCircuits, this.options.circuitMonitoringInterval);
  }
  
  /**
   * Stop circuit breaker monitoring
   */
  stopCircuitMonitoring() {
    if (this.circuitMonitor) {
      clearInterval(this.circuitMonitor);
      this.circuitMonitor = null;
    }
  }

  /**
   * Process a batch of URLs with comprehensive validation and error handling
   * @param {string[]} urls - Array of URLs to process
   * @param {Function} processor - Function to process each URL
   * @returns {Promise<BatchResult>} Batch processing result
   */
  async processBatch(urls, processor) {
    this.reset();
    this.state = BATCH_STATES.VALIDATING;
    this.totalCount = urls.length;
    this.startTime = new Date();
    
    // Start circuit monitoring
    this.startCircuitMonitoring();
    
    try {
      // Check batch size limit
      if (urls.length > this.options.maxUrlsPerBatch) {
        throw new Error(`Batch size ${urls.length} exceeds maximum allowed ${this.options.maxUrlsPerBatch} URLs`);
      }
      
      // Phase 1: Validation and deduplication
      const validationResult = this.validateAndDeduplicate(urls);
      
      if (validationResult.validUrls.length === 0) {
        throw new Error('No valid URLs to process after validation');
      }
      
      // Report validation results
      this.onProgress({
        phase: 'validation',
        total: urls.length,
        valid: validationResult.validUrls.length,
        invalid: validationResult.invalidUrls.length,
        duplicates: validationResult.duplicates.length,
        validationDetails: validationResult
      });
      
      // Phase 2: Process valid URLs with memory optimization
      this.state = BATCH_STATES.PROCESSING;
      const processedResults = this.options.enableMemoryOptimization && validationResult.validUrls.length > this.options.chunkSize
        ? await this.processUrlsInChunks(validationResult.validUrls, processor)
        : await this.processUrls(validationResult.validUrls, processor);
      
      // Phase 3: Compile final results
      this.state = BATCH_STATES.COMPLETED;
      this.endTime = new Date();
      
      // Stop circuit monitoring
      this.stopCircuitMonitoring();
      
      const finalResult = this.compileFinalResult(
        validationResult,
        processedResults
      );
      
      // Include failed URL queue info
      finalResult.failedUrlQueue = this.failedUrlQueue;
      finalResult.hasRetryableUrls = this.failedUrlQueue.length > 0;
      
      this.onComplete(finalResult);
      return finalResult;
      
    } catch (error) {
      this.state = BATCH_STATES.ERROR;
      this.endTime = new Date();
      
      const errorResult = this.createErrorResult(error);
      this.onError(errorResult);
      throw error;
    }
  }

  /**
   * Process URLs in chunks for large batches to optimize memory usage
   * @param {Array} validUrls - Validated URLs to process
   * @param {Function} processor - Processing function
   * @returns {Promise<Array>} Processing results
   */
  async processUrlsInChunks(validUrls, processor) {
    const allResults = [];
    const totalUrls = validUrls.length;
    const chunkSize = this.options.chunkSize;
    let processedCount = 0;
    
    console.log(`Processing ${totalUrls} URLs in chunks of ${chunkSize} for memory optimization`);
    
    // Process URLs in chunks
    for (let i = 0; i < validUrls.length && !this.controls.aborted; i += chunkSize) {
      const chunk = validUrls.slice(i, i + chunkSize);
      const chunkNumber = Math.floor(i / chunkSize) + 1;
      const totalChunks = Math.ceil(validUrls.length / chunkSize);
      
      console.log(`Processing chunk ${chunkNumber}/${totalChunks} (${chunk.length} URLs)`);
      
      // Check memory usage before processing chunk
      if (this.options.enableMemoryOptimization) {
        await this.checkMemoryUsage();
      }
      
      // Process current chunk
      const chunkResults = await this.processUrls(chunk, processor);
      allResults.push(...chunkResults);
      
      processedCount += chunk.length;
      
      // Report chunk completion
      this.onProgress({
        phase: 'processing',
        completed: processedCount,
        total: totalUrls,
        percentage: Math.round((processedCount / totalUrls) * 100),
        currentChunk: chunkNumber,
        totalChunks: totalChunks,
        chunkSize: chunk.length
      });
      
      // Garbage collection hint between chunks for large batches
      if (this.options.enableMemoryOptimization && chunkNumber < totalChunks) {
        await this.performMemoryCleanup();
        
        // Small delay between chunks to allow memory cleanup
        await this.delay(100);
      }
    }
    
    return allResults;
  }

  /**
   * Check memory usage and provide warnings
   */
  async checkMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      const memInfo = performance.memory;
      const usedMemory = memInfo.usedJSHeapSize;
      const memoryLimit = memInfo.jsHeapSizeLimit;
      
      console.log(`Memory usage: ${Math.round(usedMemory / (1024 * 1024))}MB / ${Math.round(memoryLimit / (1024 * 1024))}MB`);
      
      // Warning if memory usage is high
      if (usedMemory > this.options.memoryThreshold) {
        console.warn(`High memory usage detected: ${Math.round(usedMemory / (1024 * 1024))}MB`);
        
        // Force garbage collection if available
        if (window.gc && typeof window.gc === 'function') {
          console.log('Attempting garbage collection...');
          window.gc();
        }
      }
      
      // Error if memory usage is critical
      if (usedMemory > memoryLimit * 0.9) {
        throw new Error(`Critical memory usage: ${Math.round(usedMemory / (1024 * 1024))}MB. Consider reducing batch size.`);
      }
    }
  }

  /**
   * Perform memory cleanup between chunks
   */
  async performMemoryCleanup() {
    // Clear completed results from memory temporarily if batch is very large
    if (this.results.length > this.options.chunkSize * 2) {
      console.log('Performing memory optimization...');
      
      // Keep only recent results in memory, store others temporarily
      const recentResults = this.results.slice(-this.options.chunkSize);
      const archivedCount = this.results.length - recentResults.length;
      
      this.results = recentResults;
      
      console.log(`Archived ${archivedCount} results to optimize memory usage`);
    }
    
    // Force garbage collection if available
    if (window.gc && typeof window.gc === 'function') {
      window.gc();
    }
    
    // Allow event loop to process
    await this.delay(10);
  }

  /**
   * Validate and deduplicate URLs
   * @param {string[]} urls - Raw URLs to validate
   * @returns {ValidationResult} Validation result with categorized URLs
   */
  validateAndDeduplicate(urls) {
    const validUrls = [];
    const invalidUrls = [];
    const duplicates = [];
    const seen = new Map();
    const normalizedMap = new Map();
    
    urls.forEach((url, index) => {
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
   * Validate a single URL
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
      
      const url = new URL(urlString);
      
      // Protocol validation
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          isValid: false,
          category: 'invalid_protocol',
          error: `Invalid protocol: ${url.protocol}`
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
   * Normalize URL by removing tracking parameters
   * @param {URL} url - URL object to normalize
   * @returns {string} Normalized URL string
   */
  normalizeUrl(url) {
    // Remove hash
    url.hash = '';
    
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'msclkid', 'dclid', 'ref', 'source',
      '_ga', '_gid', '_utm'
    ];
    
    trackingParams.forEach(param => url.searchParams.delete(param));
    
    return url.href;
  }

  /**
   * Process URLs with concurrency control and error handling
   * @param {Array} validUrls - Validated URLs to process
   * @param {Function} processor - Processing function
   * @returns {Promise<Array>} Processing results
   */
  async processUrls(validUrls, processor) {
    const results = new Array(validUrls.length);
    let completed = 0;
    
    // For single URL processing (concurrency = 1), use a simpler sequential approach
    if (this.options.concurrency === 1) {
      for (let i = 0; i < validUrls.length && !this.controls.aborted; i++) {
        const item = validUrls[i];
        
        // Check pause state
        while (this.controls.paused && !this.controls.aborted) {
          await this.delay(200);
        }
        
        if (this.controls.aborted) break;
        
        try {
          const startTime = Date.now();
          
          // Process with timeout
          const result = await this.withTimeout(
            processor(item.url, item),
            this.options.timeout
          );
          
          const processingTime = Date.now() - startTime;
          
          results[item.index] = {
            ...item,
            success: true,
            result,
            processingTime,
            timestamp: new Date().toISOString()
          };
          
        } catch (error) {
          const errorInfo = this.categorizeError(error);
          
          // Queue URLs that failed due to circuit breaker for retry
          if (error.message && error.message.includes('Circuit') && error.message.includes('open')) {
            this.failedUrlQueue.push({
              ...item,
              failureReason: 'circuit_open',
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          
          results[item.index] = {
            ...item,
            success: false,
            error: error.message,
            errorCategory: errorInfo.category,
            errorDetails: errorInfo,
            timestamp: new Date().toISOString()
          };
          
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
          currentUrl: item.url
        });
        
        // Delay between requests (except for the last one)
        if (this.options.delayMs > 0 && i < validUrls.length - 1) {
          await this.delay(this.options.delayMs);
        }
      }
      
      return results.filter(Boolean);
    }
    
    // Original concurrent processing for higher concurrency values
    const queue = [...validUrls];
    
    const worker = async () => {
      while (queue.length > 0 && !this.controls.aborted) {
        // Check pause state
        while (this.controls.paused && !this.controls.aborted) {
          await this.delay(200);
        }
        
        if (this.controls.aborted) break;
        
        const item = queue.shift();
        if (!item) continue;
        
        try {
          const startTime = Date.now();
          
          // Process with timeout
          const result = await this.withTimeout(
            processor(item.url, item),
            this.options.timeout
          );
          
          const processingTime = Date.now() - startTime;
          
          results[item.index] = {
            ...item,
            success: true,
            result,
            processingTime,
            timestamp: new Date().toISOString()
          };
          
        } catch (error) {
          const errorInfo = this.categorizeError(error);
          
          // Queue URLs that failed due to circuit breaker for retry
          if (error.message && error.message.includes('Circuit') && error.message.includes('open')) {
            this.failedUrlQueue.push({
              ...item,
              failureReason: 'circuit_open',
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          
          results[item.index] = {
            ...item,
            success: false,
            error: error.message,
            errorCategory: errorInfo.category,
            errorDetails: errorInfo,
            timestamp: new Date().toISOString()
          };
          
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
          currentUrl: item.url
        });
        
        // Delay between requests
        if (this.options.delayMs > 0) {
          await this.delay(this.options.delayMs);
        }
      }
    };
    
    // Create worker pool
    const workers = Array(this.options.concurrency)
      .fill(null)
      .map(() => worker());
    
    await Promise.all(workers);
    
    return results.filter(Boolean);
  }

  /**
   * Categorize error for intelligent reporting
   * @param {Error} error - Error to categorize
   * @returns {ErrorInfo} Categorized error information
   */
  categorizeError(error) {
    const errorInfo = {
      message: error.message,
      category: ERROR_CATEGORIES.UNKNOWN,
      code: error.code,
      status: error.status,
      stack: error.stack,
      timestamp: new Date().toISOString()
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
    // Circuit breaker errors
    else if (error.message.includes('Circuit') && error.message.includes('open')) {
      errorInfo.category = 'circuit_open';
      // Extract remaining time if available
      const timeMatch = error.message.match(/retry in (\d+)s/);
      if (timeMatch) {
        errorInfo.retryInSeconds = parseInt(timeMatch[1], 10);
      }
    }
    
    return errorInfo;
  }

  /**
   * Record error for pattern detection
   * @param {string} url - URL that caused the error
   * @param {ErrorInfo} errorInfo - Error information
   */
  recordError(url, errorInfo) {
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
        exampleUrls: []
      });
    }
    
    const pattern = this.errorPatterns.get(patternKey);
    pattern.count++;
    pattern.lastSeen = errorInfo.timestamp;
    
    if (pattern.exampleUrls.length < 5) {
      pattern.exampleUrls.push(url);
    }
  }

  /**
   * Compile final batch processing result
   * @param {ValidationResult} validationResult - Validation phase result
   * @param {Array} processedResults - Processing phase results
   * @returns {BatchResult} Final batch result
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
    if (errorsByCategory[ERROR_CATEGORIES.TIMEOUT]?.length > 3) {
      recommendations.push({
        type: 'timeout',
        severity: 'high',
        message: 'Multiple timeout errors detected. Consider increasing timeout or reducing concurrency.',
        action: 'Increase timeout setting or reduce concurrent requests.'
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
    
    // Server errors
    const serverErrors = errorsByCategory[ERROR_CATEGORIES.SERVER_ERROR]?.length || 0;
    if (serverErrors > 2) {
      recommendations.push({
        type: 'server',
        severity: 'medium',
        message: `Target server returned ${serverErrors} server errors. The server may be experiencing issues.`,
        action: 'Try again later or contact the website administrator.'
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
    const export_data = {
      summary: {
        total_errors: failedResults.length,
        error_categories: {},
        timestamp: new Date().toISOString()
      },
      errors: []
    };
    
    // Count by category
    failedResults.forEach(result => {
      const category = result.errorCategory || 'unknown';
      export_data.summary.error_categories[category] = 
        (export_data.summary.error_categories[category] || 0) + 1;
    });
    
    // Include limited error details
    export_data.errors = failedResults.slice(0, 20).map(result => ({
      url: result.url,
      error: result.error.substring(0, 200),
      category: result.errorCategory,
      timestamp: result.timestamp
    }));
    
    // Add pattern summary
    if (this.errorPatterns.size > 0) {
      export_data.patterns = Array.from(this.errorPatterns.values())
        .slice(0, 10)
        .map(pattern => ({
          pattern: `${pattern.category}:${pattern.code || 'unknown'}`,
          count: pattern.count,
          examples: pattern.exampleUrls.slice(0, 3)
        }));
    }
    
    return export_data;
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
      duration: `Total time: ${Math.round(stats.processingTime / 1000)}s`,
      recommendations: errorReport.recommendations.length
    };
  }

  /**
   * Generate HTML error report for UI display
   * @param {ErrorReport} errorReport - Error report object
   * @returns {string} HTML formatted error report
   */
  generateHTMLErrorReport(errorReport) {
    const html = [];
    
    html.push('<div class="error-report">');
    html.push('<h3>Error Report</h3>');
    
    // Summary
    html.push('<div class="error-summary">');
    html.push(`<p>Total Errors: <strong>${errorReport.totalErrors}</strong></p>`);
    html.push('</div>');
    
    // Recommendations
    if (errorReport.recommendations.length > 0) {
      html.push('<div class="error-recommendations">');
      html.push('<h4>Recommendations:</h4>');
      errorReport.recommendations.forEach(rec => {
        const severityClass = rec.severity === 'high' ? 'error-high' : 'error-medium';
        html.push(`<div class="recommendation ${severityClass}">`);
        html.push(`<strong>${rec.message}</strong><br>`);
        html.push(`<em>Action: ${rec.action}</em>`);
        html.push('</div>');
      });
      html.push('</div>');
    }
    
    // Error patterns
    if (errorReport.patterns.length > 0) {
      html.push('<div class="error-patterns">');
      html.push('<h4>Error Patterns:</h4>');
      html.push('<table class="error-pattern-table">');
      html.push('<tr><th>Pattern</th><th>Count</th><th>Example URLs</th></tr>');
      errorReport.patterns.slice(0, 10).forEach(pattern => {
        html.push('<tr>');
        html.push(`<td>${pattern.category}:${pattern.code || 'unknown'}</td>`);
        html.push(`<td>${pattern.count}</td>`);
        html.push(`<td>${pattern.exampleUrls.slice(0, 2).join('<br>')}</td>`);
        html.push('</tr>');
      });
      html.push('</table>');
      html.push('</div>');
    }
    
    // Export button
    html.push('<div class="error-export">');
    html.push('<button onclick="exportErrorReport()">Export Error Report (Cursor-optimized)</button>');
    html.push('</div>');
    
    html.push('</div>');
    
    return html.join('\n');
  }

  /**
   * Helper: Execute function with timeout
   * @param {Promise} promise - Promise to execute
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise} Result or timeout error
   */
  async withTimeout(promise, timeoutMs) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Helper: Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Delay promise
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Control methods
   */
  pause() {
    this.controls.paused = true;
    this.state = BATCH_STATES.PAUSED;
  }

  resume() {
    this.controls.paused = false;
    this.state = BATCH_STATES.PROCESSING;
  }

  stop() {
    this.controls.aborted = true;
    this.state = BATCH_STATES.STOPPED;
  }

  /**
   * Get failed URLs that can be retried
   */
  getRetryableUrls() {
    return this.failedUrlQueue.filter(item => item.failureReason === 'circuit_open');
  }
  
  /**
   * Retry failed URLs from queue
   */
  async retryFailedUrls(processor) {
    if (this.failedUrlQueue.length === 0) {
      console.log('No failed URLs to retry');
      return;
    }
    
    const retryUrls = this.failedUrlQueue.map(item => item.url);
    console.log(`Retrying ${retryUrls.length} failed URLs`);
    
    // Clear the failed queue
    this.failedUrlQueue = [];
    
    // Process the retry URLs
    return await this.processBatch(retryUrls, processor);
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
      autoPausedByCircuit: false
    };
    this.failedUrlQueue = [];
    this.stopCircuitMonitoring();
  }

  /**
   * Create error result for fatal errors
   * @param {Error} error - Fatal error
   * @returns {Object} Error result
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
      }
    };
  }
}

// Make available globally in browser
window.BatchProcessor = BatchProcessor;
window.ERROR_CATEGORIES = ERROR_CATEGORIES;
window.BATCH_STATES = BATCH_STATES;