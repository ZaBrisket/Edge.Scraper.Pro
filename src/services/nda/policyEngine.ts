import { AnalyzeResult, Suggestion } from "./types";
import checklist from "./data/edgewaterChecklist.json";

function normalize(s: string): string {
return s.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\u00A0/g, " ").trim();
}
function segment(text: string): string[] {
return normalize(text).split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}
function lc(s: string): string {
return normalize(s.toLowerCase()).replace(/[“”]/g, '"').replace(/[’]/g, "'");
}
function detectTermMonths(text: string): number | null {
const m = lc(text).match(/(\d+)\s*(month|months|mo\.?|year|years|yr\.?)/);
if (!m) return null;
let n = parseInt(m[1], 10);
const unit = m[2];
if (unit.startsWith('year') || unit.startsWith('yr')) n = n * 12;
return n;
}
const preferredJurisdictions = (checklist as any).preferredJurisdictions.map((j: string) => j.toLowerCase());
const burdensomeMarkers: string[] = (checklist as any).burdensomeMarkers;

function scoreBurdensomeness(p: string): number {
let score = 0;
const text = lc(p);
const months = detectTermMonths(p);
if (months && months > 24) score += Math.min(40, (months - 24));
burdensomeMarkers.forEach(m => { if (text.includes(m)) score += 10; });
if (text.includes("confidential information") && /(publicly available|independently developed|nonconfidential basis)/.test(text) === false) score += 25;
if (/governing law|jurisdiction|venue/.test(text)) {
  if (!preferredJurisdictions.some(j => text.includes(j))) score += 20;
}
return Math.max(0, Math.min(score, 100));
}

function materiallyEquivalentCarveouts(p: string): boolean {
const t = lc(p);
const bullets = [/publicly available/, /known to us prior|known.*prior/, /independently developed/, /nonconfidential basis/];
return bullets.every(rx => rx.test(t));
}

function propose(p: string, idx: number): Suggestion[] {
const t = lc(p);
const out: Suggestion[] = [];
const push = (s: Omit<Suggestion, "id" | "paragraphIndex" | "severity">) => {
  const id = `${idx+1}-${Math.abs(hash((s.title + s.clauseType + s.proposal.operation + s.proposal.replacement).slice(0, 96))).toString(36)}`;
  const severity = scoreBurdensomeness(p);
  out.push({ ...s, id, paragraphIndex: idx, severity });
};

// Customer/Supplier non-solicit
if (/non-?solicit/.test(t) && /(customer|supplier)/.test(t)) {
  push({
    clauseType: "Customer/Supplier Non-Solicit",
    title: "Remove customer/supplier non-solicit",
    rationale: "Checklist says to exclude customer/supplier non-solicit.",
    delta: { summary: "Remove clause per checklist" },
    proposal: { operation: "delete", target: p, replacement: "" }
  });
}
// Employee non-solicit
if (/non-?solicit/.test(t) && /(employee|personnel|staff)/.test(t)) {
  let rationale = "Limit to key executives and include carve-outs (unsolicited applicants, prior discussions, public ads, prior termination).";
  const replacement =
    p.replace(/all employees|any employee/ig, "key executives")
     + "\n\nNothing herein shall prevent you from hiring such person(s) who (i) initiate discussions without direct solicitation, (ii) had prior discussions, (iii) respond to public advertisements, or (iv) were terminated by the Company before discussions.";
  push({
    clauseType: "Employee Non-Solicit",
    title: "Limit employee non-solicit + add carve-outs",
    rationale,
    delta: { summary: "Scope limited to executives; added carve-outs" },
    proposal: { operation: "replace", target: p, replacement }
  });
}
// Term
if (/term\b/.test(t) || /this agreement shall remain/.test(t)) {
  const months = detectTermMonths(p);
  if (!months) {
    push({
      clauseType: "Term",
      title: "Add explicit term (≤ 24 months)",
      rationale: "Checklist requires explicit term not exceeding two years.",
      delta: { summary: "Add 24-month cap" },
      proposal: { operation: "insert", target: "", replacement: "The term of this Agreement shall be twenty-four (24) months." }
    });
  } else if (months > 24) {
    const replacement = p.replace(/(\d+)\s*(year|years|yr\.?|month|months)/i, "24 months");
    push({
      clauseType: "Term",
      title: "Reduce term to ≤ 24 months",
      rationale: `Term appears ~${months} months; checklist cap is 24 months.`,
      delta: { summary: `Reduce term from ~${months} to 24 months` },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
}
// Return or destroy
if (/return.*(documents|materials)/.test(t) && !/destroy/.test(t)) {
  const replacement = p.replace(/return/ig, "return or destroy")
    + "\n\nHowever, you may retain copies of the materials as necessary for legal, regulatory and archival purposes.";
  push({
    clauseType: "Return or Destroy Documents",
    title: "Allow destruction or return + retention carve-out",
    rationale: "Checklist prefers destruction option and retention carve-out.",
    delta: { summary: "Add 'destroy' option and retention language" },
    proposal: { operation: "replace", target: p, replacement }
  });
}
// Modifiers
if (/best efforts|shall|immediate/.test(t)) {
  let replacement = p;
  replacement = replacement.replace(/best efforts/ig, "commercially reasonable efforts");
  replacement = replacement.replace(/\bshall\b/ig, "will");
  replacement = replacement.replace(/\bimmediate(ly)?\b/ig, "prompt");
  if (replacement !== p) {
    push({
      clauseType: "Legal modifiers",
      title: "Relax restrictive legal modifiers",
      rationale: "Use calmer modifiers to reduce burden per checklist.",
      delta: { summary: "best efforts→commercially reasonable; shall→will; immediate→prompt" },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
}
// Affiliates
if (/affiliate/.test(t)) {
  const replacement = p + "\n\nNotwithstanding anything herein, none of your affiliates (including any investment fund managed by you or your affiliate or any portfolio company of such fund) shall be deemed your Representatives unless they actually receive Evaluation Material, and mere board service does not create obligations.";
  push({
    clauseType: "Affiliate Language",
    title: "Scope affiliate obligations narrowly",
    rationale: "Checklist advises removing broad affiliate obligations and adding carve-outs.",
    delta: { summary: "Add affiliate carve-out" },
    proposal: { operation: "replace", target: p, replacement }
  });
}
// Jurisdiction
if (/governing law|jurisdiction|venue/.test(t)) {
  if (!preferredJurisdictions.some(j => t.includes(j))) {
    const replacement = p.replace(/(governed by|laws? of)\s+[^.,;]+/i, "$1 Illinois")
                         .replace(/(venue|jurisdiction)\s+[^.,;]+/i, "$1 Illinois");
    push({
      clauseType: "State of Jurisdiction",
      title: "Prefer IL/NY/DE jurisdiction",
      rationale: "Checklist prefers Illinois, New York or Delaware.",
      delta: { summary: "Switch jurisdiction to preferred state" },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
}
// Representatives
if (/representative/.test(t)) {
  if (!/(directors|officers|advisors|employees|financing sources|consultants|accountants|attorneys)/.test(t)) {
    const replacement = p + "\n\nRepresentatives include directors, officers, advisors, employees, financing sources, consultants, accountants and attorneys. No requirement for Representatives to sign this Agreement.";
    push({
      clauseType: "Representative Language",
      title: "Clarify Representatives scope; avoid countersigning requirement",
      rationale: "Checklist includes the list and avoids signature requirement.",
      delta: { summary: "Add Representatives list and no-signature note" },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
}
// Competition disclaimer
if (/competitor|competition|bid|quote/.test(t)) {
  if (!/will not.*prevent|restrict.*ordinary course/.test(t)) {
    const replacement = p + "\n\nNotwithstanding anything herein, receipt and possession of Evaluation Material shall not restrict ordinary-course competition, including quotes or bids in direct competition, provided strict compliance with this Agreement.";
    push({
      clauseType: "Competition Disclaimer",
      title: "Add competition disclaimer",
      rationale: "Checklist allows competition disclaimer while maintaining confidentiality.",
      delta: { summary: "Add safe harbor for ordinary-course competition" },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
}
// Confidential Information carve-outs
if (/confidential( information)?\b/.test(t)) {
  if (materiallyEquivalentCarveouts(p)) {
    if (/immediate|best efforts|shall/.test(t)) {
      const replacement = p.replace(/best efforts/ig, "commercially reasonable efforts")
                           .replace(/\bshall\b/ig, "will")
                           .replace(/\bimmediate(ly)?\b/ig, "prompt");
      if (replacement !== p) {
        push({
          clauseType: "Confidential Information Carve-Out",
          title: "Light-touch calming of modifiers",
          rationale: "Carve-outs are materially equivalent; calm modifiers only.",
          delta: { summary: "Light-touch edits" },
          proposal: { operation: "replace", target: p, replacement }
        });
      }
    }
  } else {
    const replacement = p + "\n\nFor clarity, Confidential Information excludes information that (i) was publicly available prior to disclosure, (ii) was known to us without obligation, (iii) was independently developed by us, or (iv) becomes available on a nonconfidential basis from a source not bound by confidentiality.";
    push({
      clauseType: "Confidential Information Carve-Out",
      title: "Add standard carve-outs",
      rationale: "Missing one or more standard carve-outs.",
      delta: { summary: "Add (i)-(iv) carve-outs" },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
}
return out;
}

function analyze(text: string): AnalyzeResult {
const norm = normalize(text);
const paras = segment(norm);
const suggestions = paras.flatMap((p, idx) => propose(p, idx));
const coverage = {
  "Confidential Information Carve-Out": { ok: suggestions.every(s => s.clauseType !== "Confidential Information Carve-Out" || s.severity < 60), note: "Carve-outs present or only minor edits suggested." },
  "Term": { ok: !suggestions.some(s => s.clauseType==="Term" && s.severity>60), note: "Term ≤ 24 months or suggested." },
  "Affiliate Language": { ok: !suggestions.some(s => s.clauseType==="Affiliate Language" && s.severity>=70), note: "Affiliate scoping acceptable or suggested." }
};
return { normalizedText: norm, paragraphs: paras, suggestions, checklistCoverage: coverage };
}

function hash(str: string): number {
let h=0, i=0; for (i=0;i<str.length;i++) h = (h<<5) - h + str.charCodeAt(i) | 0;
return h;
}

export default { analyze };
