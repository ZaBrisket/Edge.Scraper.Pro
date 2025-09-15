/**
 * Session status endpoint
 */

const SessionManager = require('../../src/lib/session-manager');

exports.handler = async (event, context) => {
  const sessionManager = await SessionManager.create();
  
  // Parse query parameters
  const { sessionId } = event.queryStringParameters || {};
  
  if (event.httpMethod === 'GET') {
    try {
      if (sessionId) {
        // Get specific session stats
        const stats = await sessionManager.getSessionStats(sessionId);
        return {
          statusCode: 200,
          body: JSON.stringify(stats)
        };
      } else {
        // List all sessions
        const sessions = await sessionManager.listSessions();
        return {
          statusCode: 200,
          body: JSON.stringify({ sessions })
        };
      }
    } catch (error) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: error.message })
      };
    }
  }
  
  return {
    statusCode: 405,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};