/* NDA Reviewer v2 — browser UI glue
* - Uses window.NDAPolicyEngine from policyEngine.browser.js (deterministic, no network)
* - Calls Netlify Functions:
*   • /.netlify/functions/nda-parse-docx  (POST) -> { paragraphs, meta, notes }
*   • /.netlify/functions/nda-export-docx (POST) -> binary .docx (base64)
*   • /.netlify/functions/nda-telemetry   (POST) -> { ok:true }
*/
(function () {
const $ = (id) => document.getElementById(id);
const state = {
  correlationId: makeId(),
  paragraphs: [],
  originalText: '',
  suggestions: [],
  selectedIds: new Set(),
  proposedText: '',
  lastParsedDocxBase64: null,
  exportNotes: []
};

// Initialize limits
const MAX_MB = Number((window.NDA_ENV && window.NDA_ENV.MAX_DOCX_MB) || 5);
$('maxMb').textContent = String(MAX_MB);

// Wire up UI
$('parseDocxBtn').addEventListener('click', onParseDocx);
$('analyzeBtn').addEventListener('click', onAnalyzeText);
$('selectAllBtn').addEventListener('click', () => { state.selectedIds = new Set(state.suggestions.map(s => s.id)); renderIssues(); });
$('selectNoneBtn').addEventListener('click', () => { state.selectedIds.clear(); renderIssues(); });
$('applySelectedBtn').addEventListener('click', applySelected);
$('exportDocxBtn').addEventListener('click', onExportDocx);
$('searchInput').addEventListener('input', renderIssues);
$('severityFilter').addEventListener('change', renderIssues);

// Helpers
function makeId() {
  // simple 12-char base36 id
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}
function status(el, kind, text) {
  const e = $(el);
  e.className = `status ${kind}`;
  e.textContent = text;
}

async function onParseDocx() {
  const file = $('fileInput').files && $('fileInput').files[0];
  if (!file) { $('uploadStatus').textContent = 'Please choose a .docx file.'; return; }
  if (!file.name.toLowerCase().endsWith('.docx')) { $('uploadStatus').textContent = 'Only .docx files are allowed.'; return; }
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_MB) { $('uploadStatus').textContent = `File too large (${sizeMb.toFixed(2)} MB). Limit is ${MAX_MB} MB.`; return; }

  $('uploadStatus').textContent = 'Parsing...';
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
        base64
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      $('uploadStatus').textContent = `Error: ${data.error || resp.statusText}`;
      await sendTelemetry('parse_error', { error: data.error || resp.statusText });
      return;
    }
    state.paragraphs = data.paragraphs || [];
    state.originalText = state.paragraphs.join('\n\n');
    state.lastParsedDocxBase64 = base64;
    state.exportNotes = data.notes || [];
    $('textInput').value = state.originalText;
    $('originalView').textContent = state.originalText;
    $('proposedView').textContent = '';
    $('exportStatus').textContent = '—';
    $('exportDocxBtn').disabled = true;
    $('uploadStatus').textContent = `Parsed ${state.paragraphs.length} paragraphs${data.meta && data.meta.pages ? `, ~${data.meta.pages} pages` : ''}.`;
    await sendTelemetry('parse_ok', { paragraphs: state.paragraphs.length });
  } catch (e) {
    $('uploadStatus').textContent = 'Parsing failed. Please verify the file.';
    await sendTelemetry('parse_error', { error: String(e && e.message || e) });
  }
}

async function onAnalyzeText() {
  const text = $('textInput').value.trim();
  if (!text) { status('analysisStatus', 'bad', 'Please paste text or parse a .docx first.'); return; }
  status('analysisStatus', 'idle', 'Analyzing...');
  // Run deterministic local policy engine
  const engine = window.NDAPolicyEngine;
  const result = engine.analyze(text);
  state.suggestions = result.suggestions || [];
  state.selectedIds = new Set(state.suggestions.map(s => s.id)); // preselect all
  renderIssues();
  $('originalView').textContent = result.normalizedText;
  $('proposedView').textContent = '';
  state.originalText = result.normalizedText;
  status('analysisStatus', 'ok', `Found ${state.suggestions.length} suggestions.`);
  renderChecklist(result.checklistCoverage);
  await sendTelemetry('analyze_ok', { issues: state.suggestions.length });
}

function renderChecklist(cov) {
  const container = $('checklistView');
  while (container.firstChild) container.removeChild(container.firstChild);
  if (!cov) {
    container.textContent = '—';
    return;
  }
  const keys = Object.keys(cov).sort();
  if (keys.length === 0) {
    container.textContent = '—';
    return;
  }
  keys.forEach(key => {
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
  const q = $('searchInput').value.toLowerCase();
  const sev = $('severityFilter').value;
  const list = $('issues');
  while (list.firstChild) list.removeChild(list.firstChild);
  const filtered = state.suggestions.filter(s => {
    const hit = s.clauseType.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || s.rationale.toLowerCase().includes(q);
    const passSev = sev === 'all' ? true : s.severity >= Number(sev);
    return hit && passSev;
  });
  const frag = document.createDocumentFragment();
  filtered.forEach(s => {
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
      if (e.target.checked) {
        state.selectedIds.add(id);
      } else {
        state.selectedIds.delete(id);
      }
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
    proposalCode.textContent = s.proposal.replacement || '';
    proposal.appendChild(proposalLabel);
    proposal.appendChild(proposalCode);
    detailsCell.appendChild(proposal);

    row.appendChild(detailsCell);

    const deltaCell = document.createElement('div');
    deltaCell.className = 'small';
    deltaCell.textContent = s.delta && s.delta.summary ? s.delta.summary : '';
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

function applySelected() {
  const selected = state.suggestions.filter(s => state.selectedIds.has(s.id));
  const applied = window.NDAPolicyEngine.apply(state.originalText, selected);
  state.proposedText = applied.text;
  $('proposedView').innerHTML = applied.htmlDiff;
  $('exportDocxBtn').disabled = !state.lastParsedDocxBase64 || selected.length === 0;
  $('exportStatus').textContent = selected.length === 0 ? 'Select at least one suggestion.' : `Ready to export ${selected.length} change(s).`;
}

function previewOne(id) {
  const s = state.suggestions.find(x => x.id === id);
  if (!s) return;
  const applied = window.NDAPolicyEngine.apply(state.originalText, [s]);
  $('proposedView').innerHTML = applied.htmlDiff;
}

async function onExportDocx() {
  try {
    $('exportStatus').textContent = 'Exporting...';
    const selected = state.suggestions.filter(s => state.selectedIds.has(s.id));
    if (!state.lastParsedDocxBase64) {
      $('exportStatus').textContent = 'No .docx uploaded/parsed. Upload a .docx first.';
      return;
    }
    const resp = await fetch('/.netlify/functions/nda-export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlationId: state.correlationId,
        base64: state.lastParsedDocxBase64,
        edits: selected,
        author: 'EdgeScraperPro',
        tz: 'America/Chicago'
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      $('exportStatus').textContent = `Export failed: ${err.error || resp.statusText}`;
      await sendTelemetry('export_error', { error: err.error || resp.statusText });
      return;
    }
    const data = await resp.json();
    const b64 = data.base64;
    const blob = base64ToBlob(b64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || 'nda-redlines.docx';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    $('exportStatus').textContent = 'Exported .docx with tracked changes.';
    await sendTelemetry('export_ok', { edits: selected.length, skipped: (data.skipped || []).length });
  } catch (e) {
    $('exportStatus').textContent = 'Export failed.';
    await sendTelemetry('export_error', { error: String(e && e.message || e) });
  }
}

async function sendTelemetry(event, payload) {
  try {
    await fetch('/.netlify/functions/nda-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correlationId: state.correlationId, event, payload })
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
  const binary = atob(b64); const len = binary.length; const bytes = new Uint8Array(len);
  for (let i=0;i<len;i++) bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
})();
