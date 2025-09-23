// pdf.js worker
const PDFJS_WORKER_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.js';

// DOM
const els = {
  file: document.getElementById('file'),
  useOCR: document.getElementById('use-ocr'),
  original: document.getElementById('original'),
  redlines: document.getElementById('redlines'),
  checklistBody: document.querySelector('#checklist tbody'),
  exportCsv: document.getElementById('export-csv'),
  exportJson: document.getElementById('export-json'),
  exportDocx: document.getElementById('export-docx'),
};

let lastResults = null;
let lastText = '';

els.file.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  resetUI();

  const { text, meta } = await readFileToText(file, els.useOCR.checked);
  lastText = text;
  els.original.textContent = text.slice(0, 50000);

  const rules = await loadRules();
  lastResults = evaluate(text, rules);

  renderChecklist(lastResults);
  renderRedlines(text, lastResults);
  console.info('[NDA] parsed:', meta);
});

els.exportCsv?.addEventListener('click', () => {
  if (!lastResults) return;
  const csv = toCSV(lastResults);
  downloadBlob(new Blob([csv], { type: 'text/csv' }), 'Edgewater-NDA-Checklist.csv');
});

els.exportJson?.addEventListener('click', () => {
  if (!lastResults) return;
  downloadBlob(new Blob([JSON.stringify(lastResults, null, 2)], { type: 'application/json' }), 'Edgewater-NDA-Checklist.json');
});

els.exportDocx?.addEventListener('click', () => {
  const html = `<!doctype html><html><body>${els.redlines.innerHTML}</body></html>`;
  const blob = window.htmlDocx.asBlob(html);
  downloadBlob(blob, 'Edgewater-NDA-Redlines.docx');
});

// ---------- File ingest ----------
async function readFileToText(file, allowOCR) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    const text = await parsePdf(file);
    if (text.trim().length > 50) return { text, meta: { kind: 'pdf', ocr: false } };
    if (allowOCR) return { text: await ocrPdf(file), meta: { kind: 'pdf', ocr: true } };
    return { text: text || '[No extractable text found. Try enabling OCR.]', meta: { kind: 'pdf', ocr: false } };
  }
  if (ext === 'docx') {
    const ab = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: ab });
    return { text: result.value || '', meta: { kind: 'docx' } };
  }
  const raw = await file.text();
  return { text: raw, meta: { kind: 'text' } };
}

async function parsePdf(file) {
  const bytes = await file.arrayBuffer();
  const pdfjsLib = window['pdfjs-dist/build/pdf'] || window['pdfjsLib'] || window.pdfjsLib;
  if (!pdfjsLib) throw new Error('pdf.js not loaded');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map(i => (i.str || '')).join(' ') + '\n';
  }
  return text;
}

// MVP OCR stub (render-to-canvas + Tesseract in follow-up)
async function ocrPdf(file) {
  console.warn('[NDA] OCR for PDFs is a follow-up task; returning placeholder.');
  return '[OCR placeholder: implement rendering each page to canvas and pass each image to Tesseract.recognize(...)]';
}

// ---------- Rules & evaluation ----------
async function loadRules() {
  const res = await fetch('./rules/edgewater-nda-checklist.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load rules JSON');
  return res.json();
}

function evaluate(text, rules) {
  const lower = text.toLowerCase();
  return rules.rules.map(r => {
    const hit = matchRule(lower, r.detect);
    const check = runChecks(lower, r);
    const status = decideStatus(r, hit, check);
    const snippet = firstSnippet(lower, r, 200);
    const suggestion = r.position?.template || '';
    return {
      id: r.id,
      title: r.title,
      severity: r.severity,
      status, rationale: r.rationale || '',
      snippet, suggestion, source: r.source || 'Edgewater NDA Checklist'
    };
  });
}

function matchRule(lower, detect) {
  if (!detect) return true; // rules that always apply
  const anyOk = (detect.any || []).some(rx => new RegExp(rx, 'i').test(lower));
  if (!anyOk) return false;
  if (detect.near) return new RegExp(detect.near, 'i').test(lower);
  return true;
}

// Simple duration extractor: "18 months", "2 years"
function extractDurations(lower) {
  const out = [];
  const rx = /(\d{1,3})\s*(month|months|year|years)/g;
  let m;
  while ((m = rx.exec(lower))) {
    const n = parseInt(m[1], 10);
    const months = m[2].startsWith('year') ? (n * 12) : n;
    out.push(months);
  }
  return out;
}

function runChecks(lower, rule) {
  const res = { ok: true, reasons: [], preferred: true };
  if (!rule.checks) return res;

  for (const c of rule.checks) {
    if (c.type === 'duration') {
      const months = extractDurations(lower);
      if (months.length === 0) { res.ok = false; res.reasons.push('duration missing'); continue; }
      const max = c.maxMonths ?? 999;
      const pref = c.preferredMonths ?? null;
      const tooLong = months.some(m => m > max);
      if (tooLong) { res.ok = false; res.reasons.push(`duration > ${max} months`); }
      if (pref != null) {
        const anyPref = months.some(m => m <= pref);
        if (!anyPref) res.preferred = false;
      }
    }
    if (c.type === 'mustIncludeAny') {
      const ok = c.patterns.some(p => new RegExp(p, 'i').test(lower));
      if (!ok) { res.ok = false; res.reasons.push('missing required variant'); }
    }
    if (c.type === 'mustIncludeAll') {
      const ok = c.patterns.every(p => new RegExp(p, 'i').test(lower));
      if (!ok) { res.ok = false; res.reasons.push('missing required terms'); }
    }
    if (c.type === 'disallow') {
      const bad = c.patterns.some(p => new RegExp(p, 'i').test(lower));
      if (bad) { res.ok = false; res.reasons.push('contains disallowed term'); }
    }
  }
  return res;
}

function decideStatus(rule, hit, check) {
  if (!hit) return '⚠️ Attention';
  if (!check.ok) return '❗ Needs Redline';
  if (rule.severity === 'blocker') return '❗ Needs Redline';
  if (rule.severity === 'must') return check.preferred ? '✅ Compliant' : '⚠️ Attention';
  return '✅ Compliant';
}

function firstSnippet(lower, rule, radius = 160) {
  const patterns = (rule.detect?.any || []).map(s => new RegExp(s, 'i'));
  for (const rx of patterns) {
    const m = rx.exec(lower);
    if (m && m.index != null) {
      const start = Math.max(0, m.index - radius);
      const end = Math.min(lower.length, m.index + m[0].length + radius);
      return lower.slice(start, end);
    }
  }
  return '';
}

// ---------- Redlines ----------
function makeRedline(originalSnippet, suggestedText) {
  if (!suggestedText) return escapeHtml(originalSnippet);
  const dmp = new window.diff_match_patch();
  const diffs = dmp.diff_main(originalSnippet, suggestedText);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, data]) => {
    if (op === 0) return escapeHtml(data);
    if (op === -1) return `<del>${escapeHtml(data)}</del>`;
    if (op === 1) return `<ins>${escapeHtml(data)}</ins>`;
  }).join('');
}

// ---------- Renderers ----------
function renderChecklist(results) {
  els.checklistBody.innerHTML = '';
  for (const r of results) {
    const tr = document.createElement('tr');
    const statusClass = r.status.includes('✅') ? 'status-ok'
                      : r.status.includes('❗') ? 'status-block'
                      : 'status-attn';
    tr.innerHTML = `
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.severity)}</td>
      <td class="${statusClass}">${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.rationale)}</td>`;
    els.checklistBody.appendChild(tr);
  }
}

function renderRedlines(fullText, results) {
  const out = [];
  for (const r of results) {
    if (!r.snippet) continue;
    const redlined = makeRedline(r.snippet, r.suggestion);
    out.push(`
      <div class="redline-item">
        <h4>${escapeHtml(r.title)} — ${escapeHtml(r.status)}</h4>
        <div class="two-col">
          <div><strong>Original</strong><pre>${escapeHtml(r.snippet)}</pre></div>
          <div><strong>Suggested</strong><div class="redlines">${redlined}</div></div>
        </div>
      </div>
    `);
  }
  els.redlines.innerHTML = out.join('\n');
}

// ---------- Utils ----------
function escapeHtml(s=''){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function toCSV(rows) {
  const hdr = ['id','title','severity','status','rationale'];
  const lines = [hdr.join(',')];
  for (const r of rows) {
    const vals = [r.id, r.title, r.severity, r.status, r.rationale].map(v => `"${(v||'').replace(/"/g,'""')}"`);
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}
function resetUI(){
  els.original.textContent = '';
  els.redlines.innerHTML = '';
  els.checklistBody.innerHTML = '';
}
