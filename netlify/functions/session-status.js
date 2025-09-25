/**
 * Session status endpoint
 */

const SessionManager = require('../../src/lib/session-manager');
const { preflight } = require('./_lib/cors');
const { jsonForEvent } = require('./_lib/http');

exports.handler = async (event, context) => {
  const baseHeaders = {};
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  const sessionManager = new SessionManager();

  // Parse query parameters
  const { sessionId } = event.queryStringParameters || {};

  if ((event.httpMethod || '').toUpperCase() === 'GET') {
    try {
      if (sessionId) {
        // Get specific session stats
        const stats = await sessionManager.getSessionStats(sessionId);
        return jsonForEvent(event, stats, 200, baseHeaders);
      } else {
        // List all sessions
        const sessions = await sessionManager.listSessions();
        return jsonForEvent(event, { sessions }, 200, baseHeaders);
      }
    } catch (error) {
      return jsonForEvent(event, { error: error.message }, 404, baseHeaders);
    }
  }

  return jsonForEvent(event, { error: 'Method not allowed' }, 405, baseHeaders);
};