const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

function extractArticle(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;

  return {
    title: article.title || null,
    byline: article.byline || null,
    length: article.length || null,
    excerpt: article.excerpt || null,
    content: article.textContent || null,
    siteName: dom.window.document.querySelector('meta[property="og:site_name"]')?.content || null,
    published: dom.window.document.querySelector('meta[property="article:published_time"]')?.content
      || dom.window.document.querySelector('time')?.getAttribute('datetime')
      || null
  };
}

module.exports = { extractArticle };

