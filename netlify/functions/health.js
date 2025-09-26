const { preflight } = require('./_lib/cors');
const { jsonForEvent } = require('./_lib/http');

exports.handler = async (event = {}) => {
  const baseHeaders = {};
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  const method =
    typeof event.httpMethod === 'string' ? event.httpMethod.trim().toUpperCase() : null;

  if (method !== 'GET') {
    return jsonForEvent(event, { error: 'Method not allowed' }, 405, baseHeaders);
  }

  return jsonForEvent(
    event,
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      service: 'EdgeScraperPro',
    },
    200,
    baseHeaders,
  );
};