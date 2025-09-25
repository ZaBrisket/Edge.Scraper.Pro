const AdaptiveRateLimiter = require('./adaptive-rate-limiter');

// Initialize global adaptive rate limiter
const adaptiveRateLimiter = new AdaptiveRateLimiter();

// Listen to metrics for logging (optional)
adaptiveRateLimiter.on('metrics', (metrics) => {
  if (process.env.DEBUG_RATE_LIMITER === 'true') {
    console.debug('[RateLimiter Metrics]', JSON.stringify(metrics, null, 2));
  }
});


async function fetchWithEnhancedClient(url, options = {}) {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  
  // Acquire token from adaptive rate limiter
  const tokenInfo = await adaptiveRateLimiter.acquireToken(hostname);
  
  try {
    // Set timeout
    const timeout = options.timeout || parseInt(process.env.HTTP_DEADLINE_MS) || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const fetchOptions = {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers,
        'User-Agent': options.headers?.['User-Agent'] || 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    
    // Feed response back to rate limiter for learning
    adaptiveRateLimiter.handleResponse(hostname, response);
    
    // Handle 429 specifically
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const error = new Error(`Rate limited: ${response.status} ${response.statusText}`);
      error.code = 'RATE_LIMITED';
      error.status = 429;
      error.retryAfter = retryAfter;
      throw error;
    }
    
    return response;
    
  } catch (error) {
    // Report errors to rate limiter
    if (error.code !== 'RATE_LIMITED') {
      adaptiveRateLimiter.handleResponse(hostname, {
        status: error.code === 'ECONNREFUSED' ? 503 : 500
      });
    }
    throw error;
  }
}

module.exports = {
  fetchWithEnhancedClient,
  adaptiveRateLimiter,
};
