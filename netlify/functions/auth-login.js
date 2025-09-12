/**
 * Netlify Function: Authentication Login
 * Handles user login and returns JWT token
 */

const { AuthService } = require('../../dist/lib/auth');
const { ValidationUtils, schemas } = require('../../dist/lib/validation');
const { ErrorHandler, createError } = require('../../dist/lib/middleware/error-handler');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: {
          code: 'method_not_allowed',
          message: 'Only POST method is allowed',
        },
      }),
    };
  }

  try {
    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validatedData = ValidationUtils.validateBody(schemas.auth.login, body);
    
    // Authenticate user
    const result = await AuthService.login(validatedData);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: result,
      }),
    };
  } catch (error) {
    const errorResponse = ErrorHandler.handleError(error);
    return {
      ...errorResponse,
      headers
    };
  }
};