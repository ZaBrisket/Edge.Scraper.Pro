/**
 * Netlify Function: get-schema
 * Calls Gemini to infer a stable CSS selector for sub-page links and the "Next" button text.
 * Requires env var GEMINI_API_KEY.
 */
const MODEL = 'gemini-1.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const parser = require('postcss-selector-parser');
const cheerio = require('cheerio');
const { fetchWithPolicy } = require('../../src/lib/http/client');
const { getCorrelationId } = require('../../src/lib/http/correlation');
const log = (...args) => console.log(new Date().toISOString(), ...args);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  const correlationId = getCorrelationId(event);
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: { ...CORS_HEADERS, 'x-correlation-id': correlationId } };
    }
    if (event.httpMethod !== 'POST') {
      return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, correlationId);
    }

  try {
    const key = process.env.GEMINI_API_KEY;
      if (!key) return json(500, { error: { code: 'NO_API_KEY', message: 'GEMINI_API_KEY is not configured on the server' } }, correlationId);

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

    const { mainPageHtml = '', mainPageB64, subPageB64, nextButtonB64 } = body;
      if (!mainPageHtml || !mainPageB64 || !subPageB64 || !nextButtonB64) {
        return json(400, { error: { code: 'BAD_REQUEST', message: 'Missing required payload: mainPageHtml, mainPageB64, subPageB64, nextButtonB64' } }, correlationId);
      }

    const $ = cheerio.load(mainPageHtml);
    const totalLinks = $('a').length;

    const prompt = buildPrompt();
    const htmlSnippet = mainPageHtml.slice(0, 200000); // keep request bounded

    const requestBody = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { text: 'MAIN PAGE HTML (truncated if long):\n' + htmlSnippet },
          { text: '\nMAIN PAGE SCREENSHOT:' },
          { inlineData: { mimeType: mainPageB64.mimeType || 'image/png', data: mainPageB64.data } },
          { text: '\nTYPICAL SUB-PAGE SCREENSHOT:' },
          { inlineData: { mimeType: subPageB64.mimeType || 'image/png', data: subPageB64.data } },
          { text: '\nNEXT BUTTON SCREENSHOT:' },
          { inlineData: { mimeType: nextButtonB64.mimeType || 'image/png', data: nextButtonB64.data } }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9
      }
    };

      const res = await fetchWithPolicy(API_URL + `?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        correlationId,
      });
      const resText = await res.text();
      log(`[${correlationId}] upstream [${res.status}] ${API_URL}:`, resText.substring(0, 200));
      if (!res.ok) {
        return json(res.status, { error: { code: 'UPSTREAM_ERROR', message: `Gemini error: ${res.status}`, detail: resText.slice(0, 500) } }, correlationId);
      }

      const data = JSON.parse(resText);
    const text = extractText(data);

    const parsed = safeParseJson(text) || {};
    let candidates = [];
    let nextButtonText = String(parsed.nextButtonText || 'next').trim();

    const trySelector = sel => {
      try {
        parser().astSync(sel);
      } catch {
        return;
      }
      if (isTooGeneric($, sel)) return;
      candidates.push(buildCandidate($, sel, totalLinks));
    };

    if (parsed.linkSelector) {
      const sel = String(parsed.linkSelector).trim();
      trySelector(sel);
    }

    if (!candidates.length) {
      const fallbacks = analyzeFallback($);
      if (!fallbacks.length) fallbacks.push('main a[href*="/"]:not([rel="prev"]):not([rel="nofollow"])');
      fallbacks.forEach(trySelector);
    }

      candidates.sort((a, b) => b.specificity - a.specificity);
      return json(200, { linkSelector: candidates[0]?.selector || '', nextButtonText }, correlationId);
    } catch (err) {
      const code = err.code || 'INTERNAL';
      const message = err.message || 'Unknown error';
      return json(500, { error: { code, message } }, correlationId);
    }
  };

  function json(statusCode, obj, correlationId) {
    const payload = Object.prototype.hasOwnProperty.call(obj, 'error')
      ? { ok: false, error: typeof obj.error === 'string' ? { message: obj.error } : obj.error }
      : { ok: true, data: obj };
    return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, 'x-correlation-id': correlationId }, body: JSON.stringify(payload) };
  }

function buildPrompt() {
  return [
    'You are an expert content-extraction engineer.',
    'Given:',
    '  • The HTML of a main listing/index page.',
    '  • A screenshot of that main page.',
    '  • A screenshot of a typical sub-page/detail page.',
    '  • A screenshot of the site\'s pagination NEXT button.',
    '',
    'Task: Infer a robust CSS selector that selects ONLY the link elements on the main page that lead to the sub-pages (detail pages), not navigation, ads, or unrelated links.',
    'Also infer the human-visible text that the site uses for its "Next page" control (e.g., "Next", "Older posts", "›").',
    '',
    'Output ONLY a compact JSON object with this schema (no backticks, no prose):',
    '{ "linkSelector": "<CSS selector>", "nextButtonText": "<text seen on the Next control>" }',
    '',
    'Selector guidelines:',
    '  • Prefer semantic containers (e.g., article .entry-title a) over brittle random classes.',
    '  • The selector must match elements on the supplied main page HTML.',
    '  • If multiple good selectors exist, choose the most specific that matches only the actual content links.',
    '  • Do not return XPath. CSS only.',
    '',
    'Text guidelines:',
    '  • Provide the literal string users click to go to the next page if present. If unknown, return "Next".'
  ].join('\\n');
}

function extractText(apiResponse) {
  try {
    const c = apiResponse.candidates && apiResponse.candidates[0];
    if (!c) return '';
    const parts = c.content && c.content.parts;
    if (Array.isArray(parts)) {
      return parts.map(p => p.text || '').join('\\n');
    }
    // Some responses return a single text block
    return (c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text) || '';
  } catch {
    return '';
  }
}

function safeParseJson(text) {
  if (!text) return null;
  // Try whole text
  try { return JSON.parse(text); } catch {}
  // Try to extract the first {...} block
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

function getSpecificity(selector) {
  try {
    const ast = parser().astSync(selector);
    let max = 0;
    ast.each(sel => {
      let a = 0, b = 0, c = 0;
      sel.walk(node => {
        if (node.type === 'id') a++;
        else if (node.type === 'class' || node.type === 'attribute' || (node.type === 'pseudo' && !node.value.startsWith('::'))) b++;
        else if (node.type === 'tag' || (node.type === 'pseudo' && node.value.startsWith('::'))) c++;
      });
      const spec = a * 100 + b * 10 + c;
      if (spec > max) max = spec;
    });
    return max;
  } catch {
    return 0;
  }
}

function isTooGeneric($, selector) {
  const total = $('a').length;
  const matches = $(selector).length;
  return !matches || (total && matches / total > 0.5);
}

function buildCandidate($, selector, totalLinks) {
  const matches = $(selector).length;
  const ratio = totalLinks ? matches / totalLinks : 1;
  const confidence = Math.max(0, Math.min(100, Math.round((1 - ratio) * 100)));
  return { selector, specificity: getSpecificity(selector), confidence };
}

function analyzeFallback($) {
  const selectors = new Set();
  if ($('article a').length) selectors.add('article a');
  ['post', 'entry', 'item'].forEach(key => {
    $(`[class*="${key}"]`).each((_, el) => {
      const classNames = ($(el).attr('class') || '').split(/\s+/);
      const cls = classNames.find(c => c.toLowerCase().includes(key));
      if (cls) selectors.add(`.${cls} a`);
    });
  });
  return Array.from(selectors);
}

// Export utility functions for testing
exports.extractText = extractText;
exports.safeParseJson = safeParseJson;
exports.getSpecificity = getSpecificity;
exports.isTooGeneric = isTooGeneric;
exports.analyzeFallback = analyzeFallback;
