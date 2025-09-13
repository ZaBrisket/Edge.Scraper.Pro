const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'https://edgescraperpro.com').split(',');

exports.withCORS = (handler) => async (event, context) => {
  const origin = event.headers.origin || event.headers.Origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  // Add correlation ID
  const correlationId = event.headers['x-correlation-id'] || 
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  context.correlationId = correlationId;
  headers['x-correlation-id'] = correlationId;

  try {
    const response = await handler(event, context);
    return {
      ...response,
      headers: {
        ...headers,
        ...(response.headers || {})
      }
    };
  } catch (error) {
    console.error(`[${correlationId}] Error:`, error);
    
    // If the error is already a properly formatted response, return it with CORS headers
    if (error && typeof error === 'object' && error.statusCode && error.body) {
      return {
        ...error,
        headers: {
          ...headers,
          ...(error.headers || {})
        }
      };
    }
    
    // Otherwise, format the error response
    return {
      statusCode: error.statusCode || 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ok: false,
        error: {
          message: error.message || 'Internal server error',
          code: error.code || 'INTERNAL'
        }
      })
    };
  }
};