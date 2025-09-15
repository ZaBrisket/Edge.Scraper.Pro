/**
 * Universal fetch function for M&A news scraping
 */

const UniversalHttpClient = require('../../src/lib/http/universal-client');
const newsExtractor = require('../../src/lib/extractors/news-extractor');
const { getSiteProfile } = require('../../src/lib/http/site-profiles');

const httpClient = new UniversalHttpClient({
  maxRetries: 5,
  timeout: 30000,
  proxyUrl: process.env.PROXY_URL
});

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
    // API key validation (optional but recommended)
    const apiKey = event.headers['x-api-key'];
    const expectedKey = process.env.PUBLIC_API_KEY || 'public-2024';
    
    if (process.env.BYPASS_AUTH !== 'true' && apiKey !== expectedKey) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: { 
            message: 'Invalid or missing API key',
            code: 'UNAUTHORIZED'
          }
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
          error: { 
            message: 'URL parameter required',
            code: 'MISSING_URL'
          } 
        })
      };
    }
    
    // Validate URL format
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
          error: { 
            message: 'Invalid URL format',
            code: 'INVALID_URL'
          }
        })
      };
    }
    
    const correlationId = event.requestContext?.requestId || generateId();
    
    // Get site profile for intelligent handling
    const siteProfile = getSiteProfile(url);
    
    // Add delay for rate-limited sites
    if (siteProfile.rateLimit.rps < 0.5) {
      await sleep(1000 + Math.random() * 2000);
    }
    
    // Fetch with universal protection
    const response = await httpClient.fetchWithProtection(url, {
      headers: {
        'X-Correlation-Id': correlationId
      }
    });
    
    const html = await response.text();
    
    // Extract content using universal extractor
    const extracted = newsExtractor.extractContent(html, url);
    
    // Check for paywall
    if (extracted.metadata?.hasPaywall) {
      console.warn(`Paywall detected for ${url}`);
    }
    
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        'X-Site-Category': siteProfile.category,
        'Cache-Control': 'private, max-age=3600'
      },
      body: JSON.stringify({
        ok: true,
        data: {
          success: true,
          url,
          ...extracted,
          httpMetrics: httpClient.getMetrics()
        },
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error);
    
    return {
      statusCode: error.status || 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: {
          message: error.message,
          errorClass: classifyError(error),
          url
        },
        httpMetrics: httpClient.getMetrics()
      })
    };
  }
};

function classifyError(error) {
  const message = error.message.toLowerCase();
  const errorName = error.name?.toLowerCase();
  
  // Check error name first for more accurate classification
  if (errorName === 'timeouterror' || errorName === 'aborterror') return 'timeout';
  if (errorName === 'typeerror' && message.includes('fetch')) return 'network_error';
  
  // Check message content
  if (message.includes('429') || message.includes('rate')) return 'rate_limited';
  if (message.includes('403')) return 'forbidden';
  if (message.includes('401')) return 'unauthorized';
  if (message.includes('404')) return 'not_found';
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (message.includes('paywall')) return 'paywall';
  if (message.includes('cloudflare')) return 'anti_bot_challenge';
  if (message.includes('econnrefused') || message.includes('connection refused')) return 'connection_refused';
  if (message.includes('enotfound') || message.includes('dns')) return 'dns_error';
  if (message.includes('econnreset') || message.includes('connection reset')) return 'connection_reset';
  
  return 'unknown';
}

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}