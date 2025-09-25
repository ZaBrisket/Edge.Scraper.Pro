/**
 * Session status endpoint
 */

const SessionManager = require('../../src/lib/session-manager');
const { headersForEvent, preflight } = require('./_lib/cors');

exports.handler = async (event, context) => {
  const baseHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  const sessionManager = new SessionManager();

  // Parse query parameters
  const { sessionId } = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    try {
      if (sessionId) {
        // Get specific session stats
        const stats = await sessionManager.getSessionStats(sessionId);
        return {
          statusCode: 200,
          headers: headersForEvent(event, baseHeaders),
          body: JSON.stringify(stats)
        };
      } else {
        // List all sessions
        const sessions = await sessionManager.listSessions();
        return {
          statusCode: 200,
          headers: headersForEvent(event, baseHeaders),
          body: JSON.stringify({ sessions })
        };
      }
    } catch (error) {
      return {
        statusCode: 404,
        headers: headersForEvent(event, baseHeaders),
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers: headersForEvent(event, baseHeaders),
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};