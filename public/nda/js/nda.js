import { compilePlaybook, evaluate, riskLabel } from "./rules-engine.js";
import { buildRedlinesDoc, buildInteractiveRedlinesDoc } from "./docx-redline.js";
import { extractTextFromDocx } from "./docx-parser.js";
import { calculateContextScore } from "./context-scorer.js";

const els = {
  textInput: document.getElementById("nda-text-input"),
  fileInput: document.getElementById("file-input"),
  dropZone: document.getElementById("drop-zone"),
  fileInfo: document.getElementById("file-info"),
  fileName: document.getElementById("file-name"),
  clearFile: document.getElementById("clear-file"),
  analyze: document.getElementById("analyze-btn"),
  contextAwareMode: document.getElementById("context-aware-mode"),
  progress: document.getElementById("progress"),
  bar: document.getElementById("progress-bar"),
  text: document.getElementById("progress-text"),
  stats: document.getElementById("text-stats"),
  original: document.getElementById("original"),
  redlinesList: document.getElementById("redlines-list"),
  severitySummary: document.getElementById("severity-summary"),
  interactiveSection: document.getElementById("interactive-redlines"),
  redlineItems: document.getElementById("redline-items"),
  selectAll: document.getElementById("select-all-redlines"),
  deselectAll: document.getElementById("deselect-all-redlines"),
  applySelected: document.getElementById("apply-selected-redlines"),
  exportRedlines: document.getElementById("export-redlines"),
  exportCsv: document.getElementById("export-csv"),
  exportJson: document.getElementById("export-json"),
  tableBody: document.querySelector("#results tbody"),
  filterText: document.getElementById("filter-text"),
  filterCategory: document.getElementById("filter-category"),
  filterSeverity: document.getElementById("filter-severity"),
  filterBlockers: document.getElementById("filter-blockers"),
  riskScore: document.getElementById("risk-score"),
  riskPill: document.getElementById("risk-pill"),
  playbookSelect: document.getElementById("playbook-select"),
  customPlaybook: document.getElementById("custom-playbook-file"),
  exportPlaybook: document.getElementById("export-playbook"),
  playbookMeta: document.getElementById("playbook-meta"),
  errorBox: document.getElementById("app-error"),
};

let state = {
  text: "",
  sourceFile: null,
  sourceFormat: null, // 'text' | 'docx' | 'pdf'
  evaluation: null,
  playbook: null,
  compiled: null,
  meta: null,
  selectedRedlines: new Set(),
  contextScores: new Map(),
};

const errorState = { persistentMessages: [], activeTransient: false };

let pdfjsLibPromise = null;
const pdfWorkerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).toString();

async function loadPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.mjs')
      .then((module) => {
        const pdfjsLib = module?.default ?? module;
        if (pdfjsLib?.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        }
        return pdfjsLib;
      })
      .catch((err) => {
        pdfjsLibPromise = null;
        throw err;
      });
  }
  return pdfjsLibPromise;
}

// Tab switching
document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tab = e.target.dataset.tab;
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.hidden = true);
    e.target.classList.add('active');
    document.getElementById(`${tab}-tab`).hidden = false;
  });
});

// File upload handling
els.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.dropZone.classList.add('dragover');
});

els.dropZone.addEventListener('dragleave', () => {
  els.dropZone.classList.remove('dragover');
});

els.dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  els.dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) await handleFileUpload(file);
});

els.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await handleFileUpload(file);
});

els.clearFile?.addEventListener('click', () => {
  state.sourceFile = null;
  state.sourceFormat = null;
  els.fileInput.value = '';
  els.fileInfo.hidden = true;
  els.dropZone.querySelector('.upload-prompt').hidden = false;
});

async function handleFileUpload(file) {
  try {
    showProgress(10, "Reading file...");
    
    if (!file.name.match(/\.(docx|pdf|txt)$/i)) {
      showAppError("Please upload a .docx, .pdf, or .txt file", { level: "warning" });
      hideProgress();
      return;
    }
    
    state.sourceFile = file;
    els.fileName.textContent = file.name;
    els.fileInfo.hidden = false;
    els.dropZone.querySelector('.upload-prompt').hidden = true;
    
    let extractedText = "";
    
    if (file.name.endsWith('.docx')) {
      showProgress(30, "Extracting Word document content...");
      state.sourceFormat = 'docx';
      extractedText = await extractTextFromDocx(file);
    } else if (file.name.endsWith('.pdf')) {
      showProgress(30, "Extracting PDF content...");
      state.sourceFormat = 'pdf';
      // Use existing PDF extraction if available
      extractedText = await extractTextFromPdf(file);
    } else if (file.name.endsWith('.txt')) {
      state.sourceFormat = 'text';
      extractedText = await file.text();
    }
    
    state.text = sanitizeText(extractedText);
    els.textInput.value = state.text;
    updateTextStats();
    
    showProgress(100, "File loaded successfully");
    setTimeout(hideProgress, 1000);
  } catch (err) {
    console.error("File upload error:", err);
    showAppError(`Failed to process file: ${err.message}`, { level: "error" });
    hideProgress();
  }
}

async function extractTextFromPdf(file) {
  try {
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File too large. Maximum size is 15MB.');
    }

    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) {
        text += pageText + '\n\n';
      }
    }

    pdf.cleanup?.();
    pdf.destroy?.();

    return text.replace(/\n{3,}/g, '\n\n').trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

function sanitizeText(text) {
  return String(text)
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, "")
    .replace(/<object[^>]*>.*?<\/object>/gi, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .substring(0, 50000);
}

function updateTextStats() {
  const len = els.textInput.value.length;
  els.stats.textContent = `${len.toLocaleString()} / 50,000 characters`;
  els.stats.style.color = len > 45000 ? "#d73502" : "#666";
}

function setBusy(b) { 
  document.getElementById("app").setAttribute("aria-busy", String(b)); 
}

function showProgress(pct, msg) {
  els.progress.setAttribute("aria-hidden", "false");
  els.bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  els.text.textContent = msg || "";
}

function hideProgress() {
  els.progress.setAttribute("aria-hidden", "true");
  els.bar.style.width = "0%";
  els.text.textContent = "Idle";
}

function showAppError(message, { level = "error", persistent = false } = {}) {
  if (!els.errorBox) return;
  if (persistent) {
    if (!errorState.persistentMessages.some(entry => entry.message === message)) {
      errorState.persistentMessages.push({ message, level });
    }
    if (!errorState.activeTransient) renderPersistentMessages();
    return;
  }
  errorState.activeTransient = true;
  applyAlertLevel(level);
  els.errorBox.textContent = message;
  els.errorBox.hidden = false;
}

function clearAppError(force = false) {
  if (!els.errorBox) return;
  if (!force && !errorState.activeTransient) return;
  errorState.activeTransient = false;
  if (force) errorState.persistentMessages = [];
  els.errorBox.hidden = true;
  els.errorBox.textContent = "";
  els.errorBox.classList.remove("warn", "info");
  if (!force) renderPersistentMessages();
}

function renderPersistentMessages() {
  if (!els.errorBox || !errorState.persistentMessages.length) return;
  const level = errorState.persistentMessages.some(e => e.level === "error") ? "error" 
    : errorState.persistentMessages.some(e => e.level === "warning") ? "warning" : "info";
  applyAlertLevel(level);
  els.errorBox.textContent = errorState.persistentMessages.map(e => `• ${e.message}`).join("\n");
  els.errorBox.hidden = false;
}

function applyAlertLevel(level) {
  els.errorBox.classList.remove("warn", "info");
  if (level === "warning") els.errorBox.classList.add("warn");
  else if (level === "info") els.errorBox.classList.add("info");
}

function formatError(err) { 
  return err?.message || String(err || "Unknown error"); 
}

function escapeHtml(s) { 
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m])); 
}

function csvEscape(s) { 
  s = String(s); 
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; 
}

function statusClass(s) { 
  return s === "pass" ? "status-pass" : s === "fail" ? "status-fail" : "status-review"; 
}

const PLAYBOOK_CACHE_KEY = "esp_playbook_cache_v2";

async function loadDefaultPlaybook() {
  try {
    const cached = JSON.parse(localStorage.getItem(PLAYBOOK_CACHE_KEY) || "null");
    if (cached?.source) {
      state.playbook = cached.source;
      state.compiled = compilePlaybook(cached.source);
      els.playbookMeta.textContent = `Playbook: ${cached.source?.name || "Edgewater"} v${cached.source?.version || "—"} (cached)`;
      if (els.playbookSelect) els.playbookSelect.value = 'edgewater';
      return cached.source;
    }
  } catch (err) {
    console.warn("Playbook cache read failed", err);
  }

  try {
    const res = await fetch("./checklist/edgewater.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pb = await res.json();
    state.playbook = pb;
    state.compiled = compilePlaybook(pb);
    try {
      localStorage.setItem(PLAYBOOK_CACHE_KEY, JSON.stringify({ version: pb.version || "1.0", source: pb }));
    } catch (err) {
      console.warn("Playbook cache write skipped", err);
    }
    els.playbookMeta.textContent = `Playbook: ${pb.name} v${pb.version}`;
    if (els.playbookSelect) els.playbookSelect.value = 'edgewater';
    return pb;
  } catch (err) {
    console.error("Failed to load default playbook", err);
    showAppError("Failed to load the default Edgewater playbook. Refresh the page.", { level: "warning", persistent: true });
    throw err;
  }
}

async function runAnalysis() {
  const inputText = state.sourceFile ? state.text : els.textInput.value;
  if (!inputText?.trim()) {
    showAppError("Please provide NDA text to analyze", { level: "warning" });
    return;
  }
  if (!state.compiled) {
    showAppError("Playbook not loaded yet; please try again in a moment.", { level: "warning" });
    return;
  }

  clearAppError();
  setBusy(true);
  showProgress(20, "Preparing analysis...");

  const startTime = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  state.contextScores.clear();

  try {
    if (!state.sourceFile) {
      state.sourceFormat = 'text';
    }
    state.text = sanitizeText(inputText);
    if (!state.sourceFile && els.textInput) {
      els.textInput.value = state.text;
    }
    els.original.textContent = state.text.slice(0, 4096) + (state.text.length > 4096 ? "\n\n[... truncated for display ...]" : "");
    
    showProgress(40, "Evaluating against playbook...");
    const ev = evaluate(state.text, state.compiled);
    
    if (els.contextAwareMode.checked) {
      showProgress(60, "Calculating context-aware severity scores...");
      // Calculate context scores for each result
      for (const result of ev.results) {
        const contextScore = calculateContextScore(result, state.text, state.playbook);
        state.contextScores.set(result.id, contextScore);
        
        // Adjust severity based on context
        if (contextScore.substantialCompliance) {
          result.adjustedSeverity = Math.max(1, result.severity - 3);
        } else {
          result.adjustedSeverity = result.severity;
        }
      }
    }
    
    const endTime = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

    state.evaluation = ev;
    state.meta = {
      filename: state.sourceFile?.name || "Pasted text",
      source: state.sourceFile ? 'file_upload' : 'text_input',
      sourceFormat: state.sourceFormat || 'text',
      filesize: state.sourceFile ? formatBytes(state.sourceFile.size) : `${state.text.length} chars`,
      charactersAnalyzed: state.text.length,
      processedAt: new Date().toISOString(),
      processingMs: Math.max(0, Math.round(endTime - startTime)),
      contextAware: !!els.contextAwareMode.checked
    };
    
    showProgress(80, "Rendering results...");
    await renderResults();
    await renderInteractiveRedlines();
    
    showProgress(100, "Analysis complete");
    setTimeout(hideProgress, 1500);
    
    // Show severity summary if context-aware mode
    if (els.contextAwareMode.checked) {
      renderSeveritySummary();
    } else if (els.severitySummary) {
      els.severitySummary.hidden = true;
    }
    
  } catch (err) {
    console.error("Analysis error:", err);
    showAppError(`Analysis failed: ${formatError(err)}`, { level: "error" });
    hideProgress();
  } finally {
    setBusy(false);
  }
}

function renderSeveritySummary() {
  const summary = els.severitySummary;
  if (!summary) return;
  
  const contextAdjustments = Array.from(state.contextScores.values())
    .filter(cs => cs.substantialCompliance);
  
  if (contextAdjustments.length > 0) {
    summary.innerHTML = `
      <div class="info-box">
        <strong>Context-Aware Analysis:</strong>
        <ul>
          <li>${contextAdjustments.length} provisions show substantial compliance</li>
          <li>Severity scores adjusted to avoid redundant redlining</li>
        </ul>
      </div>
    `;
    summary.hidden = false;
  } else {
    summary.hidden = true;
  }
}

async function renderInteractiveRedlines() {
  const items = els.redlineItems;
  if (!items) return;
  
  items.innerHTML = '';
  state.selectedRedlines.clear();
  
  const failures = state.evaluation.results.filter(r => r.status !== 'pass');
  
  if (failures.length === 0) {
    els.interactiveSection.hidden = true;
    return;
  }
  
  els.interactiveSection.hidden = false;
  
  failures.forEach((result, idx) => {
    const contextScore = state.contextScores.get(result.id);
    const adjustedSev = result.adjustedSeverity || result.severity;
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'redline-item';
    itemDiv.dataset.resultId = result.id;
    
    itemDiv.innerHTML = `
      <label class="redline-checkbox">
        <input type="checkbox" data-result-id="${result.id}" ${adjustedSev >= 5 ? 'checked' : ''} />
        <div class="redline-content">
          <div class="redline-header">
            <span class="redline-title">${escapeHtml(result.title || '')}</span>
            <span class="severity-badge sev-${adjustedSev}">${adjustedSev}</span>
            ${contextScore?.substantialCompliance ? '<span class="compliance-badge">Substantial Compliance</span>' : ''}
          </div>
          <div class="redline-evidence">${escapeHtml(result.evidence?.text || '')}</div>
          <div class="redline-recommendation">${escapeHtml(result.recommendation || '')}</div>
        </div>
      </label>
    `;
    
    items.appendChild(itemDiv);
    
    // Auto-select high severity items
    if (adjustedSev >= 5) {
      state.selectedRedlines.add(result.id);
    }
  });
  
  // Wire up checkboxes
  items.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.resultId;
      if (e.target.checked) {
        state.selectedRedlines.add(id);
      } else {
        state.selectedRedlines.delete(id);
      }
    });
  });
}

els.selectAll?.addEventListener('click', () => {
  els.redlineItems.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
    state.selectedRedlines.add(cb.dataset.resultId);
  });
});

els.deselectAll?.addEventListener('click', () => {
  els.redlineItems.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
  state.selectedRedlines.clear();
});

els.applySelected?.addEventListener('click', async () => {
  if (state.selectedRedlines.size === 0) {
    showAppError("Please select at least one redline to apply", { level: "warning" });
    return;
  }
  
  try {
    const selectedResults = state.evaluation.results.filter(r => 
      state.selectedRedlines.has(r.id)
    );
    
    const blob = await buildInteractiveRedlinesDoc({
      fullText: state.text,
      results: selectedResults,
      meta: state.meta,
      sourceFormat: state.sourceFormat,
      contextScores: state.contextScores
    });
    
    downloadBlob(blob, `NDA_Redlines_Selected_${new Date().toISOString().slice(0, 10)}.docx`);
    
    showAppError(`Exported ${selectedResults.length} selected redlines`, { level: "info" });
  } catch (err) {
    console.error("Export error:", err);
    showAppError(`Export failed: ${formatError(err)}`, { level: "error" });
  }
});

async function renderResults() {
  if (!state.evaluation) return;
  
  const tbody = els.tableBody;
  tbody.innerHTML = "";
  
  for (const r of state.evaluation.results) {
    const contextScore = state.contextScores.get(r.id);
    const adjustedSev = r.adjustedSeverity || r.severity;
    
    const row = document.createElement("tr");
    row.className = statusClass(r.status);
    row.dataset.level = r.level || '';
    
    row.innerHTML = `
      <td><span class="status-badge ${statusClass(r.status)}">${r.status.toUpperCase()}</span></td>
      <td>${escapeHtml(r.category || '')}</td>
      <td>${escapeHtml(r.clause || '')}</td>
      <td>${escapeHtml(r.title || '')}</td>
      <td class="center">${r.severity}</td>
      <td class="center">${contextScore ? contextScore.score.toFixed(1) : '—'}</td>
      <td class="evidence">${r.evidence?.text ? escapeHtml(r.evidence.text) : '—'}</td>
      <td>${escapeHtml(r.recommendation || '')}</td>
    `;
    
    tbody.appendChild(row);
  }
  
  // Update risk score
  els.riskScore.textContent = `${state.evaluation.risk.score} (${state.evaluation.risk.blockers} blockers, ${state.evaluation.risk.warns} warnings)`;
  els.riskPill.textContent = riskLabel(state.evaluation.risk.level);
  els.riskPill.className = `pill risk-${state.evaluation.risk.level.toLowerCase()}`;
  
  renderRedlinesList(state.evaluation.results);
  updateFilters();
}

function renderRedlinesList(results) {
  if (!els.redlinesList) return;
  if (!Array.isArray(results)) {
    els.redlinesList.innerHTML = '';
    return;
  }

  const issues = results.filter(r => r.status !== 'pass');
  if (issues.length === 0) {
    els.redlinesList.innerHTML = '<div class="muted">All checklist items passed.</div>';
    return;
  }

  const html = issues.map(result => {
    const contextScore = state.contextScores.get(result.id);
    const adjustedSev = result.adjustedSeverity || result.severity;
    const statusLabel = result.status ? result.status.toUpperCase() : 'REVIEW';
    const compliance = contextScore?.substantialCompliance ? '<span class="compliance-badge">Substantial Compliance</span>' : '';
    return `
      <div class="item ${statusClass(result.status)}">
        <div class="item-header">
          <span class="status-badge ${statusClass(result.status)}">${statusLabel}</span>
          <strong>[${escapeHtml(result.category || '')}] ${escapeHtml(result.title || '')}</strong>
          <span class="severity-badge sev-${adjustedSev}">${adjustedSev}</span>
          ${compliance}
        </div>
        ${result.evidence?.text ? `<div class="item-evidence"><em>Evidence:</em> ${escapeHtml(result.evidence.text)}</div>` : ''}
        ${result.recommendation ? `<div class="item-recommendation"><em>Recommendation:</em> ${escapeHtml(result.recommendation)}</div>` : ''}
      </div>
    `;
  }).join('');

  els.redlinesList.innerHTML = html;
}

function updateFilters() {
  const categories = new Set();
  state.evaluation.results.forEach(r => categories.add(r.category));
  
  els.filterCategory.innerHTML = '<option value="">All Categories</option>';
  Array.from(categories).sort().forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    els.filterCategory.appendChild(option);
  });
}

function applyFilters() {
  const filterText = els.filterText.value.toLowerCase();
  const filterCategory = els.filterCategory.value;
  const filterSeverity = parseInt(els.filterSeverity.value) || 1;
  const filterBlockers = els.filterBlockers.checked;
  
  const rows = els.tableBody.querySelectorAll('tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    const category = cells[1].textContent;
    const severity = parseInt(cells[4].textContent) || 0;
    const level = row.dataset.level || '';
    const text = row.textContent.toLowerCase();
    
    let show = true;
    if (filterCategory && category !== filterCategory) show = false;
    if (severity < filterSeverity) show = false;
    if (filterBlockers && level !== 'BLOCKER') show = false;
    if (filterText && !text.includes(filterText)) show = false;
    
    row.style.display = show ? '' : 'none';
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function downloadBlob(blob, filename) {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Download failed', err);
    showAppError(`Download failed: ${formatError(err)}`);
  }
}

// Export handlers
els.exportRedlines?.addEventListener('click', async () => {
  if (!state.evaluation) {
    showAppError("No analysis results to export", { level: "warning" });
    return;
  }
  
  try {
    const blob = await buildRedlinesDoc({
      fullText: state.text,
      results: state.evaluation.results,
      meta: state.meta,
      sourceFormat: state.sourceFormat
    });
    
    downloadBlob(blob, `NDA_Redlines_${new Date().toISOString().slice(0, 10)}.docx`);
  } catch (err) {
    console.error("Export error:", err);
    showAppError(`Export failed: ${formatError(err)}`, { level: "error" });
  }
});

els.exportCsv?.addEventListener('click', () => {
  if (!state.evaluation) return;
  
  let csv = "Status,Category,Clause,Title,Severity,Evidence,Recommendation\n";
  for (const r of state.evaluation.results) {
    csv += [
      csvEscape(r.status),
      csvEscape(r.category || ''),
      csvEscape(r.clause || ''),
      csvEscape(r.title || ''),
      r.severity,
      csvEscape(r.evidence?.text || ''),
      csvEscape(r.recommendation || '')
    ].join(',') + '\n';
  }
  
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, `NDA_Checklist_${new Date().toISOString().slice(0, 10)}.csv`);
});

els.exportJson?.addEventListener('click', () => {
  if (!state.evaluation) return;
  
  const data = {
    meta: state.meta,
    risk: state.evaluation.risk,
    results: state.evaluation.results,
    contextScores: els.contextAwareMode.checked ? 
      Object.fromEntries(state.contextScores) : null
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `NDA_Analysis_${new Date().toISOString().slice(0, 10)}.json`);
});

async function handlePlaybookSelect(event) {
  if (!event?.target) return;
  if (event.target.value === 'custom') {
    event.target.value = 'custom';
    els.customPlaybook?.click();
    return;
  }

  try {
    await loadDefaultPlaybook();
    if (state.text) {
      await runAnalysis();
    }
  } catch (err) {
    console.error('Failed to reload default playbook', err);
    showAppError(`Unable to reload default playbook: ${formatError(err)}`);
  }
}

async function handleCustomPlaybook(event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    if (els.playbookSelect) els.playbookSelect.value = 'edgewater';
    return;
  }

  try {
    const text = await file.text();
    let playbook;
    if (/\.(ya?ml)$/i.test(file.name)) {
      playbook = yamlToJson(text);
    } else {
      playbook = JSON.parse(text);
    }

    if (!playbook || !playbook.rules) {
      throw new Error('Invalid playbook format');
    }

    state.playbook = playbook;
    state.compiled = compilePlaybook(playbook);
    els.playbookMeta.textContent = `Playbook: ${playbook.name || 'Custom'} v${playbook.version || '1.0'} (custom)`;
    els.playbookSelect.value = 'custom';

    if (state.text) {
      await runAnalysis();
    }
  } catch (err) {
    console.error('Custom playbook import failed', err);
    showAppError(`Unable to import playbook: ${formatError(err)}`);
  } finally {
    event.target.value = '';
  }
}

function exportCurrentPlaybook() {
  if (!state.playbook) {
    showAppError('No playbook loaded to export.', { level: 'warning' });
    return;
  }
  try {
    const blob = new Blob([JSON.stringify(state.playbook, null, 2)], { type: 'application/json' });
    const name = `playbook-${(state.playbook.name || 'custom').replace(/\s+/g, '_')}.json`;
    downloadBlob(blob, name);
  } catch (err) {
    console.error('Playbook export failed', err);
    showAppError(`Unable to export playbook: ${formatError(err)}`);
  }
}

function yamlToJson(y) {
  const KEY_MAP = {
    id: "id",
    title: "title",
    clause: "clause",
    category: "category",
    recommendation: "recommendation",
    level: "level",
    severity: "severity",
    when: "when",
    failif: "failIf",
    require: "require",
    forbid: "forbid",
    patternsany: "patternsAny",
    antipatternsany: "antiPatternsAny",
    tags: "tags",
    references: "references",
  };
  const ARRAY_KEYS = new Set(["require", "forbid", "patternsAny", "antiPatternsAny", "tags", "references"]);

  const stripInlineComment = (value) => {
    if (!value) return "";
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (ch === "\"" && !inSingle) {
        inDouble = !inDouble;
        continue;
      }
      if (ch === "#" && !inSingle && !inDouble) {
        return value.slice(0, i).trim();
      }
    }
    return value.trim();
  };

  const stripQuotes = (value) => {
    if (!value) return "";
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  };

  const parseScalar = (value) => {
    const cleaned = stripQuotes(stripInlineComment(value || ""));
    if (cleaned === "") return "";
    if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
    if (/^(true|false)$/i.test(cleaned)) return cleaned.toLowerCase() === "true";
    return cleaned;
  };

  const parseJsonish = (value) => {
    const cleaned = stripInlineComment(value || "");
    const trimmed = cleaned.trim();
    if (!trimmed) return "";
    const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    if (looksJson) {
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        if (!trimmed.includes('"') && trimmed.includes("'")) {
          try {
            return JSON.parse(trimmed.replace(/'/g, '"'));
          } catch (_) {
            return parseScalar(trimmed);
          }
        }
        return parseScalar(trimmed);
      }
    }
    return parseScalar(trimmed);
  };

  const rules = [];
  const meta = {};
  let current = null;
  let currentIndent = null;
  let pendingListKey = null;

  const commit = () => {
    if (!current) return;
    if (!current.id) current.id = current.title || `rule_${rules.length + 1}`;
    rules.push(current);
    current = null;
    currentIndent = null;
    pendingListKey = null;
  };

  const applyProp = (target, key, rawVal) => {
    if (!target) return;
    const lower = key.trim().toLowerCase();
    const canonical = KEY_MAP[lower] || key.trim();
    const valueText = typeof rawVal === "string" ? rawVal : "";

    if (ARRAY_KEYS.has(canonical)) {
      const arr = Array.isArray(target[canonical])
        ? target[canonical]
        : target[canonical] != null
          ? [target[canonical]]
          : [];
      const cleaned = stripInlineComment(valueText);
      if (!cleaned) {
        target[canonical] = arr;
        pendingListKey = canonical;
        return;
      }
      if (cleaned.startsWith("[") || cleaned.startsWith("{")) {
        const parsed = parseJsonish(cleaned);
        if (Array.isArray(parsed)) arr.push(...parsed);
        else if (parsed !== "") arr.push(parsed);
      } else {
        const scalar = parseScalar(cleaned);
        if (scalar !== "") arr.push(scalar);
      }
      target[canonical] = arr;
      pendingListKey = canonical;
      return;
    }

    pendingListKey = null;

    if (canonical === "severity") {
      const num = Number(stripInlineComment(valueText));
      target[canonical] = Number.isFinite(num) ? num : 5;
      return;
    }
    if (canonical === "when" || canonical === "failIf") {
      target[canonical] = parseJsonish(valueText);
      return;
    }

    target[canonical] = parseScalar(valueText);
  };

  const lines = y.split(/\r?\n/);
  lines.forEach((line) => {
    const indent = (line.match(/^\s*/) || [""])[0].length;
    const trimmed = line.trim();
    if (!trimmed) {
      pendingListKey = null;
      return;
    }
    if (trimmed.startsWith("#")) return;
    if (/^rules:\s*$/i.test(trimmed)) {
      pendingListKey = null;
      return;
    }

    if (pendingListKey && current && indent > (currentIndent ?? -1)) {
      const listMatch = trimmed.match(/^-\s*(.*)$/);
      if (listMatch) {
        const arr = Array.isArray(current[pendingListKey]) ? current[pendingListKey] : [];
        const item = listMatch[1];
        if (item) {
          if (item.startsWith("[") || item.startsWith("{")) {
            const parsed = parseJsonish(item);
            if (Array.isArray(parsed)) arr.push(...parsed);
            else if (parsed !== "") arr.push(parsed);
          } else {
            const scalar = parseScalar(item);
            if (scalar !== "") arr.push(scalar);
          }
        }
        current[pendingListKey] = arr;
        return;
      }
    }

    const startMatch = line.match(/^\s*-\s*(.*)$/);
    if (startMatch && (!current || indent <= (currentIndent ?? 0))) {
      commit();
      current = {};
      currentIndent = indent;
      pendingListKey = null;
      const rest = startMatch[1];
      if (rest) {
        const prop = rest.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
        if (prop) applyProp(current, prop[1], prop[2]);
      }
      return;
    }

    const propMatch = line.match(/^\s+([a-zA-Z0-9_]+):\s*(.*)$/);
    if (propMatch) {
      if (!current) {
        current = {};
        currentIndent = indent;
      }
      applyProp(current, propMatch[1], propMatch[2]);
      return;
    }

    const metaMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (metaMatch) {
      const lower = metaMatch[1].trim().toLowerCase();
      const canonical = KEY_MAP[lower] || metaMatch[1].trim();
      const valueText = metaMatch[2];
      if (ARRAY_KEYS.has(canonical)) {
        const arr = Array.isArray(meta[canonical])
          ? meta[canonical]
          : meta[canonical] != null
            ? [meta[canonical]]
            : [];
        const scalar = parseScalar(valueText);
        if (scalar !== "") {
          arr.push(scalar);
          meta[canonical] = arr;
        }
      } else {
        meta[canonical] = parseScalar(valueText);
      }
      pendingListKey = null;
      return;
    }

    pendingListKey = null;
  });

  commit();

  if (!rules.length) throw new Error("No rules found in YAML playbook.");

  return { ...meta, rules: rules.filter(Boolean) };
}

// Event listeners
els.textInput?.addEventListener('input', updateTextStats);
els.analyze?.addEventListener('click', runAnalysis);
els.filterText?.addEventListener('input', applyFilters);
els.filterCategory?.addEventListener('change', applyFilters);
els.playbookSelect?.addEventListener('change', handlePlaybookSelect);
els.customPlaybook?.addEventListener('change', handleCustomPlaybook);
els.exportPlaybook?.addEventListener('click', exportCurrentPlaybook);
els.filterSeverity?.addEventListener('input', applyFilters);
els.filterBlockers?.addEventListener('change', applyFilters);

// Initialize
(async () => {
  try {
    await loadDefaultPlaybook();
    updateTextStats();
  } catch (err) {
    console.error("Initialization error:", err);
  }
})();
