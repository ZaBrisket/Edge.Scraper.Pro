/**
 * Structured NDJSON Logger for EdgeScraperPro
 *
 * Provides structured logging with:
 * - NDJSON format for easy parsing
 * - URL resolution tracking
 * - Redirect chain logging
 * - Error taxonomy integration
 * - Performance metrics
 * - Job-specific log files
 */

const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const createLogger = require('./logging');

class StructuredLogger {
  constructor(options = {}) {
    this.options = {
      logDirectory: options.logDirectory || './logs',
      jobId: options.jobId || randomUUID(),
      enableFileLogging: options.enableFileLogging !== false,
      enableConsoleLogging: options.enableConsoleLogging !== false,
      maxLogFileSize: options.maxLogFileSize || 100 * 1024 * 1024, // 100MB
      rotateOnSize: options.rotateOnSize !== false,
      ...options,
    };

    this.logger = createLogger('structured-logger');
    this.logFilePath = path.join(this.options.logDirectory, `${this.options.jobId}.log`);
    this.summaryFilePath = path.join(
      this.options.logDirectory,
      `${this.options.jobId}-summary.json`
    );

    // Initialize counters for summary
    this.counters = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      canonicalized_requests: 0,
      robots_blocked: 0,
      pagination_discovered: 0,
      error_categories: {},
      response_times: [],
      start_time: Date.now(),
      end_time: null,
    };

    // Ensure log directory exists
    this.initializeLogDirectory();
  }

  /**
   * Initialize log directory
   */
  async initializeLogDirectory() {
    try {
      await fs.mkdir(this.options.logDirectory, { recursive: true });
      this.logger.debug({ logDirectory: this.options.logDirectory }, 'Log directory initialized');
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to create log directory');
    }
  }

  /**
   * Log a structured request event
   * @param {object} event - Event data
   */
  async logRequest(event) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      job_id: this.options.jobId,
      event_type: 'request',
      ...event,
    };

    // Update counters
    this.counters.total_requests++;

    if (event.success) {
      this.counters.successful_requests++;
    } else {
      this.counters.failed_requests++;

      // Track error categories
      if (event.error_class) {
        this.counters.error_categories[event.error_class] =
          (this.counters.error_categories[event.error_class] || 0) + 1;
      }
    }

    if (event.canonicalized) {
      this.counters.canonicalized_requests++;
    }

    if (event.robots_blocked) {
      this.counters.robots_blocked++;
    }

    if (event.pagination_discovered) {
      this.counters.pagination_discovered++;
    }

    if (event.response_time_ms) {
      this.counters.response_times.push(event.response_time_ms);
    }

    // Write to file and console
    await this.writeLogEntry(logEntry);
  }

  /**
   * Log a structured pagination discovery event
   * @param {object} event - Pagination event data
   */
  async logPaginationDiscovery(event) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      job_id: this.options.jobId,
      event_type: 'pagination_discovery',
      ...event,
    };

    await this.writeLogEntry(logEntry);
  }

  /**
   * Log a structured canonicalization event
   * @param {object} event - Canonicalization event data
   */
  async logCanonicalization(event) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      job_id: this.options.jobId,
      event_type: 'canonicalization',
      ...event,
    };

    await this.writeLogEntry(logEntry);
  }

  /**
   * Log a batch summary event
   * @param {object} summary - Batch summary data
   */
  async logBatchSummary(summary) {
    this.counters.end_time = Date.now();

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      job_id: this.options.jobId,
      event_type: 'batch_summary',
      duration_ms: this.counters.end_time - this.counters.start_time,
      ...this.counters,
      ...summary,
    };

    await this.writeLogEntry(logEntry);
    await this.writeSummaryFile(logEntry);
  }

  /**
   * Create a structured log entry from a fetch result
   * @param {object} fetchResult - Result from enhanced fetch
   * @returns {object} Structured log entry
   */
  createRequestLogEntry(fetchResult) {
    const entry = {
      original_url: fetchResult.originalUrl,
      resolved_url: fetchResult.resolvedUrl,
      success: fetchResult.response ? fetchResult.response.ok : false,
      response_time_ms: fetchResult.responseTime,
      robots_allowed: fetchResult.robotsAllowed,
      canonicalized: !!fetchResult.canonicalizationResult?.success,
      pagination_discovered: false, // Will be updated if pagination is found
      redirect_chain: [],
    };

    // Add response details if available
    if (fetchResult.response) {
      entry.status_code = fetchResult.response.status;
      entry.status_text = fetchResult.response.statusText;
      entry.content_type = fetchResult.response.headers.get('content-type');
      entry.content_length = fetchResult.response.headers.get('content-length');
      entry.server = fetchResult.response.headers.get('server');
      entry.cache_control = fetchResult.response.headers.get('cache-control');
    }

    // Add canonicalization details
    if (fetchResult.canonicalizationResult) {
      entry.canonicalization = {
        success: fetchResult.canonicalizationResult.success,
        attempts: fetchResult.canonicalizationResult.attempts?.length || 0,
        total_response_time_ms: fetchResult.canonicalizationResult.totalResponseTime,
        redirect_chain: fetchResult.canonicalizationResult.redirectChain || [],
      };

      // Merge redirect chains
      entry.redirect_chain = fetchResult.canonicalizationResult.redirectChain || [];
    }

    // Add error details if failed
    if (!entry.success) {
      if (fetchResult.error) {
        entry.error = fetchResult.error;
        entry.error_code = fetchResult.errorCode;
        entry.error_class = this.categorizeErrorForLogging(fetchResult);
      } else if (fetchResult.response) {
        entry.error_class = `http_${fetchResult.response.status}`;
        entry.error = `HTTP ${fetchResult.response.status}: ${fetchResult.response.statusText}`;
      }
    }

    return entry;
  }

  /**
   * Categorize error for logging purposes
   * @param {object} fetchResult - Fetch result with error
   * @returns {string} Error category
   */
  categorizeErrorForLogging(fetchResult) {
    const error = fetchResult.error;
    const errorCode = fetchResult.errorCode;
    const status = fetchResult.status;

    // DNS errors
    if (errorCode === 'ENOTFOUND' || errorCode === 'EAI_NODATA' || errorCode === 'EAI_NONAME') {
      return 'dns_error';
    }

    // Network errors
    if (errorCode === 'ECONNREFUSED' || errorCode === 'ECONNRESET' || errorCode === 'ENETUNREACH') {
      return 'network_error';
    }

    // Timeout errors
    if (errorCode === 'ETIMEDOUT' || error?.includes('timeout')) {
      return 'timeout_error';
    }

    // SSL errors
    if (errorCode?.includes('CERT_') || error?.includes('certificate') || error?.includes('SSL')) {
      return 'ssl_error';
    }

    // Robots blocking
    if (errorCode === 'BLOCKED_BY_ROBOTS') {
      return 'blocked_by_robots';
    }

    // Specific HTTP status codes
    if (status === 404) return 'http_404';
    if (status === 403) return 'http_403';
    if (status === 401) return 'http_401';
    if (status === 429) return 'rate_limit';
    if (status === 503 && error?.includes('cloudflare')) return 'anti_bot_challenge';

    // General categories
    if (status >= 500) return 'server_error';
    if (status >= 400) return 'client_error';

    return 'unknown';
  }

  /**
   * Write log entry to file and console
   * @param {object} logEntry - Log entry to write
   */
  async writeLogEntry(logEntry) {
    const logLine = JSON.stringify(logEntry) + '\n';

    // Console logging
    if (this.options.enableConsoleLogging) {
      if (logEntry.event_type === 'request' && logEntry.success) {
        this.logger.info(
          {
            url: logEntry.resolved_url,
            status: logEntry.status_code,
            time: logEntry.response_time_ms,
            canonicalized: logEntry.canonicalized,
          },
          'Request successful'
        );
      } else if (logEntry.event_type === 'request' && !logEntry.success) {
        this.logger.error(
          {
            url: logEntry.original_url,
            error: logEntry.error,
            error_class: logEntry.error_class,
            time: logEntry.response_time_ms,
          },
          'Request failed'
        );
      }
    }

    // File logging
    if (this.options.enableFileLogging) {
      try {
        // Check file size and rotate if necessary
        if (this.options.rotateOnSize) {
          await this.checkAndRotateLog();
        }

        await fs.appendFile(this.logFilePath, logLine);
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to write log entry to file');
      }
    }
  }

  /**
   * Write summary file
   * @param {object} summary - Summary data
   */
  async writeSummaryFile(summary) {
    try {
      // Calculate statistics
      const responseTimesMs = this.counters.response_times;
      const stats = {
        ...summary,
        response_time_stats:
          responseTimesMs.length > 0
            ? {
                min: Math.min(...responseTimesMs),
                max: Math.max(...responseTimesMs),
                avg: responseTimesMs.reduce((a, b) => a + b, 0) / responseTimesMs.length,
                median: responseTimesMs.sort()[Math.floor(responseTimesMs.length / 2)],
              }
            : null,
      };

      await fs.writeFile(this.summaryFilePath, JSON.stringify(stats, null, 2));
      this.logger.info({ summaryFile: this.summaryFilePath }, 'Summary file written');
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to write summary file');
    }
  }

  /**
   * Check log file size and rotate if necessary
   */
  async checkAndRotateLog() {
    try {
      const stats = await fs.stat(this.logFilePath);

      if (stats.size > this.options.maxLogFileSize) {
        const rotatedPath = `${this.logFilePath}.${Date.now()}`;
        await fs.rename(this.logFilePath, rotatedPath);
        this.logger.info({ rotatedPath }, 'Log file rotated');
      }
    } catch (error) {
      // File doesn't exist yet, which is fine
      if (error.code !== 'ENOENT') {
        this.logger.warn({ error: error.message }, 'Failed to check log file size');
      }
    }
  }

  /**
   * Get current statistics
   * @returns {object} Current counters and stats
   */
  getStats() {
    return {
      ...this.counters,
      log_file: this.logFilePath,
      summary_file: this.summaryFilePath,
    };
  }

  /**
   * Finalize logging (call at end of job)
   */
  async finalize() {
    const finalSummary = {
      job_completed: true,
      final_stats: this.getStats(),
    };

    await this.logBatchSummary(finalSummary);
    this.logger.info({ jobId: this.options.jobId }, 'Structured logging finalized');
  }
}

module.exports = { StructuredLogger };
