/**
 * Netlify function to expose rate limiter metrics
 */

const AdaptiveRateLimiter = require('../../src/lib/http/adaptive-rate-limiter');

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  // Get metrics from the global rate limiter
  const metrics = global.adaptiveRateLimiter?.getMetrics() || {
    message: 'Rate limiter not initialized',
    domains: {},
    global: {}
  };
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify(metrics, null, 2)
  };
};