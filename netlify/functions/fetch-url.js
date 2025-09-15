/**
 * Enhanced URL fetching with intelligent retry
 */

const RetryManager = require('../../src/lib/retry-manager');
const { fetchWithEnhancedClient } = require('../../src/lib/http/simple-enhanced-client');
const ContentExtractor = require('../../src/lib/content-extractor');

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
    
    const retryManager = new RetryManager({
      maxRetries: 5,
      baseBackoffMs: 2000,
      maxBackoffMs: 30000
    });
    
    try {
      // Execute fetch with retry logic
      const result = await retryManager.executeWithRetry(
        async (urlToFetch) => {
          const response = await fetchWithEnhancedClient(urlToFetch, {
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; EdgeScraperPro/2.0)'
            }
          });
          
          if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            throw error;
          }
          
          const html = await response.text();
          
          // Extract content
          const extractor = new ContentExtractor();
          const extracted = extractor.extract(urlToFetch, html);
          
          return {
            url: urlToFetch,
            status: response.status,
            ...extracted
          };
        },
        url
      );
      
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ok: true,
          data: result,
          timestamp: new Date().toISOString()
        })
      };
      
    } catch (error) {
      console.error('[fetch-url] Error:', error);
      
      return {
        statusCode: error.status || 500,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: {
            message: error.message,
            code: error.code,
            retryAttempts: error.retryAttempts || 0
          }
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