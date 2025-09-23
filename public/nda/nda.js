// NDA Reviewer (BETA) — entirely client-side.
// Uses ONLY the rules JSON derived from the Edgewater NDA Checklist.
// No network calls, no AI. All behavior is deterministic and explainable.

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
let LAST_TEXT_ORIGINAL = '';
let LAST_TEXT_LOWER = '';

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

  const { textOriginal, textLower } = await extractTextWithFallback(file, els.useOcr.checked);
  LAST_TEXT_ORIGINAL = textOriginal;
  LAST_TEXT_LOWER = textLower;

  els.original.textContent = textOriginal.slice(0, 50_000); // bounded preview

  const results = evaluate(textLower, RULES);
  renderChecklist(results);
  renderRedlines(results);
}

/* ------------------------- Extraction ------------------------- */

async function extractTextWithFallback(file, useOcr) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const ab = await file.arrayBuffer();

  if (ext === 'pdf') {
    const text = await readPdf(ab);
    if (text && text.trim().length > 40) return { textOriginal: text, textLower: normalize(text) };
    if (useOcr) {
      const textOcr = await ocrPdfPages(ab, 3); // first 3 pages for speed
      return { textOriginal: textOcr, textLower: normalize(textOcr) };
    }
    return { textOriginal: text, textLower: normalize(text) };
  }

  if (ext === 'docx') {
    const res = await window.mammoth.extractRawText({ arrayBuffer: ab });
    const text = (res?.value || '').trim();
    return { textOriginal: text, textLower: normalize(text) };
  }

  // .txt or fallback
  const text = new TextDecoder().decode(ab);
  return { textOriginal: text, textLower: normalize(text) };
}

// PDF.js text extraction
async function readPdf(arrayBuffer) {
  const { pdfjsLib } = window;
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out += content.items.map(i => i.str).join(' ') + '\n';
  }
  return out;
}

// OCR via PDF.js render → Tesseract (first N pages)
async function ocrPdfPages(arrayBuffer, numPages = 3) {
  const { pdfjsLib } = window;
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const max = Math.min(numPages, doc.numPages);
  let text = '';
  for (let p = 1; p <= max; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const { data: { text: t } } = await window.Tesseract.recognize(canvas, 'eng');
    text += t + '\n';
  }
  return text;
}

/* ------------------------- Rules Engine ------------------------- */

function normalize(s) {
  // Preserve indices: no space collapsing; lowercase, unify CRLF to LF, replace NBSP
  return (s || '').replace(/\r\n/g, '\n').replace(/\u00A0/g, ' ').toLowerCase();
}

function evaluate(textLower, rulesDoc) {
  const results = [];
  for (const rule of rulesDoc.rules) {
    const hits = findMatches(textLower, rule.detect);
    const status = computeStatus(textLower, rule, hits);
    const suggestions = buildSuggestions(rule, hits);
    results.push({ rule, hits, status, suggestions });
  }
  return results;
}

// returns [{start, end}]
function findMatches(textLower, detect) {
  if (!detect) return [];
  const windowChars = detect.window || 160;
  const matches = [];
  const anyPatterns = (detect.any || []).map(p => new RegExp(p, 'gi'));
  const nearPattern = detect.near ? new RegExp(detect.near, 'i') : null;

  for (const rx of anyPatterns) {
    for (const m of textLower.matchAll(rx)) {
      const idx = m.index ?? 0;
      const start = Math.max(0, idx - windowChars);
      const end = Math.min(textLower.length, idx + (m[0]?.length || 0) + windowChars);
      const chunkLower = textLower.slice(start, end);
      if (nearPattern) {
        nearPattern.lastIndex = 0;
        if (!nearPattern.test(chunkLower)) continue;
      }
      matches.push({ start, end });
    }
  }
  return matches;
}

function computeStatus(textLower, rule, hits) {
  const intent = rule.intent || 'must';

  if (rule.tests?.length) {
    const ok = rule.tests.every(t => runTest(textLower, t));
    return ok ? 'OK' : (intent === 'preferred' ? 'ATTENTION' : 'NEEDS REDLINE');
  }
  if (intent === 'forbid') {
    return hits.length ? 'NEEDS REDLINE' : 'OK';
  }
  if (intent === 'must') {
    if (rule.detect?.required === false) return 'OK';
    return hits.length ? 'OK' : 'NEEDS REDLINE';
  }
  return hits.length ? 'ATTENTION' : 'OK';
}

function runTest(textLower, test) {
  switch (test.type) {
    case 'mustIncludeAny':
      return test.patterns.some(p => new RegExp(p, 'i').test(textLower));
    case 'mustInclude':
      return test.patterns.every(p => new RegExp(p, 'i').test(textLower));
    case 'mustNotInclude':
      return test.patterns.every(p => !new RegExp(p, 'i').test(textLower));
    case 'termMonthsMax':
      return maxMonths(textLower) <= (test.max || 24);
    case 'termMonthsPreferred':
      return maxMonths(textLower) <= (test.preferred || 18);
    case 'jurisdictionPreferred':
      return /\b(illinois|new york|delaware)\b/i.test(textLower);
    default:
      return true;
  }
}

function maxMonths(textLower) {
  let max = 0;
  const monthNum = [...textLower.matchAll(/(\d+)\s*month/gi)].map(m => parseInt(m[1], 10));
  const yearNum = [...textLower.matchAll(/(\d+)\s*year/gi)].map(m => parseInt(m[1], 10) * 12);
  const twoYearsWords = /two\s*\(\s*2\s*\)\s*years|two\s*years/gi.test(textLower) ? [24] : [];
  const arr = monthNum.concat(yearNum, twoYearsWords);
  if (arr.length) max = Math.max(...arr);
  return max || 0;
}

function sliceOriginal(start, end) {
  return LAST_TEXT_ORIGINAL.slice(start, end);
}

function buildSuggestions(rule, hits) {
  const out = [];
  const dmp = new window.diff_match_patch();

  const tpl = (rule.position?.template || '').trim();
  if (rule.position?.action === 'delete' && hits.length) {
    for (const h of hits) {
      const original = sliceOriginal(h.start, h.end);
      out.push(renderDiff(`${rule.title} — delete clause`, dmp, original, ''));
    }
  } else if (rule.position?.action === 'replace_or_insert') {
    if (hits.length) {
      for (const h of hits) {
        const original = sliceOriginal(h.start, h.end);
        out.push(renderDiff(`${rule.title} — replace`, dmp, original, tpl));
      }
    } else if (tpl) {
      out.push(`<div class="item"><div class="heading">${escape(rule.title)} — insert</div><div><ins>${escape(tpl)}</ins></div></div>`);
    }
  } else if (rule.position?.action === 'find_replace') {
    const suggestions = rule.position.replacements || [];
    for (const { find, replace } of suggestions) {
      const rx = new RegExp(find, 'gi');
      let m;
      while ((m = rx.exec(LAST_TEXT_LOWER)) !== null) {
        const start = Math.max(0, m.index - 120);
        const end = Math.min(LAST_TEXT_ORIGINAL.length, m.index + m[0].length + 120);
        const original = sliceOriginal(start, end);
        const replaced = original.replace(new RegExp(find, 'gi'), replace);
        out.push(renderDiff(`${rule.title}: ${find} → ${replace}`, dmp, original, replaced));
        if (rx.lastIndex === m.index) rx.lastIndex++;
      }
    }
  } else if (rule.position?.action === 'limit_term') {
    const current = maxMonths(LAST_TEXT_LOWER);
    const maxAllowed = rule.position.maxMonths || 24;
    const preferred = rule.position.preferredMonths || 18;
    if (!current || current > maxAllowed) {
      const repl = `the term of this Agreement shall expire ${preferred} months from the date hereof`;
      const ctx = findContext(/(term|expire|duration|surviv)/i);
      out.push(renderDiff(`${rule.title} — limit to ${preferred} months (24 months max)`, dmp, ctx || '', repl));
    }
  } else if (rule.position?.action === 'jurisdiction_swap') {
    if (!/\billinois|new york|delaware\b/i.test(LAST_TEXT_LOWER)) {
      const ctx = findContext(/(governing law|jurisdiction|venue)/i);
      const tpl2 = 'the laws of the State of Delaware (without regard to conflict-of-laws principles)';
      out.push(renderDiff(`${rule.title} — swap to IL, NY, or DE`, dmp, ctx || '', tpl2));
    }
  }

  return out;
}

function findContext(rx) {
  const m = rx.exec(LAST_TEXT_LOWER);
  if (!m) return '';
  const i = m.index || 0;
  const start = Math.max(0, i - 160);
  const end = Math.min(LAST_TEXT_ORIGINAL.length, i + 240);
  return sliceOriginal(start, end);
}

function renderDiff(title, dmp, a, b) {
  const diffs = dmp.diff_main(a, b);
  dmp.diff_cleanupSemantic(diffs);
  const html = diffs.map(([op, data]) => {
    if (op === 0) return escape(data);
    if (op === -1) return `<del>${escape(data)}</del>`;
    if (op === 1) return `<ins>${escape(data)}</ins>`;
  }).join('');
  return `<div class="item"><div class="heading">${escape(title)}</div><div>${html}</div></div>`;
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

function renderRedlines(results) {
  els.redlines.innerHTML = results.flatMap(r => r.suggestions).join('')
    || '<div class="item"><div class="heading">No changes suggested</div></div>';
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
