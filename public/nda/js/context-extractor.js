// Extract basic context: party names, states, governing law, venue.
// Heuristic only; deterministic & local—no LLMs.

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"]
];
const STATE_NAMES = new Set(US_STATES.map(([,n])=>n));
const STATE_ABBR = new Map(US_STATES);
const NAME_TO_ABBR = new Map(US_STATES.map(([a,b])=>[b.toLowerCase(),a]));

/**
 * Heuristically extract party and jurisdiction context from document text.
 * @param {string} fullText
 * @returns {{parties:string[], partyStates:string[], governingLaw?:{state:string,stateAbbr:string}, venue?:{city:string,state:string,stateAbbr:string}}}
 */
export function extractContext(fullText) {
  const text = " " + String(fullText) + " ";
  return {
    parties: extractParties(text),
    partyStates: extractPartyStates(text),
    governingLaw: extractGoverningLaw(text),
    venue: extractVenue(text)
  };
}

function extractParties(text) {
  const res = [];
  // Pattern: “… between X, a …, and Y, a …”
  const m = text.match(/between\s+([^,]+?),\s+a\s+[^,]+?,\s+and\s+([^,]+?),\s+a\s+[^,]+?\s/i);
  if (m) {
    res.push(sanitizeName(m[1]), sanitizeName(m[2]));
  } else {
    // Fallback: uppercase names in preamble
    const head = text.slice(0, 1200);
    const caps = head.match(/\b[A-Z][A-Z&\-\s]{2,}\b/g) || [];
    for (const c of caps) { const n = c.trim().replace(/\s+/g," "); if (n.length<=80) res.push(n); }
  }
  return dedupe(res).slice(0, 4);
}

function extractPartyStates(text) {
  const out = new Set();
  // “organized under the laws of the State of X” / “a [STATE] corporation”
  const re1 = /laws?\s+of\s+(?:the\s+state\s+of\s+)?([A-Z][a-zA-Z]+)\b/gi;
  const re2 = /\b(a|an)\s+(?:\w+\s+){0,3}(?:corporation|company|limited|llc|inc\.)\s+(?:organized|incorporated)\s+in\s+([A-Z][a-zA-Z]+)\b/gi;
  for (const re of [re1,re2]) {
    let m; while ((m = re.exec(text)) !== null) {
      const s = normalizeState(m[1] || m[2]); if (s) out.add(s.full);
    }
  }
  return [...out];
}

function extractGoverningLaw(text) {
  // “governed by the laws of the State of X” / “laws of X shall govern”
  const re = /(govern(?:ed|ing)\s+law.*?(?:laws?\s+of\s+)?(?:the\s+state\s+of\s+)?([A-Z][a-zA-Z]+))|(?:laws?\s+of\s+(?:the\s+state\s+of\s+)?([A-Z][a-zA-Z]+)\s+shall\s+govern)/gis;
  let found=null; let match;
  while ((match = re.exec(text)) !== null) {
    const name = match[2] || match[3]; const s = normalizeState(name);
    if (s) { found = { state: s.full, stateAbbr: s.abbr }; break; }
  }
  return found;
}

function extractVenue(text) {
  const re = /(exclusive\s+jurisdiction|venue)\s+(?:in|for)\s+([^,]+),\s+([A-Z][a-zA-Z]+)/i;
  const m = re.exec(text);
  if (!m) return null;
  const s = normalizeState(m[3]); if (!s) return null;
  return { city: m[2].trim(), state: s.full, stateAbbr: s.abbr };
}

function normalizeState(name) {
  if (!name) return null;
  if (STATE_NAMES.has(name)) return { abbr: NAME_TO_ABBR.get(name.toLowerCase()), full: name };
  const up = name.toUpperCase();
  if (STATE_ABBR.has(up)) return { abbr: up, full: STATE_ABBR.get(up) };
  const cap = name.split(/\s+/).map(w => w[0].toUpperCase()+w.slice(1).toLowerCase()).join(" ");
  if (STATE_NAMES.has(cap)) return { abbr: NAME_TO_ABBR.get(cap.toLowerCase()), full: cap };
  return null;
}

function sanitizeName(s){ return String(s || "").replace(/["“”’']/g,"").trim().replace(/\s+/g," "); }
function dedupe(a){ return [...new Set(a.filter(Boolean))]; }
