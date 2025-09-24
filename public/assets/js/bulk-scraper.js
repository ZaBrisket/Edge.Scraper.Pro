(function() {
  'use strict';

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const urlInput = document.getElementById('urlInput');
  const startButton = document.getElementById('startButton');

  if (!dropzone || !fileInput || !urlInput || !startButton) {
    return;
  }

  const dataset = document.body.dataset || {};
  const defaultMode = dataset.mode || 'general';
  const forceSports = dataset.forceSports === 'true';

  const SPORTS_EXTRACTOR_SRC = '/sports-extractor.js';
  let sportsExtractorPromise = null;

  function hasEdgeScraper() {
    return Boolean(window.EdgeScraper && typeof window.EdgeScraper.scrapeOne === 'function');
  }

  function loadSportsExtractorScript() {
    if (window.SportsExtractor) {
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
        resolve();
      }, { once: true });

      script.addEventListener('error', () => {
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
      return;
    }

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
      ensureSportsExtractor().catch(error => {
        console.error('Sports extractor failed to preload', error);
      });
    }

    elements.sportsMode.addEventListener('change', event => {
      if (!event.target.checked) {
        return;
      }

      ensureSportsExtractor().catch(error => {
        console.error('Sports extractor failed to load', error);
        alert('Sports extractor failed to load. Sports mode has been disabled.');
        event.target.checked = false;
      });
    });
  }

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => {
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => {
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', event => {
    const files = event.dataTransfer.files;
    handleFiles(files);
  });

  fileInput.addEventListener('change', event => {
    handleFiles(event.target.files);
  });

  if (elements.selectFilesBtn) {
    elements.selectFilesBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      fileInput.click();
    });
  }

  dropzone.addEventListener('click', event => {
    if (event.target.tagName !== 'BUTTON' && !event.target.closest('button')) {
      fileInput.click();
    }
  });

  function handleFiles(files) {
    [...files].forEach(file => {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        readTextFile(file);
      } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
        readJsonFile(file);
      } else {
        console.warn('Unsupported file type:', file.type, 'for file:', file.name);
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
    };
    reader.onerror = () => {
      alert('Error reading file: ' + file.name);
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
      } catch (error) {
        console.error('Invalid JSON file:', error);
        alert('Invalid JSON file format: ' + error.message);
      }
    };
    reader.onerror = () => {
      alert('Error reading file: ' + file.name);
    };
    reader.readAsText(file);
  }

  function parseUrls() {
    const text = urlInput.value;
    const urls = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .filter(line => {
        try {
          new URL(line);
          return true;
        } catch {
          return false;
        }
      });
    return [...new Set(urls)];
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

  const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:8888/.netlify/functions'
    : '/.netlify/functions';

  async function scrapeUrl(url) {
    const extractImages = elements.extractImages ? elements.extractImages.checked : false;
    const extractMeta = elements.extractMeta ? elements.extractMeta.checked : false;
    const sportsMode = elements.sportsMode ? elements.sportsMode.checked : false;
    const startTime = Date.now();

    try {
      if (!hasEdgeScraper()) {
        throw new Error('EdgeScraper client is not available');
      }

      const needRaw = (extractImages || extractMeta || sportsMode) ? 1 : 0;
      const parseMode = 'article';
      const result = await window.EdgeScraper.scrapeOne(url, { raw: needRaw, parse: parseMode });
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

        if (needRaw && result.html) {
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
          html: needRaw ? (result.html || null) : null,
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
    const concurrency = elements.concurrency ? parseInt(elements.concurrency.value, 10) || 1 : 1;
    const delay = elements.delay ? parseInt(elements.delay.value, 10) || 0 : 0;

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

  async function startScraping() {
    state.urls = parseUrls();

    if (state.urls.length === 0) {
      alert('Please enter at least one valid URL');
      return;
    }

    if (state.urls.length > 1500) {
      alert('Maximum 1,500 URLs allowed');
      return;
    }

    if (!hasEdgeScraper()) {
      alert('The EdgeScraper client failed to load. Please refresh the page and try again.');
      return;
    }

    const wantsSportsExtractor = forceSports || (elements.sportsMode && elements.sportsMode.checked);

    if (wantsSportsExtractor) {
      try {
        await ensureSportsExtractor();
      } catch (error) {
        console.error('Sports extractor failed to initialize', error);
        alert('Sports extractor failed to load. Disable sports mode or refresh the page.');
        return;
      }
    }

    state.isProcessing = true;
    state.startTime = Date.now();

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
      alert('Unexpected error during processing: ' + error.message);
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
  }

  startButton.addEventListener('click', startScraping);
  if (elements.exportButton) {
    elements.exportButton.addEventListener('click', exportResults);
  }

  window.startScraping = startScraping;
})();
