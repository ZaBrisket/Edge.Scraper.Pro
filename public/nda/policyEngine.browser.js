/* Deterministic NDA policy engine — browser build (no external network).
* Uses embedded Edgewater checklist JSON and small synonym/burdensome maps.
* Exposes: window.NDAPolicyEngine = { analyze(text), apply(text, suggestions) }
*/
(function () {
const Checklist = {
  // Normalized from Appendix A (full Appendix embedded verbatim in repo: src/services/nda/data/appendixA.txt)
  "Confidential Information Carve-Out": {
    preferred: [
      "(i) was publicly available prior to its disclosure",
      "(ii) was known to us prior to its disclosure",
      "(iii) was independently developed by us",
      "(iv) is or becomes available to us on a nonconfidential basis"
    ]
  },
  "Employee Non-Solicit": {
    preferred: [
      "limit to key executives", "carve-out for (i) unsolicited applicants, (ii) prior discussions, (iii) responses to public ads, (iv) terminated by the Company"
    ]
  },
  "Customer/Supplier Non-Solicit": { preferred: ["always exclude this language"] },
  "Term": { preferred: ["term not to exceed two years"] },
  "Return or Destroy Documents": { preferred: ["allow destruction of documents rather than return"] },
  "Document retention language": { preferred: ["retain copies for legal, regulatory and archival purposes"] },
  "Legal modifiers": { preferred: ["commercially reasonable", "may", "prompt"] },
  "Affiliate Language": { preferred: ["remove references to your affiliates; company affiliates are OK"] },
  "Affiliate Carve-Out": { preferred: ["affiliates/portfolio companies not Representatives unless they actually receive Evaluation Material"] },
  "State of Jurisdiction": { preferred: ["Illinois", "New York", "Delaware"] },
  "Representative Language": { preferred: ["include directors, officers, advisors, employees, financing sources, consultants, accountants and attorneys", "avoid requirement to have Representatives sign this agreement"] },
  "Competition Disclaimer": { preferred: ["receipt of Evaluation Material shall not restrict ordinary course competition"] }
};
const Synonyms = {
  "promptly": "prompt",
  "immediately": "prompt",
  "best efforts": "commercially reasonable efforts",
  "shall": "may" // when not imposing essential obligations, heuristic
};
const BurdensomeMarkers = [
  "best efforts", "shall immediately", "all employees", "all affiliates", "portfolio companies", "perpetual", "in perpetuity", "injunctive relief in any court", "foreign", "exclusive jurisdiction"
];
const PreferredJurisdictions = ["illinois", "new york", "delaware"];

function normalize(s) {
  return s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\u00A0/g, ' ').trim();
}
function lowerClean(s) {
  return normalize(s.toLowerCase()).replace(/[“”]/g, '"').replace(/[’]/g, "'");
}
function segmentParagraphs(text) {
  return normalize(text).split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}
function detectTermMonths(text) {
  const m = lowerClean(text).match(/(\d+)\s*(month|months|mo\.?|year|years|yr\.?)/);
  if (!m) return null;
  let n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit.startsWith('year') || unit.startsWith('yr')) n = n * 12;
  return n; // in months
}
function scoreBurdensomeness(p) {
  let score = 0;
  const lc = lowerClean(p);
  const termMonths = detectTermMonths(p);
  if (termMonths && termMonths > 24) score += Math.min(40, (termMonths - 24)); // longer term, higher score
  BurdensomeMarkers.forEach(m => { if (lc.includes(m)) score += 10; });
  // Conf carve-outs missing?
  if (lc.includes("confidential information") && /(publicly available|independently developed|nonconfidential basis)/.test(lc) === false) score += 25;
  // Jurisdiction strictness
  if (/governing law|jurisdiction|venue/.test(lc)) {
    if (!PreferredJurisdictions.some(j => lc.includes(j))) score += 20;
  }
  return Math.max(0, Math.min(score, 100));
}
function materiallyEquivalentConfCarveouts(p) {
  const lc = lowerClean(p);
  const bullets = [
    /publicly available/,
    /known to us prior|known.*prior/,
    /independently developed/,
    /nonconfidential basis/
  ];
  return bullets.every(rx => rx.test(lc));
}
function proposeEditsForParagraph(p) {
  const lc = lowerClean(p);
  const suggestions = [];
  // Non-solicit (customer/supplier): always exclude
  if (/non-?solicit/.test(lc) && /(customer|supplier)/.test(lc)) {
    suggestions.push({
      clauseType: "Customer/Supplier Non-Solicit",
      title: "Remove customer/supplier non-solicit",
      severity: 90,
      rationale: "Checklist says to exclude customer/supplier non-solicit.",
      delta: { summary: "Remove clause per checklist" },
      proposal: { operation: "delete", target: p, replacement: "" }
    });
  }
  // Employee non-solicit: limit to execs + add carve-outs
  if (/non-?solicit/.test(lc) && /(employee|personnel|staff)/.test(lc)) {
    let severity = 70;
    let rationale = "Limit to key executives and include carve-outs for unsolicited applicants, prior discussions, public ads, and prior termination.";
    if (/all employees|any employee/.test(lc)) severity = 85;
    const replacement = p
      .replace(/all employees|any employee/ig, "key executives")
      .concat("\n\nNothing herein shall prevent hiring (i) unsolicited applicants, (ii) those with prior discussions, (iii) responders to public ads, or (iv) persons terminated by the Company before discussions.");
    suggestions.push({
      clauseType: "Employee Non-Solicit",
      title: "Limit employee non-solicit + add carve-outs",
      severity,
      rationale,
      delta: { summary: "Scope limited to executives; added standard carve-outs" },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
  // Term limit
  if (/term\b/.test(lc) || /this agreement shall remain/.test(lc)) {
    const months = detectTermMonths(p);
    if (!months) {
      suggestions.push({
        clauseType: "Term",
        title: "Add explicit term (≤ 24 months)",
        severity: 60,
        rationale: "Checklist requires explicit term not exceeding two years.",
        delta: { summary: "Add 24-month cap" },
        proposal: { operation: "insert", target: "", replacement: "The term of this Agreement shall be twenty-four (24) months." }
      });
    } else if (months > 24) {
      const replacement = p.replace(/(\d+)\s*(year|years|yr\.?|month|months)/i, "24 months");
      suggestions.push({
        clauseType: "Term",
        title: "Reduce term to ≤ 24 months",
        severity: Math.min(100, 60 + (months - 24)),
        rationale: `Term appears to be ~${months} months; checklist cap is 24 months.`,
        delta: { summary: `Reduce term from ~${months} to 24 months` },
        proposal: { operation: "replace", target: p, replacement }
      });
    }
  }
  // Return or destroy
  if (/return.*(documents|materials)/.test(lc) && !/destroy/.test(lc)) {
    const replacement = p.replace(/return/ig, "return or destroy") +
      "\n\nHowever, you may retain copies as necessary for legal, regulatory and archival purposes.";
    suggestions.push({
      clauseType: "Return or Destroy Documents",
      title: "Allow destruction or return + retention carve-out",
      severity: 65,
      rationale: "Checklist allows destruction option and retention for legal/regulatory/archival.",
      delta: { summary: "Add 'destroy' option and retention language" },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
  // Legal modifiers (best efforts → commercially reasonable; shall → may; immediate → prompt)
  if (/best efforts|shall|immediate/.test(lc)) {
    let severity = 50;
    let replacement = p;
    if (/best efforts/.test(lc)) { severity += 15; replacement = replacement.replace(/best efforts/ig, "commercially reasonable efforts"); }
    // replace shall with may cautiously: only modifiers, not core obligations; heuristic: "shall promptly" => "will promptly" or "shall" as modal replaced with "will" or "may"?
    replacement = replacement.replace(/\bshall\b/ig, "will");
    replacement = replacement.replace(/\bimmediate(ly)?\b/ig, "prompt");
    if (replacement !== p) {
      suggestions.push({
        clauseType: "Legal modifiers",
        title: "Relax restrictive legal modifiers",
        severity,
        rationale: "Use calmer modifiers to reduce burden per checklist.",
        delta: { summary: "best efforts→commercially reasonable; shall→will; immediate→prompt" },
        proposal: { operation: "replace", target: p, replacement }
      });
    }
  }
  // Affiliates scoping
  if (/affiliate/.test(lc)) {
    let severity = 70;
    const replacement = p + "\n\nNotwithstanding anything herein, none of your affiliates (including investment funds or their portfolio companies) shall be deemed your Representatives unless they actually receive Evaluation Material; mere service of an employee as an officer/director does not, by itself, make an affiliate a Representative.";
    suggestions.push({
      clauseType: "Affiliate Language",
      title: "Scope affiliate obligations narrowly",
      severity,
      rationale: "Checklist advises removing broad affiliate obligations; carve-out where no Evaluation Material received.",
      delta: { summary: "Add affiliate carve-out" },
      proposal: { operation: "replace", target: p, replacement }
    });
  }
  // Jurisdiction
  if (/governing law|jurisdiction|venue/.test(lc)) {
    if (!PreferredJurisdictions.some(j => lc.includes(j))) {
      const replacement = p.replace(/(governed by|laws? of)\s+[^.,;]+/i, "$1 Illinois").replace(/(venue|jurisdiction)\s+[^.,;]+/i, "$1 Illinois");
      suggestions.push({
        clauseType: "State of Jurisdiction",
        title: "Prefer IL/NY/DE jurisdiction",
        severity: 70,
        rationale: "Checklist prefers Illinois, New York, or Delaware, avoiding foreign jurisdictions.",
        delta: { summary: "Switch jurisdiction to preferred state" },
        proposal: { operation: "replace", target: p, replacement }
      });
    }
  }
  // Representatives language
  if (/representative/.test(lc)) {
    if (!/(directors|officers|advisors|employees|financing sources|consultants|accountants|attorneys)/.test(lc)) {
      const replacement = p + "\n\nRepresentatives include directors, officers, advisors, employees, financing sources, consultants, accountants and attorneys. No requirement for Representatives to sign this Agreement.";
      suggestions.push({
        clauseType: "Representative Language",
        title: "Clarify Representatives scope; avoid countersigning requirement",
        severity: 55,
        rationale: "Checklist includes a specific set and avoids signature requirements.",
        delta: { summary: "Add Representatives list and no-signature note" },
        proposal: { operation: "replace", target: p, replacement }
      });
    }
  }
  // Competition disclaimer
  if (/competitor|competition|bid|quote/.test(lc)) {
    if (!/will not.*prevent|restrict.*ordinary course/.test(lc)) {
      const replacement = p + "\n\nNotwithstanding anything herein, receipt and possession of Evaluation Material shall not restrict ordinary-course competition, including making quotes or bids in direct competition, provided strict compliance with this Agreement.";
      suggestions.push({
        clauseType: "Competition Disclaimer",
        title: "Add competition disclaimer",
        severity: 50,
        rationale: "Checklist allows competition disclaimer while complying with confidentiality.",
        delta: { summary: "Add safe harbor for ordinary-course competition" },
        proposal: { operation: "replace", target: p, replacement }
      });
    }
  }
  // Confidential Information carve-outs
  if (/confidential( information)?\b/.test(lc)) {
    if (materiallyEquivalentConfCarveouts(p)) {
      // Equivalent: no wholesale replacement; maybe light modifiers only
      if (/immediate|best efforts|shall/.test(lc)) {
        const replacement = p.replace(/best efforts/ig, "commercially reasonable efforts").replace(/\bshall\b/ig, "will").replace(/\bimmediate(ly)?\b/ig, "prompt");
        if (replacement !== p) {
          suggestions.push({
            clauseType: "Confidential Information Carve-Out",
            title: "Light-touch calming of modifiers",
            severity: 35,
            rationale: "Carve-outs materially equivalent; only modifier softening proposed.",
            delta: { summary: "Light-touch edits only" },
            proposal: { operation: "replace", target: p, replacement }
          });
        }
      }
    } else {
      const replacement = p + "\n\nFor clarity, Confidential Information excludes information that (i) was publicly available prior to disclosure, (ii) was known to us without obligation, (iii) was independently developed by us, or (iv) becomes available on a nonconfidential basis from a source not bound by confidentiality.";
      suggestions.push({
        clauseType: "Confidential Information Carve-Out",
        title: "Add standard carve-outs",
        severity: 80,
        rationale: "Missing one or more standard carve-outs per checklist.",
        delta: { summary: "Add (i)-(iv) carve-outs" },
        proposal: { operation: "replace", target: p, replacement }
      });
    }
  }
  return suggestions;
}

function analyze(text) {
  const norm = normalize(text);
  const paras = segmentParagraphs(norm);
  const suggestions = [];
  paras.forEach((p, idx) => {
    const local = proposeEditsForParagraph(p).map(s => {
      const id = `${idx+1}-${Math.abs(hashCode(s.title + s.clauseType + s.proposal.operation + s.proposal.replacement.slice(0,48))).toString(36)}`;
      const severity = Math.max(0, Math.min(100, Math.round(scoreBurdensomeness(p))));
      return Object.assign({ id, paragraphIndex: idx, severity }, s);
    });
    suggestions.push(...local);
  });
  // Checklist coverage (naive)
  const coverage = {
    "Confidential Information Carve-Out": { ok: suggestions.every(s => s.clauseType !== "Confidential Information Carve-Out" || s.severity < 60), note: "Carve-outs present or only minor edits suggested." },
    "Term": { ok: !suggestions.some(s => s.clauseType==="Term" && s.severity>60), note: "Term ≤ 24 months or suggested." },
    "Affiliate Language": { ok: !suggestions.some(s => s.clauseType==="Affiliate Language" && s.severity>=70), note: "Affiliate scoping acceptable or suggested." }
  };
  return { normalizedText: norm, paragraphs: paras, suggestions, checklistCoverage: coverage };
}

function apply(originalText, selectedSuggestions) {
  // Deterministic, paragraph-scoped replace. Edits are applied sequentially by paragraph.
  const paras = segmentParagraphs(originalText);
  const byPara = new Map();
  selectedSuggestions.forEach(s => { if (!byPara.has(s.paragraphIndex)) byPara.set(s.paragraphIndex, []); byPara.get(s.paragraphIndex).push(s); });
  const outParas = paras.slice();
  const changes = [];
  byPara.forEach((list, idx) => {
    // Replace target with replacement for each suggestion
    let p = outParas[idx];
    list.forEach(s => {
      if (s.proposal.operation === 'delete') {
        p = p.replace(s.proposal.target, '');
        changes.push({ type:'del', text: s.proposal.target });
      } else if (s.proposal.operation === 'insert') {
        p = s.proposal.replacement + (p ? ('\n' + p) : '');
        changes.push({ type:'ins', text: s.proposal.replacement });
      } else {
        p = p.replace(s.proposal.target, s.proposal.replacement);
        changes.push({ type:'del', text: s.proposal.target });
        changes.push({ type:'ins', text: s.proposal.replacement });
      }
    });
    outParas[idx] = normalize(p);
  });
  const newText = outParas.join('\n\n');
  const htmlDiff = renderHtmlDiff(paras.join('\n\n'), newText, changes);
  return { text: newText, htmlDiff };
}

function renderHtmlDiff(before, after, changes) {
  // Very small differ: wrap known replacements from `changes` (sequence not guaranteed).
  let html = escapeHtml(before);
  changes.forEach(ch => {
    if (ch.type==='del') {
      const esc = escapeRegex(ch.text);
      html = html.replace(new RegExp(esc, 'g'), (m) => `<del>${escapeHtml(m)}</del>`);
    }
  });
  // Insertions appended preview block
  const insBlock = changes.filter(c=>c.type==='ins').map(c => `<ins>${escapeHtml(c.text)}</ins>`).join('\n');
  return html + (insBlock ? `\n\n${insBlock}` : '');
}

function escapeHtml(s) {
  const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return String(s).replace(/[&<>"']/g, c => map[c]);
}
function escapeRegex(s) { return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'); }
function hashCode(str) { let h=0, i=0, len=str.length; while (i<len) { h=(h<<5)-h+str.charCodeAt(i++)|0; } return h; }

window.NDAPolicyEngine = { analyze, apply };
window.NDA_ENV = { MAX_DOCX_MB: 5 };
})();
