import { parsePdf, ocrPdf } from "./pdf-parser.js";
import { parseDocx, whenMammothReady } from "./docx-parser.js";
import { parseTxt } from "./txt-parser.js";
import { compilePlaybook, evaluate, riskLabel } from "./rules-engine.js";
import { buildRedlinesDoc } from "./docx-redline.js";

const els = {
  drop: document.getElementById("file-drop"),
  input: document.getElementById("file-input"),
  useOcr: document.getElementById("use-ocr"),
  analyze: document.getElementById("analyze-btn"),
  progress: document.getElementById("progress"),
  bar: document.getElementById("progress-bar"),
  text: document.getElementById("progress-text"),
  hint: document.getElementById("file-hint"),
  original: document.getElementById("original"),
  redlinesList: document.getElementById("redlines-list"),
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
  evaluation: null,
  playbook: null,
  compiled: null,
  meta: null,
};

const errorState = { persistentMessages: [], activeTransient: false };

function setBusy(b) { document.getElementById("app").setAttribute("aria-busy", String(b)); }
function showProgress(pct, msg) {
  els.progress.setAttribute("aria-hidden", "false");
  els.bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  els.text.textContent = msg || "";
}
function hideProgress(){ els.progress.setAttribute("aria-hidden", "true"); els.bar.style.width="0%"; els.text.textContent="Idle"; }

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
  if (force) {
    errorState.persistentMessages = [];
  }
  els.errorBox.hidden = true;
  els.errorBox.textContent = "";
  els.errorBox.classList.remove("warn", "info");
  if (!force) renderPersistentMessages();
}

function renderPersistentMessages() {
  if (!els.errorBox) return;
  if (!errorState.persistentMessages.length) return;
  const level = errorState.persistentMessages.some(entry => entry.level === "error")
    ? "error"
    : errorState.persistentMessages.some(entry => entry.level === "warning") ? "warning" : "info";
  applyAlertLevel(level);
  els.errorBox.textContent = errorState.persistentMessages.map(entry => `• ${entry.message}`).join("\n");
  els.errorBox.hidden = false;
}

function applyAlertLevel(level) {
  els.errorBox.classList.remove("warn", "info");
  if (level === "warning") els.errorBox.classList.add("warn");
  else if (level === "info") els.errorBox.classList.add("info");
}

function wireDrop() {
  els.drop.addEventListener("dragover", (e) => { e.preventDefault(); els.drop.classList.add("hover"); });
  els.drop.addEventListener("dragleave", () => els.drop.classList.remove("hover"));
  els.drop.addEventListener("drop", (e) => {
    e.preventDefault(); els.drop.classList.remove("hover");
    const f = [...e.dataTransfer.files || []][0]; if (f) els.input.files = e.dataTransfer.files;
  });
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`; const kb = bytes/1024; if (kb < 1024) return `${kb.toFixed(1)} KB`; const mb = kb/1024; return `${mb.toFixed(1)} MB`;
}

function ocrSupported() { return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined"; }
function formatError(err) { return err?.message || String(err || "Unknown error"); }

const PLAYBOOK_CACHE_KEY = "esp_playbook_cache_v2";

async function loadDefaultPlaybook() {
  // Versioned cache of compiled playbook metadata
  try {
    const cached = JSON.parse(localStorage.getItem(PLAYBOOK_CACHE_KEY) || "null");
    if (cached?.source) {
      state.playbook = cached.source;
      state.compiled = compilePlaybook(cached.source);
      els.playbookMeta.textContent = `Playbook: ${cached.source?.name || "Edgewater"} v${cached.source?.version || "—"} (cached)`;
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
    return pb;
  } catch (err) {
    console.error("Failed to load default playbook", err);
    showAppError("Failed to load the default Edgewater playbook. Refresh the page or check your connection.", { level: "warning", persistent: true });
    throw err;
  }
}

function sizeWarning(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    els.hint.textContent = `Large file (${humanSize(file.size)}). If scanned, enable OCR; processing may take longer.`;
  } else {
    els.hint.textContent = "";
  }
}

async function extract(file, useOcr) {
  const name = (file.name || "").toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isDocx = name.endsWith(".docx");
  const isTxt  = name.endsWith(".txt");
  if (!isPdf && !isDocx && !isTxt) {
    const err = new Error("Unsupported file type. Upload PDF, DOCX, or TXT files.");
    err.code = "UNSUPPORTED_FILE";
    throw err;
  }
  if (isPdf) {
    if (useOcr) {
      if (!ocrSupported()) throw new Error("OCR is unavailable in this browser.");
      let worker;
      try {
        worker = new Worker(new URL("../workers/ocr-worker.js", import.meta.url), { type: "module" });
      } catch (err) {
        throw new Error(`OCR worker failed to start: ${formatError(err)}`);
      }
      try {
        return await ocrPdf(file, worker, (p, msg) => showProgress(p, msg || "OCR…"));
      } catch (err) {
        throw new Error(`OCR failed: ${formatError(err)}`);
      }
    } else {
      const buf = await file.arrayBuffer();
      try {
        return await parsePdf(new Uint8Array(buf), (p) => showProgress(p, "Parsing PDF…"));
      } catch (err) {
        throw new Error(`PDF parsing failed: ${formatError(err)}`);
      }
    }
  }
  if (isDocx) {
    const buf = await file.arrayBuffer();
    try {
      return await parseDocx(new Uint8Array(buf), (p) => showProgress(p, "Parsing DOCX…"));
    } catch (err) {
      throw new Error(`DOCX parsing failed: ${formatError(err)}`);
    }
  }
  try {
    return await parseTxt(file, (p) => showProgress(p, "Reading TXT…"));
  } catch (err) {
    throw new Error(`TXT parsing failed: ${formatError(err)}`);
  }
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
function csvEscape(s){ s = String(s); return /[",\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function statusClass(s) { return s === "pass" ? "status-pass" : s === "fail" ? "status-fail" : "status-review"; }

function renderFilters(categories) {
  const values = [...categories].filter(Boolean);
  els.filterCategory.innerHTML = `<option value=\"\">All</option>` + values.sort().map(c => `<option>${escapeHtml(c)}</option>`).join("");
}

function renderTable(rows) {
  const q = (els.filterText.value || "").toLowerCase();
  const cat = els.filterCategory.value || "";
  const minS = Number(els.filterSeverity.value || 1);
  const blockersOnly = els.filterBlockers.checked;
  const show = rows.filter(r => {
    if (cat && r.category !== cat) return false;
    if (r.severity < minS) return false;
    if (blockersOnly && r.level !== "BLOCKER") return false;
    if (!q) return true;
    return [r.title, r.evidence?.text, r.recommendation, r.category, r.clause].some(v => String(v||"").toLowerCase().includes(q));
  });
  els.tableBody.innerHTML = show.map(r => `
    <tr>
      <td><span class="status-badge ${statusClass(r.status)}">${r.status}</span></td>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.clause || "")}</td>
      <td>${escapeHtml(r.title || "")}</td>
      <td>${r.severity}</td>
      <td>${escapeHtml(r.evidence?.text || "")}</td>
      <td>${escapeHtml(r.recommendation || "")}</td>
    </tr>`).join("");
}

function renderRedlines(rows) {
  els.redlinesList.innerHTML = rows.filter(r => r.status !== "pass").map(r => {
    return `<div class="item ${r.status}">
      <div><span class="status-badge ${statusClass(r.status)}">${r.status}</span> <strong>[${escapeHtml(r.category)}] ${escapeHtml(r.title)}</strong></div>
      ${r.evidence?.text ? `<div><em>Evidence:</em> ${escapeHtml(r.evidence.text)}</div>` : ""}
      ${r.recommendation ? `<div><em>Recommendation:</em> ${escapeHtml(r.recommendation)}</div>` : ""}
    </div>`;
  }).join("");
}

function exportCsv(rows, meta) {
  const header = ["filename","filesize","processedAt","processingMs","status","category","clause","title","severity","evidence","recommendation"];
  const body = rows.map(r => [meta.filename, meta.filesize, meta.processedAt, meta.processingMs, r.status, r.category, r.clause||"", r.title||"", r.severity, r.evidence?.text||"", r.recommendation||""]);
  const csv = [header, ...body].map(line => line.map(csvEscape).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), "nda-checklist.csv");
}
function exportJson(rows, meta) {
  downloadBlob(new Blob([JSON.stringify({ meta, items: rows }, null, 2)], { type: "application/json" }), "nda-checklist.json");
}
function downloadBlob(blob, name){
  try {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href:url, download:name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showAppError(`Download failed: ${formatError(err)}`);
    throw err;
  }
}

function updateRisk(evaluation) {
  els.riskScore.textContent = `${evaluation.risk.score} (${riskLabel(evaluation.risk.level)})`;
  els.riskPill.className = "pill " + (evaluation.risk.level === "HIGH" ? "bad" : evaluation.risk.level === "MEDIUM" ? "warn" : "good");
  els.riskPill.textContent = riskLabel(evaluation.risk.level);
}

function evaluateAndRender(){
  if (!state.compiled) {
    showAppError("No playbook loaded; unable to evaluate document.");
    return;
  }
  clearAppError();
  els.original.textContent = state.text || "(no text extracted)";
  let evaluation;
  try {
    evaluation = evaluate(state.text, state.compiled);
  } catch (err) {
    console.error("Evaluation failed", err);
    showAppError(`Checklist evaluation failed: ${formatError(err)}`);
    return;
  }
  state.evaluation = evaluation;
  renderFilters(new Set(evaluation.results.map(r => r.category)));
  renderTable(evaluation.results);
  renderRedlines(evaluation.results);
  updateRisk(evaluation);
  els.exportCsv.onclick = () => exportCsv(evaluation.results, state.meta);
  els.exportJson.onclick = () => exportJson(evaluation.results, state.meta);
  els.exportRedlines.onclick = async () => {
    try {
      setBusy(true); showProgress(0, "Building .docx…");
      const blob = await buildRedlinesDoc({ fullText: state.text, results: evaluation.results, meta: state.meta });
      downloadBlob(blob, "nda-redlines.docx");
    } catch (err) {
      console.error("DOCX export failed", err);
      showAppError(`Unable to export redlines: ${formatError(err)}`);
    } finally { setBusy(false); hideProgress(); }
  };
}

/**
 * Convert a small YAML subset into the JSON playbook format.
 * @param {string} y
 * @returns {{rules:Array}}
 */
function yamlToJson(y) {
  // Minimal YAML → JSON for simple lists/maps (playbooks). Not a full parser.
  const lines = y.split(/\r?\n/).filter(l => !/^\s*#/.test(l));
  const obj = { rules: [] }; let cur = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^rules:\s*$/.test(line)) continue;
    if (/^\s*-\s+id:/.test(line)) { if (cur) obj.rules.push(cur); cur = { id: line.replace(/^\s*-\s+id:\s*/, "").trim() }; continue; }
    const m = line.match(/^\s+([a-zA-Z0-9_]+):\s*(.*)$/); if (!m) continue;
    const [, k, v] = m;
    if (["require","forbid","patternsAny","antiPatternsAny","tags"].includes(k)) {
      cur[k] = cur[k] || [];
      if (v) cur[k].push(v);
    } else if (k === "category" || k === "clause" || k === "title" || k === "recommendation" || k === "level") {
      cur[k] = v;
    } else if (k === "severity") cur[k] = Number(v) || 5;
    else if (k === "when" || k === "failIf") {
      try { cur[k] = JSON.parse(v); } catch { cur[k] = v; }
    }
  }
  if (cur) obj.rules.push(cur);
  if (!obj.rules.length) throw new Error("No rules found in YAML playbook.");
  return obj;
}

async function run() {
  wireDrop();

  whenMammothReady()
    .then(() => {
      console.info("[NDA][DOCX] Mammoth ready for DOCX parsing");
      const diag = window["__ndaDiagnostics"] = window["__ndaDiagnostics"] || {};
      diag.docx = diag.docx || {};
      diag.docx.mammothReadyNotified = true;
    })
    .catch((err) => {
      console.error("Mammoth failed to load", err);
      showAppError("DOCX parsing is disabled because the Mammoth library did not load.", { level: "warning", persistent: true });
    });
  if (!ocrSupported()) {
    if (els.useOcr) {
      els.useOcr.checked = false;
      els.useOcr.disabled = true;
    }
    showAppError("OCR is unavailable in this browser; scanned PDFs will require native text.", { level: "warning", persistent: true });
  }

  try {
    await loadDefaultPlaybook();
  } catch {}

  const onFilter = () => state.evaluation && renderTable(state.evaluation.results);
  [els.filterText, els.filterCategory, els.filterSeverity, els.filterBlockers].forEach(el => el.addEventListener("input", onFilter));

  els.playbookSelect.addEventListener("change", async (e) => {
    if (e.target.value === "custom") {
      els.customPlaybook.click();
      return;
    }
    try {
      await loadDefaultPlaybook();
      if (state.evaluation) {
        renderFilters(new Set(state.evaluation.results.map(r => r.category)));
        renderTable(state.evaluation.results);
      }
    } catch {}
  });

  els.customPlaybook.addEventListener("change", async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const txt = await file.text();
      let pb;
      if (/\.(ya?ml)$/i.test(file.name)) pb = yamlToJson(txt);
      else pb = JSON.parse(txt);
      state.playbook = pb; state.compiled = compilePlaybook(pb);
      els.playbookMeta.textContent = `Playbook: ${pb.name || "Custom"} v${pb.version || "1.0"} (custom)`;
      if (state.text) { evaluateAndRender(); }
    } catch (err) {
      console.error("Custom playbook import failed", err);
      showAppError(`Unable to import playbook: ${formatError(err)}`);
    } finally {
      e.target.value = "";
    }
  });

  els.exportPlaybook.addEventListener("click", () => {
    if (!state.playbook) {
      showAppError("No playbook loaded to export.", { level: "warning" });
      return;
    }
    try {
      downloadBlob(new Blob([JSON.stringify(state.playbook, null, 2)], {type:"application/json"}), "playbook.json");
    } catch (err) {
      console.error("Playbook export failed", err);
      showAppError(`Unable to export playbook: ${formatError(err)}`);
    }
  });

  els.input.addEventListener("change", () => sizeWarning(els.input.files?.[0]));

  els.analyze.addEventListener("click", async () => {
    const file = els.input.files?.[0];
    if (!file) {
      showAppError("Select a file first.", { level: "warning" });
      return;
    }
    if (!state.compiled) {
      showAppError("Playbook not loaded yet; please retry after the page finishes loading.");
      return;
    }
    sizeWarning(file);
    try {
      clearAppError();
      setBusy(true); showProgress(2, "Starting…"); const t0 = performance.now();
      const textAndMeta = await extract(file, els.useOcr?.checked);
      hideProgress();
      state.text = textAndMeta.text || textAndMeta || "";
      state.meta = {
        filename: file.name, filesize: humanSize(file.size),
        processedAt: new Date().toISOString(),
        processingMs: Math.round(performance.now() - t0),
        pages: textAndMeta.pages || undefined
      };
      evaluateAndRender();
    } catch (err) {
      console.error("Analysis failed", err);
      showAppError(`Failed to analyze ${file.name}: ${formatError(err)}`);
    } finally { setBusy(false); hideProgress(); }
  });
}

run();
