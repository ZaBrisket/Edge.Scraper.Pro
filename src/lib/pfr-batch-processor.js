/**
 * Enhanced PFR Batch Processor
 * Provides safe, clean batch processing with validation, error handling, and reporting
 */

const { PFRUrlValidator, VALIDATION_ERROR_TYPES } = require('./pfr-validation');
const { SportsContentExtractor } = require('./sports-extractor');
const { SportsDataExporter } = require('./sports-export');
const { fetchWithPolicy } = require('./http/client');
const config = require('./config');
const { JSDOM } = require('jsdom');

/**
 * Batch processing configuration (uses environment-driven config)
 */
const BATCH_CONFIG = {
  DEFAULT_CONCURRENCY: config.MAX_CONCURRENCY,
  DEFAULT_DELAY_MS: config.PFR_BATCH_DELAY_MS,
  MAX_RETRIES: config.MAX_RETRIES,
  VALIDATION_TIMEOUT_MS: config.PFR_VALIDATION_TIMEOUT_MS,
  EXTRACTION_TIMEOUT_MS: config.PFR_EXTRACTION_TIMEOUT_MS,
  REPORT_INTERVAL_MS: config.PFR_REPORT_INTERVAL_MS
};

/**
 * Processing states
 */
const PROCESSING_STATES = {
  PENDING: 'pending',
  VALIDATING: 'validating',
  VALIDATED: 'validated',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Enhanced PFR Batch Processor
 */
class PFRBatchProcessor {
  constructor(options = {}) {
    this.validator = new PFRUrlValidator();
    this.extractor = new SportsContentExtractor();
    this.exporter = new SportsDataExporter();
    
    // Configuration
    this.config = {
      concurrency: options.concurrency || BATCH_CONFIG.DEFAULT_CONCURRENCY,
      delayMs: options.delayMs || BATCH_CONFIG.DEFAULT_DELAY_MS,
      maxRetries: options.maxRetries || BATCH_CONFIG.MAX_RETRIES,
      validationTimeout: options.validationTimeout || BATCH_CONFIG.VALIDATION_TIMEOUT_MS,
      extractionTimeout: options.extractionTimeout || BATCH_CONFIG.EXTRACTION_TIMEOUT_MS,
      preserveOrder: options.preserveOrder !== false,
      skipInvalid: options.skipInvalid !== false,
      generateReport: options.generateReport !== false,
      exportFormat: options.exportFormat || 'enhanced-csv'
    };

    // State management
    this.state = PROCESSING_STATES.PENDING;
    this.isProcessing = false;
    this.isCancelled = false;
    this.currentBatch = null;
    this.progress = {
      total: 0,
      processed: 0,
      valid: 0,
      invalid: 0,
      failed: 0,
      skipped: 0
    };

    // Event handlers
    this.eventHandlers = {
      onProgress: null,
      onValidationComplete: null,
      onBatchComplete: null,
      onError: null,
      onCancel: null
    };

    // Results storage
    this.results = [];
    this.validationReport = null;
    this.processingErrors = [];
  }

  /**
   * Set event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  on(event, handler) {
    if (this.eventHandlers.hasOwnProperty(event)) {
      this.eventHandlers[event] = handler;
    }
  }

  /**
   * Process a batch of PFR URLs
   * @param {string[]} urls - Array of PFR URLs to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processBatch(urls, options = {}) {
    if (this.isProcessing) {
      throw new Error('Batch processor is already running');
    }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      throw new Error('Invalid or empty URL list provided');
    }

    this.isProcessing = true;
    this.isCancelled = false;
    this.state = PROCESSING_STATES.PENDING;
    this.currentBatch = {
      urls,
      startTime: Date.now(),
      options: { ...this.config, ...options }
    };

    try {
      // Step 1: Validate URLs
      this.state = PROCESSING_STATES.VALIDATING;
      this.progress.total = urls.length;
      this.progress.processed = 0;
      this.progress.valid = 0;
      this.progress.invalid = 0;
      this.progress.failed = 0;
      this.progress.skipped = 0;

      this.emit('onProgress', this.progress);

      const validationResult = await this.validateUrls(urls);
      this.validationReport = validationResult.report;
      this.state = PROCESSING_STATES.VALIDATED;

      this.emit('onValidationComplete', validationResult);

      // Step 2: Process valid URLs
      if (validationResult.summary.valid > 0) {
        this.state = PROCESSING_STATES.PROCESSING;
        const validUrls = validationResult.results.filter(r => r.isValid);
        
        const processingResult = await this.processValidUrls(validUrls);
        this.results = processingResult.results;
        this.processingErrors = processingResult.errors;
      }

      this.state = PROCESSING_STATES.COMPLETED;
      this.isProcessing = false;

      const finalResult = this.generateFinalReport();
      this.emit('onBatchComplete', finalResult);

      return finalResult;

    } catch (error) {
      this.state = PROCESSING_STATES.FAILED;
      this.isProcessing = false;
      this.emit('onError', error);
      throw error;
    }
  }

  /**
   * Validate URLs with comprehensive reporting
   * @param {string[]} urls - URLs to validate
   * @returns {Promise<Object>} Validation results
   */
  async validateUrls(urls) {
    const startTime = Date.now();
    
    try {
      const validationResult = this.validator.validateBatch(urls, {
        preserveOrder: this.config.preserveOrder,
        generateReport: this.config.generateReport,
        checkDuplicates: true,
        useCache: true,
        strictMode: true
      });

      // Update progress
      this.progress.valid = validationResult.summary.valid;
      this.progress.invalid = validationResult.summary.invalid;
      this.progress.processed = urls.length;

      this.emit('onProgress', this.progress);

      return {
        ...validationResult,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      throw new Error(`URL validation failed: ${error.message}`);
    }
  }

  /**
   * Process valid URLs with controlled concurrency
   * @param {Array} validUrls - Validated URLs to process
   * @returns {Promise<Object>} Processing results
   */
  async processValidUrls(validUrls) {
    const results = [];
    const errors = [];
    const concurrency = this.config.concurrency;
    const delayMs = this.config.delayMs;

    // Process URLs in batches to control concurrency
    for (let i = 0; i < validUrls.length; i += concurrency) {
      if (this.isCancelled) {
        break;
      }

      const batch = validUrls.slice(i, i + concurrency);
      const batchPromises = batch.map((urlResult, index) => 
        this.processSingleUrl(urlResult, i + index)
      );

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            this.progress.valid++;
          } else {
            errors.push({
              url: batch[index].url,
              error: result.reason.message,
              originalIndex: batch[index].originalIndex
            });
            this.progress.failed++;
          }
          
          this.progress.processed++;
        });

        this.emit('onProgress', this.progress);

        // Add delay between batches if configured
        if (delayMs > 0 && i + concurrency < validUrls.length) {
          await this.delay(delayMs);
        }

      } catch (error) {
        // Handle batch-level errors
        batch.forEach((urlResult, index) => {
          errors.push({
            url: urlResult.url,
            error: error.message,
            originalIndex: urlResult.originalIndex
          });
          this.progress.failed++;
          this.progress.processed++;
        });
      }
    }

    return { results, errors };
  }

  /**
   * Process a single URL
   * @param {Object} urlResult - Validated URL result
   * @param {number} index - Processing index
   * @returns {Promise<Object>} Processing result
   */
  async processSingleUrl(urlResult, index) {
    const startTime = Date.now();
    
    try {
      // Fetch the URL
      const response = await fetchWithPolicy(urlResult.url, {
        timeout: this.config.extractionTimeout,
        retries: this.config.maxRetries
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Parse HTML
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Extract content
      const extractionResult = this.extractor.extractSportsContent(document, urlResult.url);

      // Create result object
      const result = {
        index,
        originalIndex: urlResult.originalIndex,
        url: urlResult.url,
        playerSlug: urlResult.playerSlug,
        success: true,
        error: null,
        processingTime: Date.now() - startTime,
        content: extractionResult.content,
        structuredData: extractionResult.structuredData,
        sportsValidation: extractionResult.sportsValidation,
        extractionDebug: {
          method: extractionResult.method,
          score: extractionResult.score,
          debug: extractionResult.debug
        },
        metadata: {
          title: document.title || '',
          contentLength: extractionResult.content.length,
          extractedAt: new Date().toISOString()
        }
      };

      return result;

    } catch (error) {
      return {
        index,
        originalIndex: urlResult.originalIndex,
        url: urlResult.url,
        playerSlug: urlResult.playerSlug,
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime,
        content: '',
        structuredData: {},
        sportsValidation: { isValid: false, score: 0 },
        extractionDebug: null,
        metadata: {
          title: '',
          contentLength: 0,
          extractedAt: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Generate final processing report
   * @returns {Object} Final report
   */
  generateFinalReport() {
    const totalTime = Date.now() - this.currentBatch.startTime;
    const successfulResults = this.results.filter(r => r.success);
    const failedResults = this.results.filter(r => !r.success);

    return {
      summary: {
        totalUrls: this.progress.total,
        validUrls: this.progress.valid,
        invalidUrls: this.progress.invalid,
        processedUrls: this.progress.processed,
        successfulExtractions: successfulResults.length,
        failedExtractions: failedResults.length,
        skippedUrls: this.progress.skipped,
        totalProcessingTime: totalTime,
        averageProcessingTime: this.results.length > 0 
          ? this.results.reduce((sum, r) => sum + r.processingTime, 0) / this.results.length 
          : 0
      },
      validationReport: this.validationReport,
      results: this.config.preserveOrder 
        ? this.results.sort((a, b) => a.originalIndex - b.originalIndex)
        : this.results,
      errors: this.processingErrors,
      configuration: this.config,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Export results in specified format
   * @param {string} format - Export format
   * @returns {string} Exported data
   */
  exportResults(format = null) {
    const exportFormat = format || this.config.exportFormat;
    const successfulResults = this.results.filter(r => r.success);
    
    return this.exporter.exportSportsData(successfulResults, exportFormat);
  }

  /**
   * Cancel current processing
   */
  cancel() {
    if (this.isProcessing) {
      this.isCancelled = true;
      this.state = PROCESSING_STATES.CANCELLED;
      this.emit('onCancel');
    }
  }

  /**
   * Reset processor state
   */
  reset() {
    this.isProcessing = false;
    this.isCancelled = false;
    this.state = PROCESSING_STATES.PENDING;
    this.currentBatch = null;
    this.results = [];
    this.validationReport = null;
    this.processingErrors = [];
    this.progress = {
      total: 0,
      processed: 0,
      valid: 0,
      invalid: 0,
      failed: 0,
      skipped: 0
    };
  }

  /**
   * Get current processing state
   * @returns {Object} Current state
   */
  getState() {
    return {
      state: this.state,
      isProcessing: this.isProcessing,
      isCancelled: this.isCancelled,
      progress: { ...this.progress },
      currentBatch: this.currentBatch ? {
        urlCount: this.currentBatch.urls.length,
        startTime: this.currentBatch.startTime,
        elapsedTime: Date.now() - this.currentBatch.startTime
      } : null
    };
  }

  /**
   * Emit event to handlers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventHandlers[event]) {
      try {
        this.eventHandlers[event](data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }

  /**
   * Utility function for delays
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get available export formats
   * @returns {Array} Available formats
   */
  getAvailableExportFormats() {
    return this.exporter.getAvailableFormats();
  }

  /**
   * Get processor statistics
   * @returns {Object} Processor statistics
   */
  getStats() {
    return {
      validator: this.validator.getCacheStats(),
      config: this.config,
      state: this.getState()
    };
  }
}

module.exports = {
  PFRBatchProcessor,
  PROCESSING_STATES,
  BATCH_CONFIG
};