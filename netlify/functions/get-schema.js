// netlify/functions/get-schema.js
// Deprecated endpoint: Schema Scrape has been removed.
// Returns 410 Gone with migration guidance.

exports.handler = async (event) => {
  // Basic CORS for OPTIONS preflight parity with other functions
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      },
    };
  }

  const body = {
    ok: false,
    error: {
      code: 'SCHEMA_REMOVED',
      message:
        'Schema Scrape has been removed. Use Bulk Scrape and /.netlify/functions/fetch-url instead.',
    },
  };

  return {
    statusCode: 410,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    },
    body: JSON.stringify(body),
  };
};

