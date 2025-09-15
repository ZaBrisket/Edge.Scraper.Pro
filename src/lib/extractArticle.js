// src/lib/extractArticle.js
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const sanitizeHtml = require('sanitize-html');

function extractWithReadability(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;

  return {
    title: article.title || null,
    byline: article.byline || null,
    contentHtml: sanitizeHtml(article.content || '', {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption']),
      allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt', 'title'],
        '*': ['class', 'id']
      },
      nonTextTags: ['style', 'script', 'textarea', 'noscript']
    }),
    text: article.textContent || null,
    length: (article.textContent || '').length
  };
}

function fallbackExtract(html, baseUrl) {
  // Very light heuristic fallback for WordPress-like sites (InsuranceJournal is WP-based).
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;

  // Try common containers
  const candidates = [
    'article',
    '.entry-content',
    '.post-content',
    '.post__content',
    '.story-content',
    '#content .post',
    'div[itemprop="articleBody"]'
  ];

  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    if (el && el.textContent && el.textContent.trim().length > 400) {
      return {
        title: (doc.querySelector('h1') && doc.querySelector('h1').textContent.trim()) || null,
        byline: (doc.querySelector('.byline, .author, [itemprop="author"]') &&
          doc.querySelector('.byline, .author, [itemprop="author"]').textContent.trim()) || null,
        contentHtml: sanitizeHtml(el.innerHTML),
        text: el.textContent.trim(),
        length: el.textContent.trim().length
      };
    }
  }
  return null;
}

function extractArticle(html, baseUrl) {
  const primary = extractWithReadability(html, baseUrl);
  if (primary && primary.length >= 400) return { method: 'readability', ...primary };
  const fb = fallbackExtract(html, baseUrl);
  if (fb) return { method: 'fallback', ...fb };
  return { method: 'none', title: null, byline: null, contentHtml: null, text: null, length: 0 };
}

module.exports = { extractArticle };