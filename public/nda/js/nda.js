import { compilePlaybook, evaluate, riskLabel } from "./rules-engine.js";
import { buildRedlinesDoc } from "./docx-redline.js";

const els = {
  textInput: document.getElementById("nda-text-input"),
  analyze: document.getElementById("analyze-btn"),
  progress: document.getElementById("progress"),
  bar: document.getElementById("progress-bar"),
  text: document.getElementById("progress-text"),
  stats: document.getElementById("text-stats"),
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

function setBusy(b) { document.getElementById("app").setAttribute("aria-busy", String(b)); }
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

function formatError(err) { return err?.message || String(err || "Unknown error"); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
function csvEscape(s){ s = String(s); return /[",\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }
function statusClass(s) { return s === "pass" ? "status-pass" : s === "fail" ? "status-fail" : "status-review"; }

const PLAYBOOK_CACHE_KEY = "esp_playbook_cache_v2";

async function loadDefaultPlaybook() {
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
    showAppError("Failed to load the default Edgewater playbook. Refresh the page.", { level: "warning", persistent: true });
    throw err;
  }
}

function renderFilters(categories) {
  const values = [...categories].filter(Boolean);
  els.filterCategory.innerHTML = '<option value="">All</option>' + values.sort().map(c => `<option>${escapeHtml(c)}</option>`).join("");
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
  const header = ["source","charactersAnalyzed","processedAt","processingMs","status","category","clause","title","severity","evidence","recommendation"];
  const body = rows.map(r => ["text_input", meta.charactersAnalyzed, meta.processedAt, meta.processingMs, r.status, r.category, r.clause||"", r.title||"", r.severity, r.evidence?.text||"", r.recommendation||""]);
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
  }
}

function updateRisk(evaluation) {
  els.riskScore.textContent = `${evaluation.risk.score} (${riskLabel(evaluation.risk.level)})`;
  els.riskPill.className = "pill " + (evaluation.risk.level === "HIGH" ? "bad" : evaluation.risk.level === "MEDIUM" ? "warn" : "good");
  els.riskPill.textContent = riskLabel(evaluation.risk.level);
}

function evaluateAndRender() {
  if (!state.compiled) {
    showAppError("No playbook loaded; unable to evaluate document.");
    return;
  }
  clearAppError();
  els.original.textContent = state.text || "(no text provided)";
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

async function run() {
  try {
    await loadDefaultPlaybook();
  } catch {}

  els.textInput.addEventListener("input", updateTextStats);
  updateTextStats();

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
      if (state.text) evaluateAndRender();
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
      showAppError(`Unable to export playbook: ${formatError(err)}`);
    }
  });

  els.analyze.addEventListener("click", async () => {
    const rawText = els.textInput.value.trim();
    if (!rawText) {
      showAppError("Please paste NDA text to analyze.", { level: "warning" });
      return;
    }
    if (!state.compiled) {
      showAppError("Playbook not loaded yet; please retry after the page finishes loading.");
      return;
    }
    try {
      clearAppError();
      setBusy(true); 
      showProgress(50, "Analyzing text...");
      const t0 = performance.now();
      state.text = sanitizeText(rawText);
      state.meta = {
        source: "text_input",
        charactersAnalyzed: state.text.length,
        processedAt: new Date().toISOString(),
        processingMs: Math.round(performance.now() - t0)
      };
      evaluateAndRender();
      showProgress(100, "Complete");
      setTimeout(hideProgress, 500);
    } catch (err) {
      console.error("Analysis failed", err);
      showAppError(`Failed to analyze text: ${formatError(err)}`);
    } finally { 
      setBusy(false); 
    }
  });
}

run();
