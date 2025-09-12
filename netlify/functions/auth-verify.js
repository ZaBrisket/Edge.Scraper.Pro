/**
 * Netlify Function: Authentication Verify
 * Verifies JWT token and returns user info
 */

const { AuthService } = require('../../dist/lib/auth');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
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
    // Check for required environment variables
    if (!process.env.JWT_SECRET) {
      console.error('Missing JWT_SECRET environment variable');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: {
            code: 'server_misconfiguration',
            message: 'Server configuration error. Please check deployment settings.',
          },
        }),
      };
    }

    if (!process.env.DATABASE_URL) {
      console.error('Missing DATABASE_URL environment variable');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: {
            code: 'server_misconfiguration',
            message: 'Database configuration error. Please check deployment settings.',
          },
        }),
      };
    }

    // Get authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: {
            code: 'missing_token',
            message: 'Authorization token required',
          },
        }),
      };
    }

    const token = authHeader.substring(7);
    
    // Verify token
    const payload = AuthService.verifyToken(token);
    
    // Get user info
    const user = await AuthService.getUserById(payload.userId);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          user: {
            ...user,
            permissions: payload.permissions
          }
        },
      }),
    };
  } catch (error) {
    console.error('Token verification error:', error);
    
    // Provide more specific error messages
    if (error.message.includes('JWT_SECRET')) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: {
            code: 'server_misconfiguration',
            message: 'Authentication service configuration error',
          },
        }),
      };
    }

    if (error.message.includes('Database')) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: {
            code: 'database_error',
            message: 'Database connection error',
          },
        }),
      };
    }
    
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: {
          code: 'invalid_token',
          message: error.message || 'Invalid or expired token',
        },
      }),
    };
  }
};