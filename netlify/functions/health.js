/**
 * Health check endpoint
 * Returns basic system status and metrics
 */
const { getMetrics } = require('../../dist/src/lib/http/client');
const { getCorrelationId } = require('../../dist/src/lib/http/correlation');
const { corsHeaders } = require('../../dist/src/lib/http/cors');

exports.handler = async (event) => {
  const correlationId = getCorrelationId(event);
  
  if (event.httpMethod === 'OPTIONS') {
    return { 
      statusCode: 204, 
      headers: { 
        ...corsHeaders(event.headers && event.headers.origin), 
        'x-correlation-id': correlationId 
      } 
    };
  }

  try {
    const metrics = getMetrics();
    
    const health = {
      ok: true,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      metrics: {
        totalRequests: metrics.requests.total,
        rateLimitHits: metrics.rateLimits.hits,
        retriesScheduled: metrics.retries.scheduled,
        circuitBreakerStateChanges: metrics.circuitBreaker.stateChanges,
        activeLimiters: metrics.limiters.length,
        activeCircuits: metrics.circuits.length,
      },
      uptime: process.uptime(),
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(event.headers && event.headers.origin),
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify(health),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(event.headers && event.headers.origin),
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify({
        ok: false,
        error: 'Health check failed',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};