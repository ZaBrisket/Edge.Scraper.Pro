/**
 * Lightweight browser SportsExtractor shim.
 * Provides minimal HTML parsing to keep sports mode functional client-side.
 */
(function() {
  if (window.SportsExtractor) {
    return;
  }

  window.SportsExtractor = class {
    extractContent(html, url) {
      void url; // url is unused in the browser shim but kept for parity
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const text = doc.body && typeof doc.body.innerText === 'string'
        ? doc.body.innerText.trim()
        : '';

      return {
        content: text,
        structuredData: null
      };
    }
  };
})();
