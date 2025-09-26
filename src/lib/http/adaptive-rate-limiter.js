/**
 * Adaptive Rate Limiter with per-domain profiles and 429 learning
 * Production-ready implementation for EdgeScraper Pro
 */

const EventEmitter = require('events');

class AdaptiveRateLimiter extends EventEmitter {
  constructor() {
    super();
    this.domainStates = new Map();
    this.domainProfiles = this.loadDomainProfiles();
    this.globalMetrics = {
      totalRequests: 0,
      total429s: 0,
      totalAdjustments: 0,
      startTime: Date.now()
    };
  }

  loadDomainProfiles() {
    return {
      'insurancejournal.com': {
        initialRPS: 10,
        maxRPS: 15,
        minRPS: 1,
        burst: 20,
        backoffMultiplier: 0.5,
        recoveryMultiplier: 1.1,
        recoveryThreshold: 10, // successful requests before increasing rate
        cooldownMs: 60000
      },
      'www.insurancejournal.com': {
        initialRPS: 10,
        maxRPS: 15,
        minRPS: 1,
        burst: 20,
        backoffMultiplier: 0.5,
        recoveryMultiplier: 1.1,
        recoveryThreshold: 10,
        cooldownMs: 60000
      },
      'pro-football-reference.com': {
        initialRPS: 0.5,
        maxRPS: 1,
        minRPS: 0.2,
        burst: 1,
        backoffMultiplier: 0.3,
        recoveryMultiplier: 1.05,
        recoveryThreshold: 20,
        cooldownMs: 120000
      },
      'www.pro-football-reference.com': {
        initialRPS: 0.5,
        maxRPS: 1,
        minRPS: 0.2,
        burst: 1,
        backoffMultiplier: 0.3,
        recoveryMultiplier: 1.05,
        recoveryThreshold: 20,
        cooldownMs: 120000
      },
      'default': {
        initialRPS: 5,
        maxRPS: 10,
        minRPS: 0.5,
        burst: 10,
        backoffMultiplier: 0.6,
        recoveryMultiplier: 1.1,
        recoveryThreshold: 15,
        cooldownMs: 30000
      }
    };
  }

  getDomainState(hostname) {
    const cleanHostname = hostname.toLowerCase().replace(/^www\./, '');
    
    if (!this.domainStates.has(cleanHostname)) {
      const profile = this.domainProfiles[cleanHostname] || 
                      this.domainProfiles[hostname] || 
                      this.domainProfiles.default;
      
      this.domainStates.set(cleanHostname, {
        hostname: cleanHostname,
        profile: profile,
        currentRPS: profile.initialRPS,
        tokens: profile.burst,
        lastRefill: Date.now(),
        successCount: 0,
        errorCount: 0,
        last429: null,
        pauseUntil: null,
        retryAfterMs: null,
        adjustmentHistory: []
      });
    }
    
    return this.domainStates.get(cleanHostname);
  }

  async acquireToken(hostname) {
    const state = this.getDomainState(hostname);
    
    // Check if we're in a pause period
    if (state.pauseUntil && Date.now() < state.pauseUntil) {
      const waitTime = state.pauseUntil - Date.now();
      await this.sleep(waitTime);
    }
    
    // Refill tokens based on elapsed time
    this.refillTokens(state);
    
    // Wait if no tokens available
    while (state.tokens < 1) {
      await this.sleep(100);
      this.refillTokens(state);
    }
    
    state.tokens -= 1;
    this.globalMetrics.totalRequests++;
    
    return {
      hostname: state.hostname,
      currentRPS: state.currentRPS,
      tokensRemaining: Math.floor(state.tokens)
    };
  }

  refillTokens(state) {
    const now = Date.now();
    const elapsed = now - state.lastRefill;
    const tokensToAdd = (elapsed / 1000) * state.currentRPS;
    
    state.tokens = Math.min(
      state.tokens + tokensToAdd,
      state.profile.burst
    );
    state.lastRefill = now;
  }

  handleResponse(hostname, response) {
    const state = this.getDomainState(hostname);
    
    if (response.status === 429) {
      this.handle429(state, response);
    } else if (response.status >= 200 && response.status < 300) {
      this.handleSuccess(state);
    } else if (response.status >= 500) {
      this.handleServerError(state);
    }
    
    this.emitMetrics(state);
  }

  handle429(state, response) {
    this.globalMetrics.total429s++;
    state.last429 = Date.now();
    state.successCount = 0;
    state.errorCount++;
    
    // Parse Retry-After header if present
    const retryAfter = response.headers?.['retry-after'];
    if (retryAfter) {
      const retryMs = this.parseRetryAfter(retryAfter);
      state.pauseUntil = Date.now() + retryMs;
      state.retryAfterMs = retryMs;
      
      console.warn(`[RateLimiter] Domain ${state.hostname} hit 429, pausing for ${retryMs}ms (Retry-After header)`);
    } else {
      // Exponential backoff without Retry-After header
      const backoffMs = Math.min(
        state.profile.cooldownMs,
        1000 * Math.pow(2, Math.min(state.errorCount, 6))
      );
      state.pauseUntil = Date.now() + backoffMs;
      
      console.warn(`[RateLimiter] Domain ${state.hostname} hit 429, pausing for ${backoffMs}ms (exponential backoff)`);
    }
    
    // Reduce rate
    const newRate = Math.max(
      state.profile.minRPS,
      state.currentRPS * state.profile.backoffMultiplier
    );
    
    this.adjustRate(state, newRate, 'backoff_429');
  }

  handleSuccess(state) {
    state.successCount++;
    state.errorCount = Math.max(0, state.errorCount - 1);
    
    // Consider increasing rate after threshold successes
    if (state.successCount >= state.profile.recoveryThreshold) {
      const timeSince429 = state.last429 ? 
        Date.now() - state.last429 : Infinity;
      
      // Only increase if sufficient time has passed since last 429
      if (timeSince429 > state.profile.cooldownMs) {
        const newRate = Math.min(
          state.profile.maxRPS,
          state.currentRPS * state.profile.recoveryMultiplier
        );
        
        if (newRate > state.currentRPS) {
          this.adjustRate(state, newRate, 'recovery');
          state.successCount = 0; // Reset counter
        }
      }
    }
  }

  handleServerError(state) {
    // Slight reduction for 5xx errors (server might be overloaded)
    state.errorCount++;
    
    if (state.errorCount > 3) {
      const newRate = Math.max(
        state.profile.minRPS,
        state.currentRPS * 0.9
      );
      this.adjustRate(state, newRate, 'server_error');
    }
  }

  adjustRate(state, newRate, reason) {
    const oldRate = state.currentRPS;
    state.currentRPS = newRate;
    
    state.adjustmentHistory.push({
      timestamp: Date.now(),
      oldRate,
      newRate,
      reason
    });
    
    // Keep only last 100 adjustments
    if (state.adjustmentHistory.length > 100) {
      state.adjustmentHistory.shift();
    }
    
    this.globalMetrics.totalAdjustments++;
    
    console.info(`[RateLimiter] Adjusted ${state.hostname} rate: ${oldRate.toFixed(2)} → ${newRate.toFixed(2)} RPS (${reason})`);
  }

  parseRetryAfter(retryAfter) {
    // Retry-After can be seconds (number) or HTTP date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
    
    // Try parsing as date
    const retryDate = new Date(retryAfter);
    if (!isNaN(retryDate.getTime())) {
      return Math.max(0, retryDate.getTime() - Date.now());
    }
    
    // Default fallback
    return 60000;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  emitMetrics(state) {
    this.emit('metrics', {
      domain: state.hostname,
      currentRPS: state.currentRPS,
      tokens: state.tokens,
      successCount: state.successCount,
      errorCount: state.errorCount,
      isPaused: state.pauseUntil > Date.now(),
      global: this.globalMetrics
    });
  }

  getMetrics() {
    const domains = {};
    for (const [hostname, state] of this.domainStates) {
      domains[hostname] = {
        currentRPS: state.currentRPS,
        successCount: state.successCount,
        errorCount: state.errorCount,
        last429: state.last429,
        isPaused: state.pauseUntil > Date.now(),
        adjustments: state.adjustmentHistory.length
      };
    }
    
    return {
      domains,
      global: {
        ...this.globalMetrics,
        uptime: Date.now() - this.globalMetrics.startTime,
        requestsPerSecond: this.globalMetrics.totalRequests / 
          ((Date.now() - this.globalMetrics.startTime) / 1000)
      }
    };
  }

  reset(hostname) {
    if (hostname) {
      this.domainStates.delete(hostname);
    } else {
      this.domainStates.clear();
      this.globalMetrics = {
        totalRequests: 0,
        total429s: 0,
        totalAdjustments: 0,
        startTime: Date.now()
      };
    }
  }
}

module.exports = AdaptiveRateLimiter;