const { describe, test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDom(html = '<!DOCTYPE html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  const { window } = dom;
  window.alert = () => {};
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = cb => setTimeout(cb, 0);
  }
  window.cancelAnimationFrame = window.cancelAnimationFrame || (id => clearTimeout(id));
  return { window, document: window.document }; // eslint-disable-line node/no-unsupported-features/node-builtins
}

function runScript(window, relativePath) {
  const scriptPath = path.resolve(relativePath);
  const code = fs.readFileSync(scriptPath, 'utf8');
  const context = vm.createContext({
    window,
    document: window.document,
    console,
    setTimeout,
    clearTimeout,
    localStorage: window.localStorage,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    URL: window.URL,
    Blob: window.Blob
  });
  const script = new vm.Script(code);
  script.runInContext(context);
}

describe('Brutalist UI components', () => {
  test('sports shim loads', () => {
    const { window } = createDom();

    runScript(window, 'public/sports-extractor.js');

    assert.strictEqual(typeof window.SportsExtractor, 'function');
    const shim = new window.SportsExtractor();
    const result = shim.extractContent('<html><body><div>Box Score</div></body></html>', 'https://example.com');
    assert.ok(result);
    assert.strictEqual(typeof result.content, 'string');
    assert.strictEqual(result.structuredData, null);
  });

  test('navigation component renders active link with aria-current', () => {
    const { window, document } = createDom('<!DOCTYPE html><html><body><div data-component="navigation" data-active="news"></div></body></html>');

    runScript(window, 'public/components/navigation.js');

    const mount = document.querySelector('[data-component="navigation"]');
    window.EdgeComponents.renderNavigation(mount, 'news');

    const activeLink = document.querySelector('.nav a.active');
    assert(activeLink, 'Active link should be rendered');
    assert.strictEqual(activeLink.textContent, 'News');
    assert.strictEqual(activeLink.getAttribute('aria-current'), 'page');
  });

  test('file uploader enforces size limits and surfaces errors', () => {
    const { window, document } = createDom('<!DOCTYPE html><html><body><div id="dropzone"></div><input id="fileInput" type="file" /></body></html>');
    window.APP_CONFIG = Object.freeze({ MAX_FILE_SIZE: 1024 });

    runScript(window, 'public/components/file-uploader.js');

    const errors = [];
    window.EdgeComponents.showError = (_, message) => errors.push(message);

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    let handled = false;

    window.EdgeComponents.initializeFileUploader({
      dropzone,
      fileInput,
      errorTarget: dropzone,
      onFiles() { handled = true; },
      config: { maxSize: 512 }
    });

    const dropEvent = new window.Event('drop', { bubbles: true, cancelable: true });
    dropEvent.dataTransfer = {
      files: [{ name: 'large.txt', size: 2048, type: 'text/plain' }]
    };

    dropzone.dispatchEvent(dropEvent);

    assert.strictEqual(handled, false, 'Oversized files should not trigger handlers');
    assert(errors.length > 0, 'Error message should be captured');
    assert(errors[0].includes('exceeds'), 'Error should mention size limit');
  });

  test('error handler toggles visibility and focus state', () => {
    const { window, document } = createDom('<!DOCTYPE html><html><body><div id="err"></div></body></html>');

    runScript(window, 'public/components/error-handler.js');

    const container = document.getElementById('err');
    window.EdgeComponents.mountErrorHandler(container);
    window.EdgeComponents.showError(container, 'Failure');

    assert.strictEqual(container.hidden, false);
    assert.strictEqual(container.textContent, 'Failure');

    window.EdgeComponents.clearError(container);
    assert.strictEqual(container.hidden, true);
    assert.strictEqual(container.textContent, '');
  });

  test('bulk scraper export produces jsonl payload', async () => {
    const html = `<!DOCTYPE html><html><body>
      <div id="dropzone"></div>
      <input id="fileInput" type="file" />
      <textarea id="urlInput"></textarea>
      <button id="startButton"></button>
      <div id="progress"></div>
      <div id="spinner"></div>
      <div id="results" class="results"><table id="resultsTable"><tbody id="resultsBody"></tbody></table></div>
      <div id="resultsOutput"></div>
      <button id="exportButton"></button>
      <div id="progressCount"></div>
      <div id="progressTotal"></div>
      <div id="elapsed"></div>
      <div id="remaining"></div>
      <div id="statSuccess"></div>
      <div id="statFailed"></div>
      <div id="statTime"></div>
      <input type="radio" name="format" value="jsonl" checked />
      <input type="radio" name="format" value="csv" />
    </body></html>`;

    const { window, document } = createDom(html);
    window.APP_CONFIG = Object.freeze({
      MAX_FILE_SIZE: 10 * 1024 * 1024,
      MAX_URLS: 1500,
      CONCURRENT_REQUESTS: 3,
      API_TIMEOUT: 30000,
      SPORTS_MODE_DEFAULT: false
    });
    window.EdgeScraper = {
      scrapeOne: async () => ({ ok: true, article: {}, url: 'https://example.com' })
    };
    window.EdgeComponents = {
      initializeFileUploader: () => ({ destroy() {} }),
      showError: () => {},
      clearError: () => {}
    };

    runScript(window, 'public/assets/js/bulk-scraper.js');

    const blobs = [];
    window.URL.createObjectURL = blob => {
      blobs.push(blob);
      return 'blob://test';
    };
    window.URL.revokeObjectURL = () => {};

    window.__BulkScraperTestHooks.setResults([
      {
        url: 'https://example.com',
        status: 'success',
        data: { title: 'Example Article', content: 'Body text', images: [] },
        size: 42,
        time: 3
      }
    ]);

    window.__BulkScraperTestHooks.exportResults();

    assert(blobs.length > 0, 'Export should generate a blob');
    const payload = await blobs[0].text();
    assert(payload.includes('Example Article'));
    const anchor = document.querySelector('a');
    assert(anchor, 'Download anchor should be created');
    assert(anchor.download.endsWith('.jsonl'));
  });

  test('bulk runner uses retry inputs', async () => {
    const html = `<!DOCTYPE html><html><body data-mode="general">
      <div id="globalError"></div>
      <div id="dropzone"></div>
      <input id="fileInput" type="file" />
      <textarea id="urlInput"></textarea>
      <button id="startButton"></button>
      <div id="progress"></div>
      <div id="spinner"></div>
      <div id="results" class="results"><table id="resultsTable"><tbody id="resultsBody"></tbody></table></div>
      <div id="resultsOutput"></div>
      <button id="exportButton"></button>
      <div id="progressCount"></div>
      <div id="progressTotal"></div>
      <div id="elapsed"></div>
      <div id="remaining"></div>
      <div id="statSuccess"></div>
      <div id="statFailed"></div>
      <div id="statTime"></div>
      <input type="radio" name="format" value="jsonl" checked />
      <input type="radio" name="format" value="csv" />
      <input type="checkbox" id="extractImages" />
      <input type="checkbox" id="extractMeta" />
      <input type="checkbox" id="sportsMode" />
      <input type="number" id="concurrency" value="1" />
      <input type="number" id="timeout" value="20" />
      <input type="number" id="retries" value="2" />
      <input type="number" id="delay" value="0" />
    </body></html>`;

    const { window } = createDom(html);
    window.APP_CONFIG = Object.freeze({
      MAX_FILE_SIZE: 10 * 1024 * 1024,
      MAX_URLS: 1500,
      CONCURRENT_REQUESTS: 3,
      API_TIMEOUT: 30000,
      SPORTS_MODE_DEFAULT: false
    });

    let callCount = 0;
    window.EdgeScraper = {
      async scrapeOne(url, options) {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('temporary failure');
        }
        assert.strictEqual(options.timeout, 20000);
        return { ok: true, article: {}, url };
      }
    };
    window.EdgeComponents = {
      initializeFileUploader: () => ({ destroy() {} }),
      showError: () => {},
      clearError: () => {}
    };

    runScript(window, 'public/assets/js/bulk-scraper.js');

    const result = await window.__BulkScraperTestHooks.scrapeUrl('https://example.com/');

    assert.strictEqual(callCount, 2, 'Retries input should trigger additional attempts');
    assert.strictEqual(result.status, 'success');
  });
});
