/**
 * Netlify Function: Health Check
 * Provides deployment status and environment validation
 */

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: {
          code: 'method_not_allowed',
          message: 'Only GET method is allowed',
        },
      }),
    };
  }

  try {
    // Check environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'JWT_SECRET',
    ];

    const optionalEnvVars = [
      'ALLOWED_ORIGINS',
      'JWT_EXPIRES_IN',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'S3_BUCKET',
      'REDIS_URL',
    ];

    const envStatus = {
      required: {},
      optional: {},
    };

    // Check required environment variables
    for (const envVar of requiredEnvVars) {
      envStatus.required[envVar] = !!process.env[envVar];
    }

    // Check optional environment variables
    for (const envVar of optionalEnvVars) {
      envStatus.optional[envVar] = !!process.env[envVar];
    }

    // Check if required dependencies can be loaded
    const dependencyStatus = {};
    
    try {
      require('../../dist/lib/auth');
      dependencyStatus.auth = 'ok';
    } catch (error) {
      dependencyStatus.auth = `error: ${error.message}`;
    }

    try {
      require('../../dist/lib/validation');
      dependencyStatus.validation = 'ok';
    } catch (error) {
      dependencyStatus.validation = `error: ${error.message}`;
    }

    try {
      require('../../dist/lib/middleware/error-handler');
      dependencyStatus.errorHandler = 'ok';
    } catch (error) {
      dependencyStatus.errorHandler = `error: ${error.message}`;
    }

    // Database connectivity test
    let databaseStatus = 'not_tested';
    if (process.env.DATABASE_URL) {
      try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        await prisma.$queryRaw`SELECT 1`;
        databaseStatus = 'connected';
        await prisma.$disconnect();
      } catch (error) {
        databaseStatus = `error: ${error.message}`;
      }
    } else {
      databaseStatus = 'no_database_url';
    }

    const allRequiredPresent = Object.values(envStatus.required).every(Boolean);
    const status = allRequiredPresent ? 'healthy' : 'degraded';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          status,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
          envStatus,
          dependencyStatus,
          databaseStatus,
          issues: allRequiredPresent ? [] : [
            'Missing required environment variables. Check your Netlify environment configuration.',
          ],
        },
      }),
    };
  } catch (error) {
    console.error('Health check error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: {
          code: 'health_check_failed',
          message: 'Health check failed',
          details: error.message,
        },
      }),
    };
  }
};