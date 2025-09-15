// netlify/functions/fetch-url.js
const { fetchHtml } = require('../../src/lib/httpClient');
const { extractArticle } = require('../../src/lib/extractArticle');
const { withDomainLimit } = require('../../src/lib/domainLimiter');
const robotsParser = require('robots-parser');

const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY || 'public-2024';
const BYPASS_AUTH = (process.env.BYPASS_AUTH || 'true').toLowerCase() === 'true';
const IGNORE_ROBOTS = (process.env.IGNORE_ROBOTS || 'false').toLowerCase() === 'true';

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Basic auth gate
    const sentKey = event.headers['x-api-key'];
    if (!BYPASS_AUTH && sentKey !== PUBLIC_API_KEY) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const targetUrl = (event.queryStringParameters && event.queryStringParameters.url) || '';
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid url param' }) };
    }

    // robots.txt check (best-effort)
    if (!IGNORE_ROBOTS) {
      try {
        const origin = new URL(targetUrl).origin;
        const robotsUrl = `${origin}/robots.txt`;
        const { body } = await fetchHtml(robotsUrl).catch(() => ({ body: '' }));
        if (body) {
          const robots = robotsParser(robotsUrl, body);
          if (!robots.isAllowed(targetUrl, 'Mozilla/5.0')) {
            return {
              statusCode: 451,
              body: JSON.stringify({ error: 'Disallowed by robots.txt', url: targetUrl })
            };
          }
        }
      } catch (_) { /* ignore robots failures */ }
    }

    const result = await withDomainLimit(targetUrl, async () => {
      const { body: html, finalUrl, status } = await fetchHtml(targetUrl);
      const article = extractArticle(html, finalUrl || targetUrl);
      return { html, article, status, finalUrl: finalUrl || targetUrl };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        ok: true,
        url: targetUrl,
        finalUrl: result.finalUrl,
        status: result.status,
        article: result.article,
        // Keep raw html optional to reduce payloads; front end can opt-in later
        size: result.html.length
      })
    };
  } catch (err) {
    const status = err?.response?.statusCode || 500;
    const retryable = [403, 429, 503, 520, 522, 523, 524].includes(status);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        ok: false,
        error: err.message || 'Fetch failed',
        reasonStatus: status,
        retryable
      })
    };
  }
};