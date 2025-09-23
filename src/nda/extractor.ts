import type { Checklist, ClauseFinding, ExtractedSpan } from './types';
import { normalizeText, splitSections } from './text/normalizer';
import { evalLogic, tokenizeToLemmas } from './logic';

function i(str: string) {
  return str.toLowerCase();
}
function contains(hay: string, needle: string) {
  return i(hay).includes(i(needle));
}
function scoreHeadingMatch(heading: string, aliases: string[]): number {
  const h = i(heading);
  return Math.max(...aliases.map((a) => (h.includes(i(a)) ? 1 : 0)), 0);
}
function toMonths(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('year')) return value * 12;
  if (u.startsWith('month')) return value;
  return value / 30; // approx days→months
}

export function runExtraction(raw: string, checklist: Checklist): { findings: ClauseFinding[]; spans: ExtractedSpan[] } {
  const text = normalizeText(raw);
  const tokens = tokenizeToLemmas(text);
  const sections = splitSections(text);
  const spans: ExtractedSpan[] = [];
  const findings: ClauseFinding[] = [];

  for (const clause of checklist.clauses) {
    const bestSection = sections
      .map((s) => ({ s, score: scoreHeadingMatch(s.heading, clause.aliases) }))
      .sort((a, b) => b.score - a.score)[0];

    const candidateSections = bestSection?.score ? [bestSection.s] : sections;

    const mustOk = (clause.mustInclude || []).every((tok) => candidateSections.some((sec) => contains(sec.body, tok)));
    const mustNotOk = (clause.mustNotInclude || []).every((tok) => !candidateSections.some((sec) => contains(sec.body, tok)));
    const shouldOk = (clause.shouldInclude || []).every((tok) => candidateSections.some((sec) => contains(sec.body, tok)));

    let numberOk = true;
    if (clause.numberBounds) {
      const re = /\b(\d{1,3})\s*(day|days|month|months|year|years)\b/gi;
      const nums: number[] = [];
      for (const sec of candidateSections) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(sec.body))) {
          const n = parseInt(m[1], 10);
          const unit = m[2];
          nums.push(toMonths(n, unit));
        }
      }
      const toCmp = (v: number | undefined) =>
        clause.numberBounds!.kind === 'YEARS' ? (v ?? 0) * 12 : clause.numberBounds!.kind === 'MONTHS' ? v ?? 0 : (v ?? 0) / 30;
      const minM = clause.numberBounds.min !== undefined ? toCmp(clause.numberBounds.min) : 0;
      const maxM = clause.numberBounds.max !== undefined ? toCmp(clause.numberBounds.max) : Infinity;
      numberOk = nums.length > 0 && nums.some((m) => m >= minM && m <= maxM);
    }

    let logicOk = true;
    if (clause.logic) {
      const syn = clause.synonyms || {};
      logicOk = evalLogic(clause.logic, tokens, syn);
    }

    const status =
      mustOk && mustNotOk && numberOk && logicOk
        ? 'PASS'
        : (!mustOk || !mustNotOk || !logicOk) && clause.severity !== 'LOW'
        ? 'FAIL'
        : 'WARN';

    const evidenceSec = candidateSections.slice(0, 2);
    const ev: ExtractedSpan[] = evidenceSec.map((sec) => ({
      heading: sec.heading,
      text: sec.body.slice(0, 800),
      start: sec.start,
      end: sec.end,
      headingScore: scoreHeadingMatch(sec.heading, clause.aliases)
    }));

    findings.push({
      clause: clause.name,
      severity: clause.severity,
      status,
      score:
        (mustOk ? 0.28 : 0) +
        (mustNotOk ? 0.22 : 0) +
        (numberOk ? 0.2 : 0) +
        (shouldOk ? 0.1 : 0) +
        (logicOk ? 0.2 : 0),
      evidence: ev,
      notes: clause.advice ? [clause.advice] : undefined,
      rationale: logicOk ? 'Logic/terms satisfied' : 'Missing/negated key phrasing'
    });

    spans.push(...ev);
  }

  return { findings, spans };
}
