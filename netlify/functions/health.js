/**
 * Netlify Function: health
 * Public health check that verifies the Functions runtime is working.
 */
const { corsHeaders } = require('../../src/lib/http/cors');
const { randomUUID } = require('crypto');

exports.handler = async (event) => {
  const correlationId = event.headers?.['x-correlation-id'] || randomUUID();
  const origin = event.headers?.origin;
  const headers = {
    ...corsHeaders(origin),
    'Content-Type': 'application/json',
    'x-correlation-id': correlationId,
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: { code: 'method_not_allowed', message: 'Only GET method is allowed' } }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      ok: true, 
      data: { 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        correlationId,
        environment: process.env.NODE_ENV || 'production',
        functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION || 'unknown'
      } 
    }),
  };
};

