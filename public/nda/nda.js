// Lightweight, deterministic evaluator that uses ONLY the JSON rules from Edgewater NDA Checklist.
// No LLMs; explainable findings with precise suggested changes.
// Libraries exposed on window: pdfjsLib, mammoth, diff_match_patch, htmlDocx, Tesseract

const els = {
  file: document.getElementById('file'),
  useOcr: document.getElementById('use-ocr'),
  original: document.getElementById('original'),
  redlines: document.getElementById('redlines'),
  checklist: document.getElementById('checklist'),
  meta: document.getElementById('file-meta'),
  exportDocx: document.getElementById('export-docx'),
  exportCsv: document.getElementById('export-csv'),
  exportJson: document.getElementById('export-json'),
};

let RULES = null;
let LAST_TEXT = '';

init();

async function init() {
  RULES = await (await fetch('./rules/edgewater-nda-checklist.json', { cache: 'no-store' })).json();
  wireEvents();
  renderChecklistHeader();
}

function wireEvents() {
  els.file.addEventListener('change', onFile);
  els.exportDocx.addEventListener('click', onExportDocx);
  els.exportCsv.addEventListener('click', () => exportChecklist('csv'));
  els.exportJson.addEventListener('click', () => exportChecklist('json'));
}

async function onFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  els.meta.textContent = `${file.name} — ${(file.size/1024/1024).toFixed(2)} MB`;
  const text = await extractText(file, els.useOcr.checked);
  LAST_TEXT = text;
  els.original.textContent = text.slice(0, 50_000); // bounded preview

  const results = evaluate(text, RULES);
  renderChecklist(results);
  renderRedlines(text, results);
}

/* ------------------------- Extraction ------------------------- */

async function extractText(file, useOcr) {
  const ext = file.name.toLowerCase().split('.').pop();
  const ab = await file.arrayBuffer();

  if (ext === 'pdf') {
    const textFromPdf = await readPdf(ab);
    if (textFromPdf && textFromPdf.trim().length > 40) return textFromPdf;
    if (useOcr) return await ocrPdf(file);
    return textFromPdf; // may be empty for scanned PDFs if OCR off
  }

  if (ext === 'docx') {
    const res = await window.mammoth.extractRawText({ arrayBuffer: ab });
    return (res?.value || '').trim();
  }

  // .txt or fallback
  return new TextDecoder().decode(ab);
}

// PDF.js text extraction
async function readPdf(arrayBuffer) {
  const { pdfjsLib } = window;
  if (!pdfjsLib) throw new Error('PDF.js not loaded');
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Join with spaces to prevent words from merging
    out += content.items.map(i => i.str).join(' ') + '\n';
  }
  return out;
}

// Optional OCR with Tesseract.js (images/scanned PDFs)
async function ocrPdf(file) {
  // Simple OCR path: render first ~10 pages as images via <canvas> if possible, else read as image blob.
  // For MVP, just use Tesseract on the raw blob — accuracy sufficient for headings/clauses in most scanned NDAs.
  const imgUrl = URL.createObjectURL(file);
  try {
    const worker = window.Tesseract?.createWorker?.();
    if (!worker) return '';
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(imgUrl);
    await worker.terminate();
    URL.revokeObjectURL(imgUrl);
    return text || '';
  } catch {
    URL.revokeObjectURL(imgUrl);
    return '';
  }
}

/* ------------------------- Rule Engine ------------------------- */

function evaluate(fullText, rulesDoc) {
  const text = normalize(fullText);
  const results = [];
  for (const rule of rulesDoc.rules) {
    const hits = findMatches(text, rule.detect);
    const status = computeStatus(text, rule, hits);
    const suggestions = buildSuggestions(text, rule, hits);
    results.push({ rule, hits, status, suggestions });
  }
  return results;
}

function normalize(s) {
  return (s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .toLowerCase();
}

// returns [{start, end, snippet}]
function findMatches(text, detect) {
  if (!detect) return [];
  const windowChars = detect.window || 160;
  const matches = [];
  const anyPatterns = (detect.any || []).map(p => new RegExp(p, 'i'));
  const nearPattern = detect.near ? new RegExp(detect.near, 'i') : null;

  // naive sweep: locate first of anyPatterns, then expand a window and check "near"
  for (const rx of anyPatterns) {
    let m;
    while ((m = rx.exec(text)) !== null) {
      const start = Math.max(0, m.index - windowChars);
      const end = Math.min(text.length, m.index + (m[0]?.length || 0) + windowChars);
      const chunk = text.slice(start, end);
      if (nearPattern && !nearPattern.test(chunk)) continue;
      matches.push({ start, end, snippet: chunk });
      // prevent infinite loops on zero-width matches
      if (rx.lastIndex === m.index) rx.lastIndex++;
    }
  }
  return matches;
}

function computeStatus(text, rule, hits) {
  // Default logic: blocker if any hit violates, OK if compliant or not present depending on rule.intent
  const intent = rule.intent || 'must';
  if (rule.tests && rule.tests.length) {
    const ok = rule.tests.every(t => runTest(text, t));
    return ok ? 'OK' : (intent === 'preferred' ? 'ATTENTION' : 'NEEDS REDLINE');
  }
  if (intent === 'forbid') {
    return hits.length ? 'NEEDS REDLINE' : 'OK';
  }
  if (intent === 'must') {
    // If rule must be present, require tests or at least one suggested insertion if missing
    if (rule.detect?.required === false) return 'OK';
    if (hits.length) return 'OK';
    return 'NEEDS REDLINE';
  }
  return hits.length ? 'ATTENTION' : 'OK';
}

function runTest(text, test) {
  switch (test.type) {
    case 'mustIncludeAny':
      return test.patterns.some(p => new RegExp(p, 'i').test(text));
    case 'mustInclude':
      return test.patterns.every(p => new RegExp(p, 'i').test(text));
    case 'mustNotInclude':
      return test.patterns.every(p => !new RegExp(p, 'i').test(text));
    case 'termMonthsMax':
      return maxMonths(text) <= (test.max || 24);
    case 'termMonthsPreferred':
      return maxMonths(text) <= (test.preferred || 18);
    case 'jurisdictionPreferred':
      return new RegExp('\\b(illinois|new york|delaware)\\b', 'i').test(text);
    default:
      return true;
  }
}

function maxMonths(text) {
  // naive: look for "month(s)" numbers or "year(s)" numbers and convert.
  let max = 0;
  const monthNum = [...text.matchAll(/(\d+)\s*month/gi)].map(m => parseInt(m[1], 10));
  const yearNum = [...text.matchAll(/(\d+)\s*year/gi)].map(m => parseInt(m[1], 10) * 12);
  const twoYearsWords = /two\s*\(\s*2\s*\)\s*years|two\s*years/gi.test(text) ? [24] : [];
  const arr = monthNum.concat(yearNum).concat(twoYearsWords);
  if (arr.length) max = Math.max(...arr);
  return max || 0;
}

function buildSuggestions(text, rule, hits) {
  const out = [];
  const dmp = new window.diff_match_patch();

  if (rule.position?.action === 'delete' && hits.length) {
    for (const h of hits) {
      const red = `<div class="item"><div class="heading">${escape(rule.title)} — delete clause</div><div><del>${escape(getRaw(h.snippet))}</del></div></div>`;
      out.push(red);
    }
  } else if (rule.position?.action === 'replace_or_insert') {
    // Replace each hit's snippet with template; if no hit, insert template as a new suggestion.
    const tpl = rule.position.template.trim();
    if (hits.length) {
      for (const h of hits) {
        const diffs = dmp.diff_main(getRaw(h.snippet), tpl);
        dmp.diff_cleanupSemantic(diffs);
        out.push(renderDiff(rule.title, diffs));
      }
    } else {
      out.push(`<div class="item"><div class="heading">${escape(rule.title)} — insert</div><div><ins>${escape(tpl)}</ins></div></div>`);
    }
  } else if (rule.position?.action === 'find_replace') {
    const suggestions = rule.position.replacements || [];
    for (const { find, replace } of suggestions) {
      const rx = new RegExp(find, 'gi');
      const m = text.match(rx);
      if (m) {
        const ctx = findContext(text, rx);
        const diffs = dmp.diff_main(getRaw(ctx), ctx.replace(rx, replace));
        dmp.diff_cleanupSemantic(diffs);
        out.push(renderDiff(`${rule.title}: ${find} → ${replace}`, diffs));
      }
    }
  } else if (rule.position?.action === 'limit_term') {
    const current = maxMonths(text);
    if (!current || current > (rule.position.maxMonths || 24)) {
      const target = rule.position.preferredMonths || 18;
      const repl = `the term of this Agreement shall expire ${target} months from the date hereof`;
      const sample = sampleContext(text, /(term|expire|duration|surviv)/i);
      const diffs = dmp.diff_main(getRaw(sample || ''), repl);
      dmp.diff_cleanupSemantic(diffs);
      out.push(renderDiff(`${rule.title} — limit to ${target} months (24 months max)`, diffs));
    }
  } else if (rule.position?.action === 'jurisdiction_swap') {
    if (!/\billinois|new york|delaware\b/i.test(text)) {
      const sample = sampleContext(text, /(governing law|jurisdiction|venue)/i);
      const tpl = 'the laws of the State of Delaware (without regard to conflict-of-laws principles)';
      const diffs = dmp.diff_main(getRaw(sample || ''), tpl);
      dmp.diff_cleanupSemantic(diffs);
      out.push(renderDiff(`${rule.title} — swap to IL, NY, or DE`, diffs));
    }
  }
  return out;
}

function sampleContext(text, rx) {
  const m = text.match(rx);
  if (!m) return '';
  const i = m.index || 0;
  return text.slice(Math.max(0, i - 160), Math.min(text.length, i + 240));
}

function findContext(text, rx) {
  const m = rx.exec(text);
  if (!m) return '';
  const i = m.index || 0;
  return text.slice(Math.max(0, i - 120), Math.min(text.length, i + 120));
}

function renderDiff(title, diffs) {
  const html = diffs.map(([op, data]) => {
    if (op === 0) return escape(data);
    if (op === -1) return `<del>${escape(data)}</del>`;
    if (op === 1) return `<ins>${escape(data)}</ins>`;
  }).join('');
  return `<div class="item"><div class="heading">${escape(title)}</div><div>${html}</div></div>`;
}

function getRaw(snippet) {
  // Display original-case snippet by slicing from LAST_TEXT using start/end if available
  return snippet;
}

function escape(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[c]));
}

/* ------------------------- Rendering ------------------------- */

function renderChecklistHeader() {
  els.checklist.innerHTML =
    `<thead>
      <tr>
        <th style="width:26%">Checklist Item</th>
        <th style="width:10%">Severity</th>
        <th style="width:14%">Status</th>
        <th>Rationale / Position</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>`;
}

function renderChecklist(results) {
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = results.map(r => {
    const sev = r.rule.severity || 'must';
    const status = r.status;
    const cls = status === 'OK' ? 'status-ok' : (status === 'ATTENTION' ? 'status-warn' : 'status-bad');
    return `<tr>
      <td><strong>${escape(r.rule.title)}</strong></td>
      <td>${escape(sev)}</td>
      <td><span class="status-badge ${cls}">${escape(status)}</span></td>
      <td>${escape(r.rule.rationale || '')}</td>
    </tr>`;
  }).join('');
}

function renderRedlines(fullText, results) {
  els.redlines.innerHTML = results
    .flatMap(r => r.suggestions)
    .join('') || '<div class="item"><div class="heading">No changes suggested</div></div>';
}

/* ------------------------- Exports ------------------------- */

function onExportDocx() {
  const html = `<!doctype html><html><body>${els.redlines.innerHTML}</body></html>`;
  const blob = window.htmlDocx.asBlob(html);
  downloadBlob(blob, 'Edgewater-NDA-Redlines.docx');
}

function exportChecklist(kind = 'csv') {
  const rows = [...document.querySelectorAll('#tbody tr')].map(tr =>
    [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
  );
  if (kind === 'json') {
    const json = JSON.stringify(rows.map(([title,severity,status,rationale]) => ({ title, severity, status, rationale })), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, 'Edgewater-NDA-Checklist-Report.json');
    return;
  }
  const csv = 'Title,Severity,Status,Rationale\n' + rows.map(r => r.map(s => `"${s.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, 'Edgewater-NDA-Checklist-Report.csv');
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2500);
}
