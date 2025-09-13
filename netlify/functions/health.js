/**
 * Netlify Function: health
 * Public health check that verifies the Functions runtime is working.
 */
const { withCORS } = require('./_middleware');

exports.handler = withCORS(async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      correlationId: context.correlationId,
      environment: process.env.NODE_ENV || 'production'
    })
  };
});