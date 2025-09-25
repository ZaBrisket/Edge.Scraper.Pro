/**
 * Bulk scraping endpoint with stream processing
 */

const StreamProcessor = require('../../src/lib/stream-processor');
const { fetchWithEnhancedClient } = require('../../src/lib/http/simple-enhanced-client');
const { headersForEvent, preflight } = require('./_lib/cors');

let CachedExtractor;

function loadContentExtractor() {
  if (CachedExtractor) {
    return CachedExtractor;
  }
  try {
    CachedExtractor = require('../../src/lib/content-extractor');
  } catch (err) {
    console.warn('bulk-scrape: falling back to basic content extractor', err);
    CachedExtractor = class BasicContentExtractor {
      extract(url, html) {
        const text = String(html || '')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return {
          url,
          title: titleMatch ? titleMatch[1].trim() : null,
          content: text,
        };
      }
    };
  }
  return CachedExtractor;
}

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
    const { urls, sessionId, resume } = JSON.parse(event.body || '{}');
    
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
        
        const Extractor = loadContentExtractor();
        const extractor = new Extractor();
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