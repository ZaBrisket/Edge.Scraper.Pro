const { URL } = require('url');

// Simplified CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
};

exports.handler = async (event, context) => {
  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  try {
    // Simple API key check (optional)
    const apiKey = event.headers['x-api-key'];
    const expectedKey = process.env.PUBLIC_API_KEY || 'public-2024';
    
    if (process.env.BYPASS_AUTH !== 'true' && apiKey !== expectedKey) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: { message: 'Invalid or missing API key' }
        })
      };
    }
    
    // Get URL parameter
    const url = event.queryStringParameters?.url;
    if (!url) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: { message: 'Missing ?url= parameter' }
        })
      };
    }
    
    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (e) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: { message: 'Invalid URL format' }
        })
      };
    }
    
    // Fetch the URL with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'EdgeScraperPro/1.0'
        }
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: true,
          url: url,
          html: html,
          contentLength: html.length,
          timestamp: new Date().toISOString()
        })
      };
      
    } catch (fetchError) {
      clearTimeout(timeout);
      
      if (fetchError.name === 'AbortError') {
        return {
          statusCode: 504,
          headers: corsHeaders,
          body: JSON.stringify({
            ok: false,
            error: { message: 'Request timeout (15s)' }
          })
        };
      }
      
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: { message: fetchError.message }
        })
      };
    }
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: { message: error.message }
      })
    };
  }
};