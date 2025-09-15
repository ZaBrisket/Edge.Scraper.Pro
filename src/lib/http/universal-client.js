/**
 * Universal HTTP client for M&A news scraping
 * Handles all major news outlets and PR wire services
 */

const fetch = require('node-fetch');
const https = require('https');
const { getSiteProfile } = require('./site-profiles');
const antiBotBypass = require('./anti-bot-bypass');
const { HttpsProxyAgent } = require('https-proxy-agent');

class UniversalHttpClient {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 5,
      baseBackoff: config.baseBackoff || 3000,
      maxBackoff: config.maxBackoff || 60000,
      timeout: config.timeout || 30000,
      proxyUrl: config.proxyUrl || process.env.PROXY_URL,
      ...config
    };
    
    this.rateLimiters = new Map();
    this.metrics = {
      total: 0,
      successful: 0,
      failed: 0,
      byCategory: {}
    };

    // Enhanced HTTPS agent
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: this.config.timeout,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3'
    });

    // Proxy agent for sites requiring it
    if (this.config.proxyUrl) {
      this.proxyAgent = new HttpsProxyAgent(this.config.proxyUrl);
    }
  }

  /**
   * Main fetch method with all protections
   */
  async fetchWithProtection(url, options = {}) {
    const siteProfile = getSiteProfile(url);
    
    // Apply rate limiting
    await this.enforceRateLimit(siteProfile);
    
    // Build headers
    const headers = antiBotBypass.buildHeaders(url, siteProfile);
    
    // Determine agent
    const agent = siteProfile.requiresProxy ? this.proxyAgent : this.httpsAgent;
    
    const fetchOptions = {
      ...options,
      headers: { ...headers, ...options.headers },
      agent,
      compress: true,
      redirect: 'follow',
      follow: 10,
      timeout: this.config.timeout
    };

    let lastError;
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      attempt++;
      
      try {
        const response = await fetch(url, fetchOptions);
        
        // Handle Cloudflare challenge
        if (response.status === 503 || response.status === 403) {
          const challengeResult = await antiBotBypass.handleCloudflareChallenge(response, url);
          if (challengeResult.success) {
            fetchOptions.headers = { ...fetchOptions.headers, ...challengeResult.headers };
            continue;
          }
        }
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = this.parseRetryAfter(response.headers.get('retry-after'));
          await this.sleep(retryAfter || this.calculateBackoff(attempt));
          continue;
        }
        
        // Store cookies for session
        const cookies = response.headers.get('set-cookie');
        if (cookies) {
          antiBotBypass.storeSession(siteProfile.hostname, cookies);
        }
        
        // Success
        if (response.ok || response.status === 404) {
          this.updateMetrics(siteProfile, true);
          return response;
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
      } catch (error) {
        lastError = error;
        this.updateMetrics(siteProfile, false);
        
        if (attempt < this.config.maxRetries) {
          const backoff = this.calculateBackoff(attempt);
          await this.sleep(backoff);
          continue;
        }
      }
    }
    
    throw lastError || new Error(`Failed after ${attempt} attempts`);
  }

  /**
   * Rate limiting per site
   */
  async enforceRateLimit(siteProfile) {
    const key = siteProfile.hostname;
    
    if (!this.rateLimiters.has(key)) {
      this.rateLimiters.set(key, {
        tokens: siteProfile.rateLimit.burst,
        lastRefill: Date.now(),
        rps: siteProfile.rateLimit.rps
      });
    }
    
    const limiter = this.rateLimiters.get(key);
    const now = Date.now();
    const elapsed = (now - limiter.lastRefill) / 1000;
    
    // Refill tokens
    limiter.tokens = Math.min(
      siteProfile.rateLimit.burst,
      limiter.tokens + elapsed * limiter.rps
    );
    limiter.lastRefill = now;
    
    // Wait if no tokens
    if (limiter.tokens < 1) {
      const waitTime = (1 - limiter.tokens) / limiter.rps * 1000;
      await this.sleep(waitTime);
      limiter.tokens = 1;
    }
    
    limiter.tokens--;
  }

  /**
   * Calculate exponential backoff with jitter
   */
  calculateBackoff(attempt) {
    const exponential = Math.min(
      this.config.baseBackoff * Math.pow(2, attempt - 1),
      this.config.maxBackoff
    );
    const jitter = Math.random() * 0.3 * exponential;
    return exponential + jitter;
  }

  /**
   * Parse Retry-After header
   */
  parseRetryAfter(value) {
    if (!value) return null;
    const seconds = parseInt(value);
    return isNaN(seconds) ? null : seconds * 1000;
  }

  /**
   * Update metrics
   */
  updateMetrics(siteProfile, success) {
    this.metrics.total++;
    if (success) {
      this.metrics.successful++;
    } else {
      this.metrics.failed++;
    }
    
    const category = siteProfile.category;
    if (!this.metrics.byCategory[category]) {
      this.metrics.byCategory[category] = { total: 0, successful: 0 };
    }
    this.metrics.byCategory[category].total++;
    if (success) {
      this.metrics.byCategory[category].successful++;
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.total > 0 
        ? (this.metrics.successful / this.metrics.total * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Helper sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = UniversalHttpClient;