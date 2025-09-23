import { extractContext } from "./context-extractor.js";

const patternCache = new Map();
const PATTERN_CACHE_LIMIT = 128;
const contextCache = new Map();
const CONTEXT_CACHE_LIMIT = 3;

/**
 * Playbook model:
 * {
 *   name, version,
 *   rules: [{
 *     id, clause, title,
 *     category: "Governing Law",
 *     level: "BLOCKER" | "WARN" | "INFO",
 *     severity: 1..10,
 *     require: [string|/regex/i], // all listed must match somewhere (presence)
 *     forbid:  [string|/regex/i], // any match => fail (forbidden)
 *     when:   {...},              // JSON-logic-ish predicate (var/all/any/eq/ne/in/contains)
 *     failIf: {...},              // JSON-logic-ish predicate; if true => fail
 *     recommendation: "..."
 *   }]
 * }
 */
/**
 * Compile the raw playbook into evaluation-ready rules.
 * @param {any} playbook
 * @returns {{ meta: { name?: string, version?: string }, rules: Array }}
 */
export function compilePlaybook(playbook) {
  const compiledRules = (playbook.rules || []).map(r => ({
    id: r.id || r.title,
    clause: r.clause || "",
    title: r.title || r.id || "",
    category: r.category || "General",
    level: (r.level || "WARN").toUpperCase(),
    severity: Number(r.severity || 5),
    require: (r.require || r.patternsAny || []).map(compilePattern).filter(Boolean),
    forbid:  (r.forbid  || r.antiPatternsAny || []).map(compilePattern).filter(Boolean),
    when: r.when || null,
    failIf: r.failIf || null,
    recommendation: r.recommendation || r.suggestion || ""
  }));
  return { meta: { name: playbook.name, version: playbook.version }, rules: compiledRules };
}

/**
 * Evaluate extracted document text against a compiled playbook.
 * @param {string} fullText
 * @param {{rules:Array}} compiled
 * @returns {{results:Array, risk:{score:number, level:string, blockers:number, warns:number}}}
 */
export function evaluate(fullText, compiled) {
  const context = { context: getContext(fullText) };
  const results = [];

  for (const rule of compiled.rules) {
    // Evaluate applicability
    if (rule.when && !truthy(evalLogic(rule.when, context))) {
      results.push(baseResult(rule, "review", null)); // not applicable → recommend human glance
      continue;
    }

    let status = "pass";
    let firstEvidence = null;

    // Presence requirements
    if (rule.require && rule.require.length) {
      for (const rx of rule.require) {
        const m = firstMatch(rx, fullText);
        if (!m) { status = "fail"; break; }
        if (!firstEvidence) firstEvidence = m;
      }
    }

    // Forbidden patterns
    if (status === "pass" && rule.forbid && rule.forbid.length) {
      for (const rx of rule.forbid) {
        const m = firstMatch(rx, fullText);
        if (m) { status = "fail"; if (!firstEvidence) firstEvidence = m; break; }
      }
    }

    // Contextual predicate
    if (status === "pass" && rule.failIf && truthy(evalLogic(rule.failIf, context))) {
      status = "fail";
    }

    // If a rule has no checks at all, mark as REVIEW to prompt human attention
    if (!rule.require.length && !rule.forbid.length && !rule.failIf && !rule.when) {
      status = "review";
    }

    const evidence = firstEvidence ? extractEvidence(fullText, firstEvidence) : null;
    results.push({
      id: rule.id, clause: rule.clause, title: rule.title,
      category: rule.category, level: rule.level, severity: rule.severity,
      status, recommendation: rule.recommendation,
      evidence
    });
  }

  const risk = rollup(results);
  return { results, risk };
}

function baseResult(rule, status, evidence) {
  return {
    id: rule.id, clause: rule.clause, title: rule.title,
    category: rule.category, level: rule.level, severity: rule.severity,
    status, recommendation: rule.recommendation, evidence
  };
}

/**
 * Summarise risk for the evaluated rules.
 * @param {Array} items
 * @returns {{score:number, level:string, blockers:number, warns:number}}
 */
function rollup(items) {
  let score = 0, blockers = 0, warns = 0;
  for (const r of items) {
    if (r.status === "fail") {
      score += r.severity;
      if (r.level === "BLOCKER") blockers++; else if (r.level === "WARN") warns++;
    }
  }
  const level = score >= 20 || blockers >= 1 ? "HIGH" : score >= 10 || warns >= 2 ? "MEDIUM" : "LOW";
  return { score, level, blockers, warns };
}

export function riskLabel(level) { return level === "HIGH" ? "HIGH" : level === "MEDIUM" ? "MEDIUM" : "LOW"; }

// ---------- pattern helpers ----------
function compilePattern(p) {
  if (p == null) return null;
  const key = typeof p === "string" ? `s:${p}` : `r:${p}`;
  if (patternCache.has(key)) return patternCache.get(key);
  if (typeof p === "string") {
    const m = p.match(/^\/(.+)\/([gimsuy]*)$/);
    const base = m ? new RegExp(m[1], m[2] || "i") : new RegExp(escapeRegExp(p), "i");
    const flags = base.flags.includes("g") ? base.flags : base.flags + "g";
    const final = new RegExp(base.source, flags);
    rememberPattern(key, final);
    return final;
  }
  if (p instanceof RegExp) {
    const flags = p.flags.includes("g") ? p.flags : p.flags + "g";
    const final = new RegExp(p.source, flags);
    rememberPattern(key, final);
    return final;
  }
  const fallback = new RegExp(String(p), "ig");
  rememberPattern(key, fallback);
  return fallback;
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function firstMatch(rx, text) {
  if (!rx) return null;
  rx.lastIndex = 0;
  const m = rx.exec(text);
  return m ? { index: m.index, match: m[0] } : null;
}

// ---------- evidence extraction ----------
function extractEvidence(fullText, m) {
  const idx = Math.max(0, m.index || 0);
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const seg = new Intl.Segmenter("en", { granularity: "sentence" });
    const segments = [...seg.segment(fullText)];
    let current = segments.find(s => idx >= s.index && idx < s.index + s.segment.length);
    if (!current && segments.length) current = segments[0];
    const i = segments.indexOf(current);
    const prev = segments[i - 1]; const next = segments[i + 1];
    const context = [prev?.segment, current?.segment, next?.segment].filter(Boolean).join(" ").trim();
    return { text: trimLen(context, 320), index: current?.index ?? idx };
  } else {
    // Fallback: nearest sentence by punctuation
    let start = fullText.lastIndexOf(".", idx); if (start < 0) start = fullText.lastIndexOf("?", idx); if (start < 0) start = fullText.lastIndexOf("!", idx);
    let end = fullText.indexOf(".", idx); if (end < 0) end = fullText.indexOf("?", idx); if (end < 0) end = fullText.indexOf("!", idx);
    if (start < 0) start = Math.max(0, idx - 200); if (end < 0) end = Math.min(fullText.length, idx + 200);
    const snippet = fullText.slice(start, end + 1);
    return { text: trimLen(snippet, 320), index: start };
  }
}
function trimLen(s, n){ s = String(s).replace(/\s+/g," ").trim(); return s.length>n ? s.slice(0,n-1)+"…" : s; }

// ---------- JSON-logic-ish evaluator ----------
function evalLogic(node, scope) {
  if (node == null) return false;
  if (typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(n => evalLogic(n, scope));
  if ("var" in node) return get(scope, node.var);
  if ("all" in node) return (node.all || []).every(n => truthy(evalLogic(n, scope)));
  if ("any" in node) return (node.any || []).some(n => truthy(evalLogic(n, scope)));
  if ("eq" in node)  { const [a,b]=node.eq; return asVal(evalLogic(a, scope)) === asVal(evalLogic(b, scope)); }
  if ("ne" in node)  { const [a,b]=node.ne; return asVal(evalLogic(a, scope)) !== asVal(evalLogic(b, scope)); }
  if ("in" in node)  { const [a,arr]=node.in; const v = asVal(evalLogic(a,scope)); const list = evalLogic(arr,scope); return Array.isArray(list) ? list.includes(v) : String(list||"").includes(String(v)); }
  if ("contains" in node){ const [arr,val]=node.contains; const list = evalLogic(arr,scope); const v = asVal(evalLogic(val,scope)); return Array.isArray(list) ? list.includes(v) : String(list||"").toLowerCase().includes(String(v).toLowerCase()); }
  return false;
}
function get(obj, path) {
  const parts = String(path || "").split(".");
  let cur = obj; for (const p of parts) { if (!cur) return undefined; cur = cur[p]; }
  return cur;
}
function asVal(v){ return Array.isArray(v) ? v : (v && typeof v === "object" ? JSON.stringify(v) : v); }
function truthy(v){ return !!v; }

function rememberPattern(key, value) {
  if (patternCache.size >= PATTERN_CACHE_LIMIT) {
    const oldest = patternCache.keys().next().value;
    if (oldest) patternCache.delete(oldest);
  }
  patternCache.set(key, value);
}

function getContext(fullText) {
  const key = fullText || "";
  if (contextCache.has(key)) return contextCache.get(key);
  const ctx = extractContext(fullText);
  if (contextCache.size >= CONTEXT_CACHE_LIMIT) {
    const firstKey = contextCache.keys().next().value;
    contextCache.delete(firstKey);
  }
  contextCache.set(key, ctx);
  return ctx;
}
