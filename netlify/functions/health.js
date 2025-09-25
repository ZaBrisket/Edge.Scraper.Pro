const { headersForEvent, preflight } = require('./_lib/cors');

exports.handler = async (event = {}) => {
  const baseHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  return {
    statusCode: 200,
    headers: headersForEvent(event, baseHeaders),
    body: JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      service: 'EdgeScraperPro'
    })
  };
};