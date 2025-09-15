/**
 * Enhanced URL fetching with intelligent retry
 */

const RetryManager = require('../../src/lib/retry-manager');
const { fetchWithEnhancedClient } = require('../../src/lib/http/simple-enhanced-client');
const ContentExtractor = require('../../src/lib/content-extractor');

exports.handler = async (event, context) => {
  const { url } = event.queryStringParameters || {};
  
  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'URL parameter required' })
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('[fetch-url] Error:', error);
    
    return {
      statusCode: error.status || 500,
      body: JSON.stringify({
        error: error.message,
        code: error.code,
        retryAttempts: error.retryAttempts || 0
      })
    };
  }
};