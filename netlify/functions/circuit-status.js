/**
 * Netlify Function: circuit-status
 * Returns current circuit breaker and rate limiting status
 */
const { getMetrics, getCircuitStates } = require('../../src/lib/http/simple-enhanced-client');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  try {
    const metrics = getMetrics();
    const circuitStates = getCircuitStates();
    
    // Calculate rate limit status
    const rateLimitStatus = {};
    Object.keys(metrics.requests.byHost).forEach(host => {
      const requestCount = metrics.requests.byHost[host];
      const rateLimitHits = metrics.rateLimits.byHost[host] || 0;
      rateLimitStatus[host] = {
        requests: requestCount,
        rateLimitHits: rateLimitHits,
        rateLimitRate: requestCount > 0 ? (rateLimitHits / requestCount * 100).toFixed(1) : 0
      };
    });
    
    const response = {
      circuits: circuitStates,
      rateLimits: rateLimitStatus,
      metrics: {
        totalRequests: metrics.requests.total,
        totalRateLimits: metrics.rateLimits.hits,
        totalRetries: metrics.retries.scheduled,
        totalDeferrals: metrics.deferrals.count,
        circuitStateChanges: metrics.circuitBreaker.stateChanges
      },
      timestamp: new Date().toISOString()
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      },
      body: JSON.stringify({
        error: {
          message: error.message,
          code: 'INTERNAL_ERROR'
        }
      })
    };
  }
};