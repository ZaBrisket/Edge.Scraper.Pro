const API_ENDPOINT = '/.netlify/functions/nda-analyzer';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_DOC_SIZE = 5 * 1024 * 1024;

const els = {
  app: document.getElementById('app'),
  textInput: document.getElementById('nda-text-input'),
  fileInput: document.getElementById('nda-file-input'),
  fileMeta: document.getElementById('file-meta'),
  analyze: document.getElementById('analyze-btn'),
  exportDocx: document.getElementById('export-redlines'),
  selectAll: document.getElementById('select-all'),
  clearAll: document.getElementById('clear-all'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progress-bar'),
  progressText: document.getElementById('progress-text'),
  textStats: document.getElementById('text-stats'),
  summary: document.getElementById('analysis-summary'),
  metricTotal: document.getElementById('metric-total'),
  metricMatched: document.getElementById('metric-matched'),
  metricMissing: document.getElementById('metric-missing'),
  warnings: document.getElementById('warnings'),
  issuesPanel: document.getElementById('issues-panel'),
  issueLists: {
    critical: document.getElementById('issues-critical'),
    medium: document.getElementById('issues-medium'),
    low: document.getElementById('issues-low'),
  },
  extractedPanel: document.getElementById('extracted-panel'),
  extractedText: document.getElementById('extracted-text'),
  errorBox: document.getElementById('app-error'),
};

const state = {
  sessionId: initSessionId(),
  issues: [],
  selectedIssueIds: new Set(),
  lastDocumentPayload: null,
  analyzing: false,
  lastAnalysisTime: null,
};

function initSessionId() {
  try {
    const stored = localStorage.getItem('esp_nda_session');
    if (stored) return stored;
  } catch (_) {
    // ignore storage errors
  }
  const fallback = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
  try {
    localStorage.setItem('esp_nda_session', fallback);
  } catch (_) {
    // ignore storage write
  }
  return fallback;
}

function sanitizeText(text) {
  return String(text)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .slice(0, 50000);
}

function setBusy(isBusy) {
  if (!els.app) return;
  els.app.setAttribute('aria-busy', String(isBusy));
  state.analyzing = isBusy;
}

function updateTextStats() {
  if (!els.textStats || !els.textInput) return;
  const len = els.textInput.value.length;
  els.textStats.textContent = `${len.toLocaleString()} / 50,000`;
  els.textStats.style.color = len > 49000 ? '#ff9f43' : '#9aa0a6';
}

function resetIssues() {
  state.issues = [];
  state.selectedIssueIds.clear();
  Object.values(els.issueLists).forEach((list) => {
    if (list) list.textContent = '';
  });
  if (els.issuesPanel) {
    els.issuesPanel.hidden = true;
  }
  if (els.exportDocx) {
    els.exportDocx.disabled = true;
  }
}

function showProgress(percent, message) {
  if (!els.progress || !els.progressBar || !els.progressText) return;
  els.progress.setAttribute('aria-hidden', 'false');
  els.progressBar.style.width = `${Math.max(0, Math.min(percent, 100))}%`;
  els.progressText.textContent = message;
}

function hideProgress() {
  if (!els.progress || !els.progressBar || !els.progressText) return;
  els.progress.setAttribute('aria-hidden', 'true');
  els.progressBar.style.width = '0%';
  els.progressText.textContent = 'Idle';
}

function showError(message, level = 'error') {
  if (!els.errorBox) return;
  const levelClass = level === 'warning' ? 'warn' : level === 'info' ? 'info' : '';
  els.errorBox.classList.remove('warn', 'info');
  if (levelClass) {
    els.errorBox.classList.add(levelClass);
  }
  els.errorBox.hidden = false;
  els.errorBox.textContent = message;
}

function clearError() {
  if (!els.errorBox) return;
  els.errorBox.hidden = true;
  els.errorBox.textContent = '';
  els.errorBox.classList.remove('warn', 'info');
}

function formatSimilarity(value) {
  return `${Math.round(value * 100)}%`;
}

function formatBurden(burden) {
  switch (burden) {
    case 'low':
      return 'Low burden';
    case 'medium':
      return 'Medium burden';
    case 'high':
      return 'High burden';
    default:
      return burden;
  }
}

function createIssueCard(issue) {
  const li = document.createElement('li');
  li.className = `issue-card ${issue.severity}`;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.selectedIssueIds.has(issue.id);
  checkbox.dataset.issueId = issue.id;
  checkbox.addEventListener('change', onIssueToggle);
  li.appendChild(checkbox);

  const content = document.createElement('div');
  content.className = 'issue-content';

  const titleRow = document.createElement('div');
  titleRow.className = 'issue-title';
  const title = document.createElement('span');
  title.textContent = `[${issue.category}] ${issue.title}`;
  const similarity = document.createElement('span');
  similarity.className = 'muted';
  similarity.textContent = `Similarity ${formatSimilarity(issue.similarity)} • ${formatBurden(issue.burden)}`;
  titleRow.append(title, similarity);
  content.appendChild(titleRow);

  const meta = document.createElement('div');
  meta.className = 'issue-meta';
  meta.textContent = `Action: ${issue.action.toUpperCase()}${issue.location ? ` • Paragraph ${issue.location.paragraphId}` : ''}`;
  content.appendChild(meta);

  if (issue.originalText) {
    const original = document.createElement('div');
    original.className = 'issue-text';
    const label = document.createElement('strong');
    label.textContent = 'Original:';
    const body = document.createElement('div');
    body.textContent = issue.originalText;
    original.append(label, body);
    content.appendChild(original);
  }

  if (issue.suggestedText) {
    const suggestion = document.createElement('div');
    suggestion.className = 'issue-text';
    const label = document.createElement('strong');
    label.textContent = 'Suggested:';
    const body = document.createElement('div');
    body.textContent = issue.suggestedText;
    suggestion.append(label, body);
    content.appendChild(suggestion);
  }

  const rationale = document.createElement('div');
  rationale.className = 'issue-rationale';
  rationale.textContent = issue.rationale;
  content.appendChild(rationale);

  li.appendChild(content);
  return li;
}

function renderIssues(issues) {
  resetIssues();
  state.issues = issues;
  state.selectedIssueIds = new Set(issues.filter((issue) => issue.defaultSelected).map((issue) => issue.id));

  issues.forEach((issue) => {
    const list = els.issueLists[issue.severity] || els.issueLists.medium;
    if (!list) return;
    if (!state.selectedIssueIds.has(issue.id)) {
      // ensure default unchecked state is applied visually
      state.selectedIssueIds.delete(issue.id);
    }
    list.appendChild(createIssueCard(issue));
  });

  if (els.issuesPanel) {
    els.issuesPanel.hidden = issues.length === 0;
  }
  updateExportButtonState();
}

function updateExportButtonState() {
  if (!els.exportDocx) return;
  const selectable = state.issues.some((issue) => issue.action !== 'flag');
  els.exportDocx.disabled = !selectable || state.selectedIssueIds.size === 0;
}

function onIssueToggle(event) {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;
  const issueId = checkbox.dataset.issueId;
  if (!issueId) return;
  if (checkbox.checked) {
    state.selectedIssueIds.add(issueId);
  } else {
    state.selectedIssueIds.delete(issueId);
  }
  updateExportButtonState();
}

function updateSummary(metrics, warnings) {
  if (!els.summary || !els.metricTotal || !els.metricMatched || !els.metricMissing) return;
  els.summary.hidden = false;
  els.metricTotal.textContent = metrics.totalClauses.toLocaleString();
  els.metricMatched.textContent = metrics.matchedClauses.toLocaleString();
  els.metricMissing.textContent = metrics.missingClauses.toLocaleString();

  if (els.warnings) {
    if (warnings.length) {
      els.warnings.hidden = false;
      els.warnings.textContent = warnings.join('\n');
    } else {
      els.warnings.hidden = true;
      els.warnings.textContent = '';
    }
  }
}

function showExtractedText(text) {
  if (!els.extractedPanel || !els.extractedText) return;
  els.extractedPanel.hidden = false;
  els.extractedText.textContent = text;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected file reader result.'));
        return;
      }
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

function describeFile(file) {
  const size = file.size;
  const kb = size / 1024;
  const sizeLabel = kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
  return `${file.name} (${sizeLabel})`;
}

function updateFileMeta() {
  if (!els.fileInput || !els.fileMeta) return;
  const file = els.fileInput.files && els.fileInput.files[0];
  if (!file) {
    els.fileMeta.textContent = '';
    return;
  }
  els.fileMeta.textContent = describeFile(file);
}

function cloneDocumentPayload(base) {
  if (!base) return null;
  return JSON.parse(JSON.stringify(base));
}

async function analyzeDocument() {
  if (!els.analyze || state.analyzing) return;

  clearError();
  resetIssues();
  setBusy(true);
  showProgress(10, 'Preparing document...');

  try {
    const rawText = els.textInput ? els.textInput.value : '';
    const sanitized = sanitizeText(rawText);
    const file = els.fileInput && els.fileInput.files ? els.fileInput.files[0] : null;

    if (!sanitized && !file) {
      throw new Error('Provide NDA text or upload a .docx document.');
    }

    const payload = {
      sessionId: state.sessionId,
      text: sanitized || undefined,
    };

    if (file) {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        throw new Error('Only .docx files are supported for upload.');
      }
      if (file.size > MAX_DOC_SIZE) {
        throw new Error('Document exceeds 5MB limit.');
      }
      const base64 = await fileToBase64(file);
      payload.fileName = file.name;
      payload.mimeType = file.type || DOCX_MIME;
      payload.fileBase64 = base64;
      state.lastDocumentPayload = cloneDocumentPayload({
        text: payload.text,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        fileBase64: payload.fileBase64,
      });
    } else {
      state.lastDocumentPayload = cloneDocumentPayload({ text: payload.text });
    }

    showProgress(35, 'Analyzing NDA...');

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': state.sessionId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = body?.error || `Analysis failed (HTTP ${response.status}).`;
      throw new Error(message);
    }

    showProgress(80, 'Finalising results...');
    const result = await response.json();
    renderIssues(result.issues || []);
    updateSummary(result.metrics, result.warnings || []);
    showExtractedText(result.extractedText || '');
    state.lastAnalysisTime = Date.now();

    if (state.selectedIssueIds.size === 0) {
      // ensure export button state reflects new defaults
      state.issues.forEach((issue) => {
        if (issue.defaultSelected) state.selectedIssueIds.add(issue.id);
      });
      renderIssues(state.issues);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error during analysis.';
    showError(message);
  } finally {
    hideProgress();
    setBusy(false);
  }
}

async function exportDocx() {
  if (!els.exportDocx || els.exportDocx.disabled) {
    return;
  }

  if (!state.lastDocumentPayload) {
    showError('Run an analysis before exporting tracked changes.');
    return;
  }

  if (!state.selectedIssueIds.size) {
    showError('Select at least one issue to include in the export.', 'warning');
    return;
  }

  setBusy(true);
  showProgress(30, 'Generating tracked changes...');

  try {
    const payload = cloneDocumentPayload(state.lastDocumentPayload) || {};
    payload.sessionId = state.sessionId;
    payload.includeDocxExport = true;
    payload.selectedIssueIds = Array.from(state.selectedIssueIds);

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': state.sessionId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = body?.error || `Export failed (HTTP ${response.status}).`;
      throw new Error(message);
    }

    const result = await response.json();
    if (!result.exportDocumentBase64) {
      throw new Error('Export did not include a document payload.');
    }

    downloadDocx(result.exportDocumentBase64);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error during export.';
    showError(message);
  } finally {
    hideProgress();
    setBusy(false);
  }
}

function downloadDocx(base64) {
  const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([buffer], { type: DOCX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nda-review-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function selectAllIssues() {
  state.issues.forEach((issue) => {
    if (issue.action !== 'flag') {
      state.selectedIssueIds.add(issue.id);
    }
  });
  rerenderCheckboxes();
}

function clearAllIssues() {
  state.selectedIssueIds.clear();
  rerenderCheckboxes();
}

function rerenderCheckboxes() {
  state.issues.forEach((issue) => {
    const checkbox = document.querySelector(`input[data-issue-id="${issue.id}"]`);
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = state.selectedIssueIds.has(issue.id);
    }
  });
  updateExportButtonState();
}

function bindEvents() {
  if (els.textInput) {
    els.textInput.addEventListener('input', () => {
      updateTextStats();
      state.lastDocumentPayload = null; // text changed, previous export invalid
    });
  }

  if (els.fileInput) {
    els.fileInput.addEventListener('change', () => {
      updateFileMeta();
      state.lastDocumentPayload = null;
    });
  }

  if (els.analyze) {
    els.analyze.addEventListener('click', (event) => {
      event.preventDefault();
      analyzeDocument();
    });
  }

  if (els.exportDocx) {
    els.exportDocx.addEventListener('click', (event) => {
      event.preventDefault();
      exportDocx();
    });
  }

  if (els.selectAll) {
    els.selectAll.addEventListener('click', (event) => {
      event.preventDefault();
      selectAllIssues();
    });
  }

  if (els.clearAll) {
    els.clearAll.addEventListener('click', (event) => {
      event.preventDefault();
      clearAllIssues();
    });
  }
}

function init() {
  updateTextStats();
  updateFileMeta();
  bindEvents();
}

init();
