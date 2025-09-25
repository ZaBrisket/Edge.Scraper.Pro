/**
 * Bulk scraping endpoint with stream processing
 */

const StreamProcessor = require('../../src/lib/stream-processor');
const { fetchWithEnhancedClient } = require('../../src/lib/http/simple-enhanced-client');
const { preflight } = require('./_lib/cors');
const { jsonForEvent } = require('./_lib/http');

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
  const baseHeaders = {};
  const preflightResponse = preflight(event, baseHeaders);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (event.httpMethod !== 'POST') {
    return jsonForEvent(event, { error: 'Method not allowed' }, 405, baseHeaders);
  }

  try {
    const { urls, sessionId, resume } = JSON.parse(event.body || '{}');

    if (!urls || !Array.isArray(urls)) {
      return jsonForEvent(event, { error: 'Invalid URLs array' }, 400, baseHeaders);
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
    
    return jsonForEvent(event, result, 200, baseHeaders);

  } catch (error) {
    console.error('[bulk-scrape] Error:', error);

    return jsonForEvent(
      event,
      {
        error: 'Internal server error',
        message: error.message,
      },
      500,
      baseHeaders,
    );
  }
};