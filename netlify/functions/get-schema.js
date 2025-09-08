/**
 * Netlify Function: get-schema
 * Calls Gemini to infer a stable CSS selector for sub-page links and the "Next" button text.
 * Requires env var GEMINI_API_KEY.
 */
const MODEL = 'gemini-1.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return json(500, { error: 'GEMINI_API_KEY is not configured on the server' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

    const { mainPageHtml = '', mainPageB64, subPageB64, nextButtonB64 } = body;
    if (!mainPageHtml || !mainPageB64 || !subPageB64 || !nextButtonB64) {
      return json(400, { error: 'Missing required payload: mainPageHtml, mainPageB64, subPageB64, nextButtonB64' });
    }

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

    const res = await fetch(API_URL + `?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return json(res.status, { error: `Gemini error: ${res.status}`, detail: errText.slice(0, 500) });
    }

    const data = await res.json();
    const text = extractText(data);

    const parsed = safeParseJson(text);
    if (parsed && parsed.linkSelector) {
      // Normalize selector a little
      parsed.linkSelector = String(parsed.linkSelector).trim();
      parsed.nextButtonText = String(parsed.nextButtonText || '').trim();
      return json(200, parsed);
    }

    // Fallback heuristic if model returns something unexpected
    const fallback = { linkSelector: 'main a[href*="/"]:not([rel="prev"]):not([rel="nofollow"])', nextButtonText: 'next' };
    return json(200, fallback);
  } catch (err) {
    return json(500, { error: err.message || 'Unknown error' });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }, body: JSON.stringify(obj) };
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

// Export utility functions for testing
exports.extractText = extractText;
exports.safeParseJson = safeParseJson;
