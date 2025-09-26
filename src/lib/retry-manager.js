/**
 * Intelligent Retry Manager
 * Implements error-specific retry strategies with progressive backoff
 */

class RetryManager {
  constructor(options = {}) {
    this.strategies = this.loadStrategies();
    this.maxRetries = options.maxRetries || 5;
    this.baseBackoffMs = options.baseBackoffMs || 1000;
    this.maxBackoffMs = options.maxBackoffMs || 60000;
    this.jitterFactor = options.jitterFactor || 0.3;
    
    this.retryHistory = new Map();
    this.metrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      byErrorType: {}
    };
  }
  
  loadStrategies() {
    return {
      // Rate limiting errors
      RATE_LIMITED: {
        maxRetries: 5,
        backoffMultiplier: 2,
        initialDelayMs: 5000,
        strategy: 'exponential_backoff_with_jitter',
        canRetry: true
      },
      
      // Timeout errors
      TIMEOUT: {
        maxRetries: 3,
        backoffMultiplier: 1.5,
        initialDelayMs: 2000,
        strategy: 'linear_backoff',
        canRetry: true
      },
      
      // Network errors
      ECONNRESET: {
        maxRetries: 4,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
        strategy: 'exponential_backoff',
        canRetry: true
      },
      
      ECONNREFUSED: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelayMs: 3000,
        strategy: 'exponential_backoff',
        canRetry: true
      },
      
      // DNS errors
      ENOTFOUND: {
        maxRetries: 1,
        backoffMultiplier: 1,
        initialDelayMs: 1000,
        strategy: 'fixed_delay',
        canRetry: true,
        beforeRetry: 'canonicalize_url'
      },
      
      // HTTP errors
      HTTP_404: {
        maxRetries: 2,
        backoffMultiplier: 1,
        initialDelayMs: 0,
        strategy: 'immediate',
        canRetry: true,
        beforeRetry: 'canonicalize_url'
      },
      
      HTTP_403: {
        maxRetries: 2,
        backoffMultiplier: 1,
        initialDelayMs: 5000,
        strategy: 'fixed_delay',
        canRetry: true,
        beforeRetry: 'rotate_user_agent'
      },
      
      HTTP_500: {
        maxRetries: 3,
        backoffMultiplier: 3,
        initialDelayMs: 10000,
        strategy: 'exponential_backoff',
        canRetry: true
      },
      
      HTTP_502: {
        maxRetries: 4,
        backoffMultiplier: 2,
        initialDelayMs: 5000,
        strategy: 'exponential_backoff',
        canRetry: true
      },
      
      HTTP_503: {
        maxRetries: 5,
        backoffMultiplier: 2,
        initialDelayMs: 10000,
        strategy: 'exponential_backoff_with_jitter',
        canRetry: true
      },
      
      // SSL errors
      SSL_ERROR: {
        maxRetries: 1,
        backoffMultiplier: 1,
        initialDelayMs: 1000,
        strategy: 'fixed_delay',
        canRetry: true,
        beforeRetry: 'downgrade_to_http'
      },
      
      // Default strategy
      DEFAULT: {
        maxRetries: 2,
        backoffMultiplier: 2,
        initialDelayMs: 2000,
        strategy: 'exponential_backoff',
        canRetry: true
      }
    };
  }
  
  async executeWithRetry(fn, url, options = {}) {
    const maxAttempts = options.maxRetries || this.maxRetries;
    let lastError = null;
    let attempt = 0;
    const originalFn = fn; // Store original function before any modifications
    
    // Initialize retry history for this URL
    if (!this.retryHistory.has(url)) {
      this.retryHistory.set(url, []);
    }
    
    while (attempt < maxAttempts) {
      attempt++;
      
      try {
        console.info(`[RetryManager] Attempt ${attempt}/${maxAttempts} for ${url}`);
        
        // Execute the function
        const result = await fn(url);
        
        // Success - update metrics
        if (attempt > 1) {
          this.metrics.successfulRetries++;
          console.info(`[RetryManager] Retry successful on attempt ${attempt}`);
        }
        
        // Clear retry history on success
        this.retryHistory.delete(url);
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Record attempt
        this.retryHistory.get(url).push({
          attempt,
          error: error.code || error.message,
          timestamp: Date.now(),
          url: url
        });
        
        // Determine retry strategy
        const errorType = this.classifyError(error);
        const strategy = this.strategies[errorType] || this.strategies.DEFAULT;
        
        // Update metrics
        this.metrics.totalRetries++;
        this.metrics.byErrorType[errorType] = (this.metrics.byErrorType[errorType] || 0) + 1;
        
        console.warn(`[RetryManager] Error type: ${errorType}, Strategy: ${strategy.strategy}`);
        
        // Check if we should retry
        if (!strategy.canRetry || attempt >= Math.min(maxAttempts, strategy.maxRetries)) {
          console.warn('[RetryManager] Max retries reached or non-retryable error');
          break;
        }
        
        // Apply pre-retry modifications if needed
        if (strategy.beforeRetry) {
          const newUrl = await this.applyPreRetryStrategy(strategy.beforeRetry, url, error);
          if (newUrl !== url) {
            // Initialize retry history for new URL if it doesn't exist
            if (!this.retryHistory.has(newUrl)) {
              this.retryHistory.set(newUrl, []);
            }
            url = newUrl;
          }
        }
        
        // Calculate delay
        const delay = this.calculateDelay(strategy, attempt);
        console.info(`[RetryManager] Waiting ${delay}ms before retry`);
        
        // Wait before retry
        await this.sleep(delay);
        
        // Update function with new URL if changed
        if (strategy.beforeRetry) {
          fn = async (modifiedUrl) => {
            return originalFn(modifiedUrl);
          };
        }
      }
    }
    
    // All retries exhausted
    this.metrics.failedRetries++;
    
    // Enhance error with retry information
    lastError.retryAttempts = attempt;
    lastError.retryHistory = this.retryHistory.get(url);
    
    throw lastError;
  }
  
  classifyError(error) {
    // Check for specific error codes
    if (error.code) {
      if (error.code === 'RATE_LIMITED' || error.status === 429) {
        return 'RATE_LIMITED';
      }
      if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
        return 'TIMEOUT';
      }
      if (error.code === 'ECONNRESET') {
        return 'ECONNRESET';
      }
      if (error.code === 'ECONNREFUSED') {
        return 'ECONNREFUSED';
      }
      if (error.code === 'ENOTFOUND') {
        return 'ENOTFOUND';
      }
      if (error.code.startsWith('SSL') || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        return 'SSL_ERROR';
      }
    }
    
    // Check for HTTP status codes
    if (error.status) {
      if (error.status === 404) return 'HTTP_404';
      if (error.status === 403) return 'HTTP_403';
      if (error.status === 500) return 'HTTP_500';
      if (error.status === 502) return 'HTTP_502';
      if (error.status === 503) return 'HTTP_503';
    }
    
    // Check error message patterns
    if (error.message) {
      if (error.message.includes('timeout')) return 'TIMEOUT';
      if (error.message.includes('429')) return 'RATE_LIMITED';
      if (error.message.includes('ECONNRESET')) return 'ECONNRESET';
    }
    
    return 'DEFAULT';
  }
  
  calculateDelay(strategy, attempt) {
    let delay = strategy.initialDelayMs;
    
    switch (strategy.strategy) {
      case 'immediate':
        return 0;
        
      case 'fixed_delay':
        return delay;
        
      case 'linear_backoff':
        delay = delay * attempt;
        break;
        
      case 'exponential_backoff':
        delay = delay * Math.pow(strategy.backoffMultiplier, attempt - 1);
        break;
        
      case 'exponential_backoff_with_jitter':
        delay = delay * Math.pow(strategy.backoffMultiplier, attempt - 1);
        // Add jitter (±30% by default)
        const jitter = delay * this.jitterFactor * (Math.random() * 2 - 1);
        delay = delay + jitter;
        break;
    }
    
    // Cap at maximum backoff
    return Math.min(Math.max(0, Math.round(delay)), this.maxBackoffMs);
  }
  
  async applyPreRetryStrategy(strategy, url, error) {
    switch (strategy) {
      case 'canonicalize_url':
        return this.canonicalizeUrl(url);
        
      case 'rotate_user_agent':
        // This would be handled in the fetch options
        console.info(`[RetryManager] Rotating user agent for ${url}`);
        return url;
        
      case 'downgrade_to_http':
        if (url.startsWith('https://')) {
          const httpUrl = url.replace('https://', 'http://');
          console.warn(`[RetryManager] Downgrading to HTTP: ${httpUrl}`);
          return httpUrl;
        }
        return url;
        
      default:
        return url;
    }
  }
  
  canonicalizeUrl(url) {
    const variations = [];
    const parsed = new URL(url);
    
    // Try HTTPS if HTTP
    if (parsed.protocol === 'http:') {
      variations.push(url.replace('http://', 'https://'));
    }
    
    // Try with/without www
    if (parsed.hostname.startsWith('www.')) {
      variations.push(url.replace('://www.', '://'));
    } else {
      variations.push(url.replace('://', '://www.'));
    }
    
    // Try with/without trailing slash
    if (parsed.pathname.endsWith('/')) {
      variations.push(url.slice(0, -1));
    } else if (!parsed.pathname.includes('.')) {
      variations.push(url + '/');
    }
    
    // Return first variation we haven't tried
    for (const variant of variations) {
      const history = this.retryHistory.get(url) || [];
      const tried = history.some(h => h.url === variant);
      if (!tried) {
        console.info(`[RetryManager] Trying URL variant: ${variant}`);
        return variant;
      }
    }
    
    return url;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalRetries > 0 
        ? (this.metrics.successfulRetries / this.metrics.totalRetries * 100).toFixed(1) + '%'
        : 'N/A',
      topErrors: Object.entries(this.metrics.byErrorType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }
  
  reset() {
    this.retryHistory.clear();
    this.metrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      byErrorType: {}
    };
  }
}

module.exports = RetryManager;