/**
 * Netlify function to expose rate limiter metrics
 */

const AdaptiveRateLimiter = require('../../src/lib/http/adaptive-rate-limiter');
const { preflight } = require('./_lib/cors');
const { jsonForEvent } = require('./_lib/http');

exports.handler = async (event, context) => {
  const baseHeaders = {
    'Cache-Control': 'no-cache',
  };
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return jsonForEvent(event, { error: 'Method not allowed' }, 405, baseHeaders);
  }

  // Get metrics from the global rate limiter
  const metrics = global.adaptiveRateLimiter?.getMetrics() || {
    message: 'Rate limiter not initialized',
    domains: {},
    global: {}
  };
  
  return jsonForEvent(event, metrics, 200, baseHeaders);
};