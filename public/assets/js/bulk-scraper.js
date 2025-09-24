(function() {
  'use strict';

  const APP_CONFIG = window.APP_CONFIG || {
    MAX_FILE_SIZE: 5 * 1024 * 1024,
    MAX_URLS: 1000,
    CONCURRENT_REQUESTS: 3,
    API_TIMEOUT: 30000,
    SPORTS_MODE_DEFAULT: false
  };

  const components = window.EdgeComponents || {};
  const STORAGE_KEY = 'edge-scraper:lastResults';
  const errorBanner = document.getElementById('globalError');
  const dependencyState = {
    requireSports: false,
    pendingSports: false,
    lastMissing: []
  };

  function showError(message) {
    if (!message) {
      return;
    }
    if (components.showError && errorBanner) {
      components.showError(errorBanner, message);
    } else {
      alert(message);
    }
  }

  function clearError() {
    if (components.clearError && errorBanner) {
      components.clearError(errorBanner);
    }
  }

  function validateDependencies() {
    const missing = [];
    if (!window.EdgeScraper) {
      missing.push('EdgeScraper');
    }
    if (dependencyState.requireSports && !window.SportsExtractor) {
      missing.push('SportsExtractor');
    }

    dependencyState.lastMissing = missing.slice();

    if (missing.length === 0) {
      clearError();
      return;
    }

    if (
      missing.length === 1 &&
      missing[0] === 'SportsExtractor' &&
      dependencyState.pendingSports
    ) {
      return;
    }

    const message = `Missing dependencies: ${missing.join(', ')}`;
    showError(message);
    throw new Error(message);
  }

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const urlInput = document.getElementById('urlInput');
  const startButton = document.getElementById('startButton');

  if (!dropzone || !fileInput || !urlInput || !startButton) {
    return;
  }

  const dataset = document.body.dataset || {};
  const defaultMode = dataset.mode || 'general';
  const forceSports = dataset.forceSports === 'true' || !!APP_CONFIG.SPORTS_MODE_DEFAULT;
  dependencyState.requireSports = forceSports;
  if (forceSports) {
    dependencyState.pendingSports = true;
  }

  const SPORTS_EXTRACTOR_SRC = '/sports-extractor.js';
  let sportsExtractorPromise = null;

  function hasEdgeScraper() {
    return Boolean(window.EdgeScraper && typeof window.EdgeScraper.scrapeOne === 'function');
  }

  function loadSportsExtractorScript() {
    if (window.SportsExtractor) {
      dependencyState.pendingSports = false;
      if (
        dependencyState.lastMissing.length === 1 &&
        dependencyState.lastMissing[0] === 'SportsExtractor'
      ) {
        clearError();
      }
      return Promise.resolve();
    }

    if (sportsExtractorPromise) {
      return sportsExtractorPromise;
    }

    sportsExtractorPromise = new Promise((resolve, reject) => {
      let script = Array.from(document.scripts).find(s => s.src && s.src.includes(SPORTS_EXTRACTOR_SRC));
      let shouldAppend = false;

      if (!script) {
        script = document.createElement('script');
        script.src = SPORTS_EXTRACTOR_SRC;
        script.async = true;
        script.dataset.dynamic = 'sports-extractor';
        shouldAppend = true;
      } else if (script.dataset.loaded === 'true') {
        resolve();
        return;
      }

      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        dependencyState.pendingSports = false;
        if (
          dependencyState.lastMissing.length === 1 &&
          dependencyState.lastMissing[0] === 'SportsExtractor'
        ) {
          clearError();
        }
        resolve();
      }, { once: true });

      script.addEventListener('error', () => {
        dependencyState.pendingSports = false;
        reject(new Error('Failed to load sports extractor'));
      }, { once: true });

      if (shouldAppend) {
        document.head.appendChild(script);
      }
    });

    return sportsExtractorPromise;
  }

  async function ensureSportsExtractor() {
    if (window.SportsExtractor) {
      dependencyState.pendingSports = false;
      if (
        dependencyState.lastMissing.length === 1 &&
        dependencyState.lastMissing[0] === 'SportsExtractor'
      ) {
        clearError();
      }
      return;
    }

    dependencyState.pendingSports = true;
    await loadSportsExtractorScript();
  }

  const elements = {
    dropzone,
    fileInput,
    urlInput,
    startButton,
    selectFilesBtn: document.getElementById('selectFilesBtn'),
    progress: document.getElementById('progress'),
    progressCount: document.getElementById('progressCount'),
    progressTotal: document.getElementById('progressTotal'),
    elapsed: document.getElementById('elapsed'),
    remaining: document.getElementById('remaining'),
    results: document.getElementById('results'),
    resultsBody: document.getElementById('resultsBody'),
    resultsOutput: document.getElementById('resultsOutput'),
    spinner: document.getElementById('spinner'),
    exportButton: document.getElementById('exportButton'),
    statSuccess: document.getElementById('statSuccess'),
    statFailed: document.getElementById('statFailed'),
    statTime: document.getElementById('statTime'),
    extractContent: document.getElementById('extractContent'),
    extractImages: document.getElementById('extractImages'),
    extractMeta: document.getElementById('extractMeta'),
    sportsMode: document.getElementById('sportsMode'),
    concurrency: document.getElementById('concurrency'),
    timeout: document.getElementById('timeout'),
    retries: document.getElementById('retries'),
    delay: document.getElementById('delay')
  };

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (forceSports) {
        await ensureSportsExtractor();
      }
    } catch (error) {
      console.error(error);
      dependencyState.requireSports = false;
      dependencyState.pendingSports = false;
      if (elements.sportsMode) {
        elements.sportsMode.checked = false;
        elements.sportsMode.removeAttribute('disabled');
      }
      showError('Sports extractor failed to load. Sports mode has been disabled.');
    }
    try {
      validateDependencies();
    } catch {
      // swallow; banner already shown via showError
    }
  }, { once: true });

  const state = {
    urls: [],
    results: [],
    isProcessing: false,
    startTime: null,
    processedCount: 0,
    currentMode: defaultMode
  };

  if (elements.sportsMode) {
    if (forceSports) {
      elements.sportsMode.checked = true;
      elements.sportsMode.setAttribute('disabled', 'disabled');
    }

    elements.sportsMode.addEventListener('change', event => {
      if (!event.target.checked) {
        dependencyState.requireSports = forceSports;
        return;
      }

      dependencyState.requireSports = true;
      dependencyState.pendingSports = true;
      try {
        validateDependencies();
      } catch (validationError) {
        console.error('Sports extractor dependency missing', validationError);
      }

      ensureSportsExtractor().catch(error => {
        console.error('Sports extractor failed to load', error);
        showError('Sports extractor failed to load. Sports mode has been disabled.');
        event.target.checked = false;
        dependencyState.requireSports = forceSports;
        dependencyState.pendingSports = false;
      });
    });
  }

  if (components.initializeFileUploader) {
    components.initializeFileUploader({
      dropzone,
      fileInput,
      selectButton: elements.selectFilesBtn,
      errorTarget: errorBanner,
      config: {
        maxSize: APP_CONFIG.MAX_FILE_SIZE,
        accept: ['.txt', '.json']
      },
      onFiles(files) {
        handleFiles(files);
      }
    });
  } else {
    dropzone.addEventListener('drop', event => {
      event.preventDefault();
      handleFiles(event.dataTransfer.files);
    });
    fileInput.addEventListener('change', event => {
      handleFiles(event.target.files);
    });
  }

  function handleFiles(files) {
    [...files].forEach(file => {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        readTextFile(file);
      } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
        readJsonFile(file);
      } else {
        const message = `Unsupported file type: ${file.type || 'unknown'} (${file.name})`;
        console.warn(message);
        showError(message);
      }
    });
  }

  function readTextFile(file) {
    const reader = new FileReader();
    reader.onload = event => {
      const urls = event.target.result
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .join('\n');
      urlInput.value = urls;
      clearError();
    };
    reader.onerror = () => {
      showError('Error reading file: ' + file.name);
    };
    reader.readAsText(file);
  }

  function readJsonFile(file) {
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const data = JSON.parse(event.target.result);
        const urls = Array.isArray(data) ? data : (data.urls || []);
        urlInput.value = urls.join('\n');
        clearError();
      } catch (error) {
        console.error('Invalid JSON file:', error);
        showError('Invalid JSON file format: ' + error.message);
      }
    };
    reader.onerror = () => {
      showError('Error reading file: ' + file.name);
    };
    reader.readAsText(file);
  }

  function sanitizeUrl(raw) {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
      const direct = new URL(trimmed);
      if (!/^https?:$/.test(direct.protocol)) {
        return null;
      }
      direct.hash = '';
      return direct.toString();
    } catch {
      try {
        const withProtocol = new URL(`https://${trimmed}`);
        if (!/^https?:$/.test(withProtocol.protocol)) {
          return null;
        }
        withProtocol.hash = '';
        return withProtocol.toString();
      } catch {
        return null;
      }
    }
  }

  function parseUrls() {
    const text = urlInput.value;
    const urls = [];
    const rejected = [];

    text.split('\n').forEach(line => {
      if (!line || line.startsWith('#')) {
        return;
      }
      const sanitized = sanitizeUrl(line);
      if (sanitized) {
        urls.push(sanitized);
      } else {
        rejected.push(line.trim());
      }
    });

    const unique = Array.from(new Set(urls));
    if (unique.length > APP_CONFIG.MAX_URLS) {
      showError(`Trimming URL list to ${APP_CONFIG.MAX_URLS} entries to respect rate limits.`);
    }
    const limited = unique.slice(0, APP_CONFIG.MAX_URLS);

    if (rejected.length) {
      console.warn('Rejected invalid URLs:', rejected);
    }

    return limited;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatTime(seconds) {
    if (seconds < 60) return seconds + 's';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }

  async function scrapeWithRetries(url, attempts, timeoutMs) {
    let lastErr;
    const totalAttempts = Math.max(1, Number.isFinite(attempts) ? attempts : 0);
    for (let i = 0; i < Math.max(1, totalAttempts); i += 1) {
      try {
        return await window.EdgeScraper.scrapeOne(url, {
          raw: needRaw(url),
          parse: 'article',
          timeout: timeoutMs
        });
      } catch (error) {
        lastErr = error;
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));
      }
    }
    throw lastErr;
  }

  function needRaw(url) {
    void url;
    return (
      (elements.extractImages && elements.extractImages.checked) ||
      (elements.extractMeta && elements.extractMeta.checked) ||
      (elements.sportsMode && elements.sportsMode.checked)
    ) ? 1 : 0;
  }

  function updateProgress() {
    if (!state.isProcessing) {
      return;
    }

    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);

    if (elements.remaining) {
      if (elapsed > 0 && state.processedCount > 0) {
        const rate = state.processedCount / elapsed;
        const remaining = Math.floor((state.urls.length - state.processedCount) / rate);
        elements.remaining.textContent = formatTime(remaining);
      } else {
        elements.remaining.textContent = 'calculating...';
      }
    }

    if (elements.elapsed) {
      elements.elapsed.textContent = formatTime(elapsed);
    }
    if (elements.progressCount) {
      elements.progressCount.textContent = state.processedCount;
    }
    if (elements.progressTotal) {
      elements.progressTotal.textContent = state.urls.length;
    }

    if (state.isProcessing) {
      requestAnimationFrame(updateProgress);
    }
  }

  async function scrapeUrl(url) {
    const extractImages = elements.extractImages ? elements.extractImages.checked : false;
    const extractMeta = elements.extractMeta ? elements.extractMeta.checked : false;
    const sportsMode = elements.sportsMode ? elements.sportsMode.checked : false;
    const startTime = Date.now();

    try {
      if (!hasEdgeScraper()) {
        throw new Error('EdgeScraper client is not available');
      }

      const timeoutSeconds = elements.timeout ? parseInt(elements.timeout.value, 10) : NaN;
      const retriesInput = elements.retries ? parseInt(elements.retries.value, 10) : 0;
      const safeTimeout = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
        ? timeoutSeconds
        : Math.floor(APP_CONFIG.API_TIMEOUT / 1000);
      const timeoutMs = safeTimeout * 1000;
      const attempts = Number.isFinite(retriesInput) && retriesInput >= 0 ? retriesInput : 0;

      const result = await scrapeWithRetries(url, attempts, timeoutMs);
      const endTime = Date.now();
      const duration = Math.floor((endTime - startTime) / 1000);

      let processedData = null;
      let error = null;

      if (result.ok) {
        const article = result.article || {};
        let title = article.title || '';
        let content = article.content || '';
        let images = [];
        let meta = {};
        let structuredData = null;

        if (needRaw(url) && result.html) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(result.html, 'text/html');

          if (extractImages) {
            images = Array.from(doc.querySelectorAll('img')).map(img => img.src);
          }

          if (extractMeta) {
            meta = Array.from(doc.querySelectorAll('meta')).reduce((acc, tag) => {
              const name = tag.getAttribute('name') || tag.getAttribute('property');
              const value = tag.getAttribute('content');
              if (name && value) acc[name] = value;
              return acc;
            }, {});
          }

          if (sportsMode) {
            try {
              await ensureSportsExtractor();
            } catch (loadError) {
              console.error('Sports extractor unavailable for URL', url, loadError);
            }

            if (window.SportsExtractor) {
              const extractor = new SportsExtractor();
              const output = extractor.extractContent(result.html, url);
              if (output?.content) content = output.content;
              structuredData = output?.structuredData || null;
            }
          }
        }

        processedData = {
          url: result.url || url,
          title,
          content,
          contentLength: content.length,
          images,
          meta,
          structuredData,
          html: needRaw(url) ? (result.html || null) : null,
          strategy: result.strategy || null,
          ms: result.ms || (endTime - startTime),
          durationSecs: duration
        };
      } else {
        error = result.error || 'Failed to fetch URL';
      }

      return {
        url,
        status: result.ok ? 'success' : 'failed',
        data: processedData,
        size: processedData ? JSON.stringify(processedData).length : 0,
        time: duration,
        error
      };
    } catch (error) {
      return {
        url,
        status: 'failed',
        data: null,
        size: 0,
        time: Math.floor((Date.now() - startTime) / 1000),
        error: error.message
      };
    }
  }

  async function processUrls() {
    const requestedConcurrency = elements.concurrency ? parseInt(elements.concurrency.value, 10) || APP_CONFIG.CONCURRENT_REQUESTS : APP_CONFIG.CONCURRENT_REQUESTS;
    const concurrency = Math.max(1, Math.min(requestedConcurrency, APP_CONFIG.CONCURRENT_REQUESTS));
    if (elements.concurrency && requestedConcurrency !== concurrency) {
      showError(`Concurrency capped at ${APP_CONFIG.CONCURRENT_REQUESTS} to respect rate limits.`);
      elements.concurrency.value = concurrency;
    }

    const delay = Math.max(0, elements.delay ? parseInt(elements.delay.value, 10) || 0 : 0);

    state.processedCount = 0;
    state.results = [];

    for (let i = 0; i < state.urls.length; i += concurrency) {
      const batch = state.urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(scrapeUrl));
      state.results.push(...batchResults);
      state.processedCount += batch.length;

      updateResults(batchResults);

      if (i + concurrency < state.urls.length && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  function updateResults(newResults) {
    if (elements.resultsBody) {
      newResults.forEach(result => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${result.url}</td>
          <td>${result.status}</td>
          <td>${formatBytes(result.size)}</td>
          <td>${result.time}s</td>
        `;
        elements.resultsBody.appendChild(row);
      });
    }

    const successCount = state.results.filter(r => r.status === 'success').length;
    const failedCount = state.results.filter(r => r.status === 'failed').length;
    const totalTime = Math.floor((Date.now() - state.startTime) / 1000);

    if (elements.statSuccess) {
      elements.statSuccess.textContent = successCount;
    }
    if (elements.statFailed) {
      elements.statFailed.textContent = failedCount;
    }
    if (elements.statTime) {
      elements.statTime.textContent = formatTime(totalTime);
    }
  }

  function exportResults() {
    const formatInput = document.querySelector('input[name="format"]:checked');
    if (!formatInput) {
      return;
    }

    const format = formatInput.value;
    let content = '';
    let filename = 'scrape-results';
    let mimeType = 'text/plain';

    switch (format) {
      case 'jsonl':
        content = state.results
          .filter(r => r.status === 'success')
          .map(r => JSON.stringify(r.data))
          .join('\n');
        filename += '.jsonl';
        mimeType = 'application/x-ndjson';
        break;
      case 'csv':
        content = 'URL,Title,Content Length,Images,Status\n';
        state.results.forEach(r => {
          if (r.status === 'success' && r.data) {
            const title = r.data.title ? r.data.title.replace(/"/g, '""') : '';
            content += `"${r.url}","${title}",${r.data.content?.length || 0},${r.data.images?.length || 0},"${r.status}"\n`;
          }
        });
        filename += '.csv';
        mimeType = 'text/csv';
        break;
      case 'txt':
        content = state.results
          .filter(r => r.status === 'success' && r.data?.content)
          .map(r => `URL: ${r.url}\n\n${r.data.content}\n\n${'='.repeat(80)}\n`)
          .join('\n');
        filename += '.txt';
        break;
      case 'structured':
        content = JSON.stringify(state.results.filter(r => r.status === 'success'), null, 2);
        filename += '.json';
        mimeType = 'application/json';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function restoreCachedResults() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (!cached) {
        return;
      }
      const parsed = JSON.parse(cached);
      if (!Array.isArray(parsed.results) || parsed.results.length === 0) {
        return;
      }
      state.results = parsed.results;
      if (elements.resultsBody) {
        elements.resultsBody.innerHTML = '';
      }
      updateResults(state.results);
      if (elements.results) {
        elements.results.classList.add('active');
      }
    } catch (error) {
      console.warn('Failed to restore cached results', error);
    }
  }

  async function startScraping() {
    state.urls = parseUrls();

    if (state.urls.length === 0) {
      showError('Please enter at least one valid URL.');
      return;
    }

    if (!hasEdgeScraper()) {
      showError('The EdgeScraper client failed to load. Please refresh the page and try again.');
      return;
    }

    const wantsSportsExtractor = forceSports || (elements.sportsMode && elements.sportsMode.checked);

    if (wantsSportsExtractor) {
      try {
        await ensureSportsExtractor();
      } catch (error) {
        console.error('Sports extractor failed to initialize', error);
        showError('Sports extractor failed to load. Disable sports mode or refresh the page.');
        dependencyState.pendingSports = false;
        dependencyState.requireSports = forceSports;
        if (elements.sportsMode && forceSports) {
          elements.sportsMode.removeAttribute('disabled');
          elements.sportsMode.checked = false;
        }
        return;
      }
    }

    state.isProcessing = true;
    state.startTime = Date.now();

    clearError();
    startButton.disabled = true;
    if (elements.progress) {
      elements.progress.classList.add('active');
    }
    if (elements.spinner) {
      elements.spinner.classList.add('active');
    }
    if (elements.results) {
      elements.results.classList.remove('active');
    }
    if (elements.resultsBody) {
      elements.resultsBody.innerHTML = '';
    }
    if (elements.resultsOutput) {
      elements.resultsOutput.textContent = '';
    }

    updateProgress();

    try {
      await processUrls();
    } catch (error) {
      console.error('Unexpected error during processing', error);
      showError('Unexpected error during processing: ' + error.message);
    }

    state.isProcessing = false;
    startButton.disabled = false;

    if (elements.progress) {
      elements.progress.classList.remove('active');
    }
    if (elements.spinner) {
      elements.spinner.classList.remove('active');
    }
    if (elements.results) {
      elements.results.classList.add('active');
    }

    const successResults = state.results.filter(r => r.status === 'success');
    if (successResults.length > 0 && elements.resultsOutput) {
      elements.resultsOutput.textContent = successResults
        .map(r => JSON.stringify(r.data, null, 2))
        .join('\n\n');
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        timestamp: Date.now(),
        results: state.results
      }));
    } catch (storageError) {
      console.warn('Failed to persist results', storageError);
    }
  }

  startButton.addEventListener('click', startScraping);
  if (elements.exportButton) {
    elements.exportButton.addEventListener('click', exportResults);
  }

  restoreCachedResults();
  window.startScraping = startScraping;
  window.__BulkScraperTestHooks = {
    exportResults,
    setResults(results) {
      if (Array.isArray(results)) {
        state.results = results;
      }
    },
    scrapeUrl,
    scrapeWithRetries
  };
})();
