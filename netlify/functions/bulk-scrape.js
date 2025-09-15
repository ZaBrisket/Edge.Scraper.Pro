/**
 * Bulk scraping endpoint with stream processing
 */

const StreamProcessor = require('../../src/lib/stream-processor');
const { fetchWithEnhancedClient } = require('../../src/lib/http/simple-enhanced-client');
const ContentExtractor = require('../../src/lib/content-extractor'); // Will create in Fix 3
const SessionManager = require('../../src/lib/session-manager');

exports.handler = async (event, context) => {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    const { urls, sessionId, resume } = JSON.parse(event.body);
    
    if (!urls || !Array.isArray(urls)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid URLs array' })
      };
    }
    
    // Ensure session directories exist
    const sessionManager = await SessionManager.create();
    
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('[bulk-scrape] Error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};