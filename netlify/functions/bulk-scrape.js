/**
 * Bulk scraping endpoint with stream processing
 */

const StreamProcessor = require('../../src/lib/stream-processor');
const { fetchWithEnhancedClient } = require('../../src/lib/http/simple-enhanced-client');
const ContentExtractor = require('../../src/lib/content-extractor'); // Will create in Fix 3
const { headersForEvent, preflight } = require('./_lib/cors');

exports.handler = async (event, context) => {
  const baseHeaders = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: headersForEvent(event, {
        ...baseHeaders,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { urls, sessionId, resume } = JSON.parse(event.body);
    
    if (!urls || !Array.isArray(urls)) {
      return {
        statusCode: 400,
        headers: headersForEvent(event, {
          ...baseHeaders,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ error: 'Invalid URLs array' })
      };
    }
    
    // Initialize stream processor
    const processor = new StreamProcessor({
      chunkSize: 50,
      sessionId: sessionId,
      maxMemoryMB: 200,
      enableGC: true,
      scraper: async (url) => {
        // Scraper function that will be called for each URL
        const response = await fetchWithEnhancedClient(url);
        const html = await response.text();
        
        // Extract content (will be implemented in Fix 3)
        const extractor = new ContentExtractor();
        return extractor.extract(url, html);
      }
    });
    
    // Process batch or resume existing session
    let result;
    if (resume && sessionId) {
      result = await processor.resume(sessionId, urls);
    } else {
      result = await processor.processBatch(urls);
    }
    
    return {
      statusCode: 200,
      headers: headersForEvent(event, {
        ...baseHeaders,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('[bulk-scrape] Error:', error);

    return {
      statusCode: 500,
      headers: headersForEvent(event, {
        ...baseHeaders,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};