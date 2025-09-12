/**
 * Netlify Function: Authentication Register
 * Handles user registration
 */

const { AuthService } = require('../../src/lib/auth');
const { ValidationUtils, schemas } = require('../../src/lib/validation');

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
    const validatedData = ValidationUtils.validateBody(schemas.auth.register, body);
    
    // Register user
    const user = await AuthService.register(validatedData);
    
    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        data: { user },
      }),
    };
  } catch (error) {
    console.error('Registration error:', error);
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: {
          code: 'registration_failed',
          message: error.message || 'Registration failed',
        },
      }),
    };
  }
};