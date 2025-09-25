import { buildRedlinesDoc } from './docx-redline.js';
import { compilePlaybook, evaluate } from './rules-engine.js';

const $ = (id) => document.getElementById(id);
const MAX_MB = Number((window.NDA_ENV && window.NDA_ENV.MAX_DOCX_MB) || 5);

const state = {
  correlationId: null,
  paragraphs: [],
  originalText: '',
  suggestions: [],
  selectedIds: new Set(),
  proposedText: '',
  lastParsedDocxBase64: null,
  exportNotes: [],
  docMeta: null,
  evaluation: null,
  compiledPlaybook: null,
};

const errorState = { persistentMessages: [], activeTransient: false };

function makeId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}

function status(id, kind, text) {
  const el = $(id);
  if (!el) return;
  el.className = `status ${kind}`;
  el.textContent = text;
}

function ensurePolicyEngine() {
  const engine = window.NDAPolicyEngine;
  if (!engine) throw new Error('NDA policy engine failed to load');
  return engine;
}

async function loadPlaybook() {
  try {
    const res = await fetch('/nda/checklist/edgewater.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const playbook = await res.json();
    state.compiledPlaybook = compilePlaybook(playbook);
  } catch (err) {
    console.warn('Failed to load NDA playbook', err);
    state.compiledPlaybook = null;
  }
}

async function onParseDocx() {
  const fileInput = $('fileInput');
  const statusEl = $('uploadStatus');
  if (!fileInput || !statusEl) return;
  const file = fileInput.files && fileInput.files[0];
  if (!file) { statusEl.textContent = 'Please choose a .docx file.'; return; }
  if (!file.name.toLowerCase().endsWith('.docx')) { statusEl.textContent = 'Only .docx files are allowed.'; return; }
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_MB) { statusEl.textContent = `File too large (${sizeMb.toFixed(2)} MB). Limit is ${MAX_MB} MB.`; return; }

  statusEl.textContent = 'Parsing...';
  const buf = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);

  try {
    const resp = await fetch('/.netlify/functions/nda-parse-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlationId: state.correlationId,
        filename: file.name,
        mime: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      statusEl.textContent = `Error: ${data.error || resp.statusText}`;
      await sendTelemetry('parse_error', { error: data.error || resp.statusText });
      return;
    }
    state.paragraphs = data.paragraphs || [];
    state.originalText = state.paragraphs.join('\n\n');
    state.lastParsedDocxBase64 = base64;
    state.exportNotes = data.notes || [];
    state.docMeta = data.meta || { filename: file.name, filesize: file.size, processedAt: new Date().toISOString() };
    $('textInput').value = state.originalText;
    $('originalView').textContent = state.originalText;
    $('proposedView').textContent = '';
    $('exportStatus').textContent = '—';
    $('exportDocxBtn').disabled = true;
    statusEl.textContent = `Parsed ${state.paragraphs.length} paragraphs${data.meta && data.meta.pages ? `, ~${data.meta.pages} pages` : ''}.`;
    await sendTelemetry('parse_ok', { paragraphs: state.paragraphs.length });
  } catch (err) {
    statusEl.textContent = 'Parsing failed. Please verify the file.';
    await sendTelemetry('parse_error', { error: err?.message || String(err) });
  }
}

async function onAnalyzeText() {
  const textArea = $('textInput');
  if (!textArea) return;
  const text = textArea.value.trim();
  if (!text) { status('analysisStatus', 'bad', 'Please paste text or parse a .docx first.'); return; }

  try {
    status('analysisStatus', 'idle', 'Analyzing...');
    clearAppError(true);
    const engine = ensurePolicyEngine();
    const result = engine.analyze(text);
    state.suggestions = result.suggestions || [];
    state.selectedIds = new Set(state.suggestions.map((s) => s.id));
    state.originalText = result.normalizedText || text;
    state.proposedText = '';

    if (state.compiledPlaybook) {
      try {
        state.evaluation = evaluate(state.originalText, state.compiledPlaybook);
      } catch (err) {
        console.warn('Evaluation via rules-engine failed', err);
        state.evaluation = null;
      }
    }

    renderIssues();
    $('originalView').textContent = state.originalText;
    $('proposedView').textContent = '';
    renderChecklist(result.checklistCoverage);

    const riskLabel = state.evaluation?.risk?.level ? ` Risk: ${state.evaluation.risk.level}.` : '';
    status('analysisStatus', 'ok', `Found ${state.suggestions.length} suggestions.${riskLabel}`);
    await sendTelemetry('analyze_ok', { issues: state.suggestions.length });
  } catch (err) {
    console.error('Analysis failed', err);
    showAppError(err?.message || String(err));
    status('analysisStatus', 'bad', 'Analysis failed. See console for details.');
    await sendTelemetry('analyze_error', { error: err?.message || String(err) });
  }
}

function renderChecklist(cov) {
  const container = $('checklistView');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);
  if (!cov) { container.textContent = '—'; return; }
  const keys = Object.keys(cov).sort();
  if (keys.length === 0) { container.textContent = '—'; return; }
  keys.forEach((key) => {
    const entry = document.createElement('div');
    const icon = document.createElement('span');
    icon.textContent = cov[key].ok ? '✔️' : '⚠️';
    const strong = document.createElement('strong');
    strong.textContent = key;
    entry.appendChild(icon);
    entry.append(' ');
    entry.appendChild(strong);
    entry.append(` — ${cov[key].note}`);
    container.appendChild(entry);
  });
}

function renderIssues() {
  const list = $('issues');
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);
  const q = $('searchInput')?.value.toLowerCase() || '';
  const sevFilter = $('severityFilter')?.value || 'all';
  const filtered = state.suggestions.filter((s) => {
    const haystack = [s.clauseType, s.title, s.rationale].map((v) => (v || '').toLowerCase()).join(' ');
    const matchesText = !q || haystack.includes(q);
    const matchesSev = sevFilter === 'all' ? true : s.severity >= Number(sevFilter);
    return matchesText && matchesSev;
  });

  const frag = document.createDocumentFragment();
  filtered.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'issue';

    const checkboxCell = document.createElement('div');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.id = s.id;
    checkbox.checked = state.selectedIds.has(s.id);
    checkbox.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (!id) return;
      if (e.target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
    });
    checkboxCell.appendChild(checkbox);
    row.appendChild(checkboxCell);

    const detailsCell = document.createElement('div');
    const titleRow = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = s.title;
    titleRow.appendChild(title);
    const pill = document.createElement('span');
    pill.className = `pill ${s.severity >= 80 ? 'sev-high' : s.severity >= 60 ? 'sev-med' : 'sev-low'}`;
    pill.textContent = String(s.severity);
    titleRow.append(' ');
    titleRow.appendChild(pill);
    detailsCell.appendChild(titleRow);

    const clause = document.createElement('div');
    clause.className = 'small muted';
    clause.textContent = `${s.clauseType} — ${s.rationale}`;
    detailsCell.appendChild(clause);

    const proposal = document.createElement('div');
    proposal.className = 'small';
    const proposalLabel = document.createElement('span');
    proposalLabel.textContent = 'Proposed: ';
    const proposalCode = document.createElement('code');
    proposalCode.textContent = s.proposal?.replacement || '';
    proposal.appendChild(proposalLabel);
    proposal.appendChild(proposalCode);
    detailsCell.appendChild(proposal);

    row.appendChild(detailsCell);

    const deltaCell = document.createElement('div');
    deltaCell.className = 'small';
    deltaCell.textContent = s.delta?.summary || '';
    row.appendChild(deltaCell);

    const previewCell = document.createElement('div');
    previewCell.className = 'small';
    const previewBtn = document.createElement('button');
    previewBtn.className = 'btn secondary small';
    previewBtn.textContent = 'Preview';
    previewBtn.dataset.preview = s.id;
    previewBtn.addEventListener('click', () => previewOne(s.id));
    previewCell.appendChild(previewBtn);
    row.appendChild(previewCell);

    frag.appendChild(row);
  });
  list.appendChild(frag);
}

function previewOne(id) {
  const engine = ensurePolicyEngine();
  const suggestion = state.suggestions.find((s) => s.id === id);
  if (!suggestion) return;
  const applied = engine.apply(state.originalText, [suggestion]);
  $('proposedView').innerHTML = applied.htmlDiff;
}

function applySelected() {
  const engine = ensurePolicyEngine();
  const selected = state.suggestions.filter((s) => state.selectedIds.has(s.id));
  const applied = engine.apply(state.originalText, selected);
  state.proposedText = applied.text;
  $('proposedView').innerHTML = applied.htmlDiff;
  $('exportDocxBtn').disabled = !state.lastParsedDocxBase64 || selected.length === 0;
  $('exportStatus').textContent = selected.length === 0 ? 'Select at least one suggestion.' : `Ready to export ${selected.length} change(s).`;
}

async function onExportDocx() {
  const selected = state.suggestions.filter((s) => state.selectedIds.has(s.id));
  if (!selected.length) { $('exportStatus').textContent = 'Select at least one suggestion.'; return; }
  if (!state.lastParsedDocxBase64) { $('exportStatus').textContent = 'Upload and parse a .docx first.'; return; }

  try {
    $('exportStatus').textContent = 'Exporting...';
    const resp = await fetch('/.netlify/functions/nda-export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlationId: state.correlationId,
        base64: state.lastParsedDocxBase64,
        edits: selected,
        author: 'EdgeScraperPro',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      $('exportStatus').textContent = `Export failed: ${err.error || resp.statusText}`;
      await sendTelemetry('export_error', { error: err.error || resp.statusText });
      const fallbackOk = await attemptLocalDocx(selected);
      if (!fallbackOk) $('exportStatus').textContent += ' (local fallback unavailable)';
      return;
    }
    const data = await resp.json();
    const b64 = data.base64;
    const blob = base64ToBlob(b64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || 'nda-redlines.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    $('exportStatus').textContent = 'Exported .docx with tracked changes.';
    await sendTelemetry('export_ok', { edits: selected.length, skipped: (data.skipped || []).length });
  } catch (err) {
    $('exportStatus').textContent = 'Export failed. Attempting local fallback...';
    await sendTelemetry('export_error', { error: err?.message || String(err) });
    const fallbackOk = await attemptLocalDocx(selected);
    $('exportStatus').textContent = fallbackOk ? 'Exported local .docx with redlines.' : 'Export failed. Local fallback unavailable.';
  }
}

async function attemptLocalDocx(selected) {
  if (!selected.length) return false;
  try {
    const results = selected.map((s) => ({
      status: 'fail',
      level: s.level || (s.severity >= 80 ? 'BLOCKER' : s.severity >= 60 ? 'WARN' : 'INFO'),
      severity: s.severity,
      category: s.clauseType || 'Clause',
      title: s.title || s.id || 'Suggestion',
      recommendation: s.proposal?.replacement || s.rationale || '',
      evidence: s.delta?.summary ? { text: s.delta.summary } : s.context ? { text: s.context } : null,
    }));
    const blob = await buildRedlinesDoc({
      fullText: state.originalText,
      results,
      meta: state.docMeta || { source: 'text_input', processedAt: new Date().toISOString() },
    });
    downloadBlob(blob, 'nda-redlines-local.docx');
    return true;
  } catch (err) {
    console.warn('Local DOCX export failed', err);
    return false;
  }
}

async function sendTelemetry(event, payload) {
  try {
    await fetch('/.netlify/functions/nda-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correlationId: state.correlationId, event, payload }),
    });
  } catch (err) {
    console.warn('Telemetry beacon failed', err);
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBlob(b64, mime) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function showAppError(message, { level = 'error', persistent = false } = {}) {
  const box = $('app-error');
  if (!box) return;
  if (persistent) {
    if (!errorState.persistentMessages.some((entry) => entry.message === message)) {
      errorState.persistentMessages.push({ message, level });
    }
    if (!errorState.activeTransient) renderPersistentMessages();
    return;
  }
  errorState.activeTransient = true;
  applyAlertLevel(level);
  box.textContent = message;
  box.hidden = false;
}

function clearAppError(force = false) {
  const box = $('app-error');
  if (!box) return;
  if (!force && !errorState.activeTransient) return;
  errorState.activeTransient = false;
  if (force) errorState.persistentMessages = [];
  box.hidden = true;
  box.textContent = '';
  box.classList.remove('warn', 'info');
  if (!force) renderPersistentMessages();
}

function renderPersistentMessages() {
  const box = $('app-error');
  if (!box || !errorState.persistentMessages.length) return;
  const level = errorState.persistentMessages.some((entry) => entry.level === 'error')
    ? 'error'
    : errorState.persistentMessages.some((entry) => entry.level === 'warning')
      ? 'warning'
      : 'info';
  applyAlertLevel(level);
  box.textContent = errorState.persistentMessages.map((entry) => `• ${entry.message}`).join('\n');
  box.hidden = false;
}

function applyAlertLevel(level) {
  const box = $('app-error');
  if (!box) return;
  box.classList.remove('warn', 'info');
  if (level === 'warning') box.classList.add('warn');
  else if (level === 'info') box.classList.add('info');
}

function registerEventHandlers() {
  $('parseDocxBtn')?.addEventListener('click', onParseDocx);
  $('analyzeBtn')?.addEventListener('click', onAnalyzeText);
  $('selectAllBtn')?.addEventListener('click', () => { state.selectedIds = new Set(state.suggestions.map((s) => s.id)); renderIssues(); });
  $('selectNoneBtn')?.addEventListener('click', () => { state.selectedIds.clear(); renderIssues(); });
  $('applySelectedBtn')?.addEventListener('click', applySelected);
  $('exportDocxBtn')?.addEventListener('click', onExportDocx);
  $('searchInput')?.addEventListener('input', renderIssues);
  $('severityFilter')?.addEventListener('change', renderIssues);
}

document.addEventListener('DOMContentLoaded', async () => {
  state.correlationId = makeId();
  if ($('maxMb')) $('maxMb').textContent = String(MAX_MB);
  registerEventHandlers();
  await loadPlaybook();
});
