/**
 * Netlify Function: health
 * Public health check that verifies the Functions runtime is working.
 */
const { withCORS } = require('./_middleware');

exports.handler = withCORS(async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ok: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        correlationId: context.correlationId,
        environment: process.env.NODE_ENV || 'production',
        functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION || 'unknown'
      }
    })
  };
});