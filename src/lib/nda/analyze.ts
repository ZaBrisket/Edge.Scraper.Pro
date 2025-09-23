import stringSimilarity from 'string-similarity';
import type { AnalyzeResult, Issue, Rule } from './types';
import { loadChecklist } from './rules';

const SCOPE_BROADENERS = [
  /any\s+and\s+all/i,
  /including\s+without\s+limitation/i,
  /successors?\s+and\s+assigns/i,
  /affiliates/i
];

const PARA_SPLIT = /\n{2,}/;

export function normalizeText(input: string): string {
  return input
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toRegex(source: string): RegExp {
  if (!source) {
    return new RegExp(source, 'i');
  }
  if (source.startsWith('/')) {
    const lastSlash = source.lastIndexOf('/');
    const body = source.slice(1, lastSlash);
    const rawFlags = source.slice(lastSlash + 1);
    const flags = rawFlags.replace(/g/g, '');
    const withCase = flags.includes('i') ? flags : `${flags}i`;
    return new RegExp(body, withCase || 'i');
  }
  return new RegExp(source, 'i');
}

function textComplianceScore(text: string, safeClause?: string): number {
  if (!safeClause) return 0;
  const incoming = text.trim().replace(/\s+/g, ' ');
  const safe = safeClause.trim().replace(/\s+/g, ' ');
  if (!incoming || !safe) return 0;
  return stringSimilarity.compareTwoStrings(incoming, safe);
}

function adjustSeverity(base: number, snippet: string, preferCount: number, forbidCount: number): number {
  let score = base;
  for (const pattern of SCOPE_BROADENERS) {
    if (pattern.test(snippet)) {
      score += 1;
    }
  }
  if (/best\s+efforts/i.test(snippet)) {
    score += 1;
  }
  if (forbidCount > 0) {
    score += Math.min(2, forbidCount);
  }
  if (preferCount > 0) {
    score -= Math.min(preferCount, 2);
  }
  return Math.max(1, Math.min(10, score));
}

function pickSnippet(text: string, index: number): string {
  if (!text || index < 0) return '';
  const doubleStart = text.lastIndexOf('\n\n', index);
  const doubleEnd = text.indexOf('\n\n', index);
  let start = doubleStart === -1 ? 0 : doubleStart + 2;
  let end = doubleEnd === -1 ? text.length : doubleEnd;

  if (start === 0 && end === text.length) {
    const singleStart = text.lastIndexOf('\n', index);
    const singleEnd = text.indexOf('\n', index);
    if (singleStart !== -1) start = singleStart + 1;
    if (singleEnd !== -1) end = singleEnd;
  }

  const snippet = text.slice(start, end).trim();
  return snippet || text.trim().slice(0, 400);
}

function findRange(text: string, snippet: string, anchor: number) {
  const trimmed = snippet.trim();
  if (!trimmed) return null;
  const searchFrom = anchor >= 0 ? Math.max(0, anchor - trimmed.length) : 0;
  const idx = text.indexOf(trimmed, searchFrom);
  if (idx >= 0) {
    return { start: idx, end: idx + trimmed.length };
  }
  const fallback = text.indexOf(trimmed);
  if (fallback >= 0) {
    return { start: fallback, end: fallback + trimmed.length };
  }
  if (anchor >= 0) {
    const boundedStart = Math.min(Math.max(anchor, 0), text.length);
    const end = Math.min(text.length, boundedStart + trimmed.length);
    return { start: boundedStart, end };
  }
  return null;
}

function findFirstIndex(pattern: RegExp, input: string): number {
  pattern.lastIndex = 0;
  const match = pattern.exec(input);
  return match && typeof match.index === 'number' ? match.index : -1;
}

function analyseRule(rule: Rule, text: string) {
  const requirePatterns = (rule.require ?? []).map(toRegex);
  const preferPatterns = (rule.prefer ?? []).map(toRegex);
  const forbidPatterns = (rule.forbid ?? []).map(toRegex);

  let firstMatchIndex = -1;
  let matchedRequire = 0;
  let missingRequire = 0;

  for (const pattern of requirePatterns) {
    const idx = findFirstIndex(pattern, text);
    if (idx >= 0) {
      matchedRequire += 1;
      firstMatchIndex = firstMatchIndex === -1 ? idx : Math.min(firstMatchIndex, idx);
    } else {
      missingRequire += 1;
    }
  }

  let preferCount = 0;
  for (const pattern of preferPatterns) {
    const idx = findFirstIndex(pattern, text);
    if (idx >= 0) {
      preferCount += 1;
      if (firstMatchIndex === -1) {
        firstMatchIndex = idx;
      }
    }
  }

  let forbidCount = 0;
  for (const pattern of forbidPatterns) {
    const idx = findFirstIndex(pattern, text);
    if (idx >= 0) {
      forbidCount += 1;
      if (firstMatchIndex === -1) {
        firstMatchIndex = idx;
      }
    }
  }

  const coverage = requirePatterns.length ? matchedRequire / requirePatterns.length : 1;
  const rationale: string[] = [];
  if (missingRequire > 0 && requirePatterns.length) {
    const term = missingRequire > 1 ? 'elements' : 'element';
    rationale.push(`${missingRequire} required ${term} missing.`);
  }
  if (forbidCount > 0) {
    rationale.push(`${forbidCount} forbidden pattern${forbidCount > 1 ? 's' : ''} detected.`);
  }
  if (preferCount > 0) {
    rationale.push(`Includes ${preferCount} preferred element${preferCount > 1 ? 's' : ''}.`);
  }
  if (rationale.length === 0) {
    rationale.push('Clause meets baseline checklist expectations.');
  }

  const snippetCandidate = firstMatchIndex >= 0 ? pickSnippet(text, firstMatchIndex) : '';
  const snippet = snippetCandidate || (requirePatterns.length ? 'Clause not located in document.' : text.trim().slice(0, 400));
  const severity = adjustSeverity(rule.severity, snippetCandidate || text, preferCount, forbidCount);
  const similarity = snippetCandidate && rule.safe_clause ? textComplianceScore(snippetCandidate, rule.safe_clause) : 0;

  let status: Issue['status'] = 'non_compliant';
  let suggestion: string | undefined = rule.safe_clause;
  const requireOk = missingRequire === 0;

  if (requireOk && forbidCount === 0) {
    if (rule.safe_clause && similarity >= 0.8) {
      status = 'substantial';
      rationale.push(`Substantial compliance detected (${Math.round(similarity * 100)}% match).`);
      if (snippetCandidate && /best\s+efforts/i.test(snippetCandidate) && /commercially\s+reasonable/i.test(rule.safe_clause)) {
        suggestion = snippetCandidate.replace(/best\s+efforts/gi, 'commercially reasonable efforts');
      } else {
        suggestion = undefined;
      }
    } else {
      status = 'compliant';
      suggestion = undefined;
      if (!rule.safe_clause) {
        rationale.push('All required elements present; no edits recommended.');
      }
    }
  } else if (!requireOk && forbidCount === 0 && (rule.safe_clause || coverage >= 0.75) && (similarity >= 0.75 || coverage >= 0.75)) {
    status = 'substantial';
    suggestion = undefined;
    const missingIndex = rationale.findIndex((item) => item.includes('required'));
    if (missingIndex >= 0) {
      rationale.splice(missingIndex, 1);
    }
    const coverageNote = coverage >= 0.75 ? `${Math.round(coverage * 100)}% checklist coverage` : `${Math.round(similarity * 100)}% match`;
    rationale.push(`Substantial compliance detected (${coverageNote}).`);
  }

  return {
    status,
    snippet,
    severity,
    suggestion,
    rationale,
    anchorIndex: firstMatchIndex
  };
}

export function analyzeNdaText(input: string): AnalyzeResult {
  const checklist = loadChecklist();
  const normalizedText = normalizeText(input);

  const issues: Issue[] = [];

  for (const rule of checklist.rules) {
    const { status, snippet, severity, suggestion, rationale, anchorIndex } = analyseRule(rule, normalizedText);
    if (status === 'compliant') {
      continue;
    }

    const range = suggestion && anchorIndex >= 0 ? findRange(normalizedText, snippet, anchorIndex) : null;

    issues.push({
      id: `${rule.id}:0`,
      ruleId: rule.id,
      title: rule.title,
      category: rule.category,
      level: rule.level,
      severity,
      status,
      rationale,
      snippet,
      suggestion,
      ranges: range ? [range] : []
    });
  }

  issues.sort((a, b) => b.severity - a.severity);

  const paragraphs = normalizedText ? normalizedText.split(PARA_SPLIT).filter(Boolean) : [];

  return {
    normalizedText,
    issues,
    meta: {
      charCount: normalizedText.length,
      paragraphCount: paragraphs.length || (normalizedText ? 1 : 0)
    }
  };
}
