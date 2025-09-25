/**
 * Netlify function to expose rate limiter metrics
 */

const AdaptiveRateLimiter = require('../../src/lib/http/adaptive-rate-limiter');
const { headersForEvent, preflight } = require('./_lib/cors');

exports.handler = async (event, context) => {
  const baseHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  };
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: headersForEvent(event, baseHeaders),
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
    headers: headersForEvent(event, baseHeaders),
    body: JSON.stringify(metrics, null, 2)
  };
};