const { Buffer } = require('node:buffer');
const { analyzeNda, buildAnalyzePayloadFromJson } = require('../../src/lib/nda/analyzer');
const { requireAuth } = require('../../src/lib/auth/token');

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
    'Vary': 'Origin',
  };
}

function parseJsonBody(event) {
  let bodyString = event.body || '{}';
  if (event.isBase64Encoded && bodyString) {
    bodyString = Buffer.from(bodyString, 'base64').toString('utf8');
  }

  if (!bodyString.trim()) {
    return {};
  }

  try {
    return JSON.parse(bodyString);
  } catch {
    throw new Error('Invalid JSON payload.');
  }
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '*';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin) };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    requireAuth(event.headers || {});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return {
      statusCode: 401,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }

  try {
    const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || 'application/json';
    if (!contentType.includes('application/json')) {
      return {
        statusCode: 415,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unsupported media type. Use application/json.' }),
      };
    }

    const body = parseJsonBody(event);
    const payload = buildAnalyzePayloadFromJson(body);

    // Allow session token override from header when not provided in payload.
    if (!payload.sessionId) {
      const sessionHeader = event.headers?.['x-session-token'] || event.headers?.['X-Session-Token'];
      if (typeof sessionHeader === 'string' && sessionHeader.trim()) {
        payload.sessionId = sessionHeader.trim();
      }
    }

    const result = await analyzeNda(payload);
    return {
      statusCode: 200,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error during NDA analysis.';
    const status = message.includes('already in progress')
      ? 429
      : message.includes('timed out')
      ? 504
      : message.includes('Unsupported media type')
      ? 415
      : 400;

    return {
      statusCode: status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }
};
