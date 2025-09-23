import { BurdenAssessment } from './types';

const RESTRICTIVE_KEYWORDS = [
  'immediate',
  'promptly',
  'best efforts',
  'all times',
  'at all times',
  'all reasonable',
  'sole discretion',
  'without limitation',
  'perpetual',
  'irrevocable',
  'indemnify',
  'any and all',
  'must',
  'shall ensure',
];

function countRestrictivePhrases(text: string): number {
  const normalized = text.toLowerCase();
  let count = 0;
  for (const phrase of RESTRICTIVE_KEYWORDS) {
    const regex = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'g');
    const matches = normalized.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

function detectReciprocity(text: string, standard: string): 'mutual' | 'one-sided' | 'unknown' {
  const normalized = text.toLowerCase();
  const standardNormalized = standard.toLowerCase();
  const hasMutualLanguage = /each party|either party|both parties|mutual/i.test(normalized);
  const referencesDisclosingOnly = /disclosing party[^.]{0,60}sole/i.test(normalized);
  const referencesReceivingOnly = /receiving party[^.]{0,60}sole/i.test(normalized);

  if (hasMutualLanguage) {
    return 'mutual';
  }

  if (referencesDisclosingOnly && !referencesReceivingOnly) {
    return 'one-sided';
  }

  // Compare against standard clause reciprocity
  if (/each party|either party|both parties|mutual/i.test(standardNormalized)) {
    return referencesReceivingOnly ? 'one-sided' : 'mutual';
  }

  return 'unknown';
}

export function assessBurden(inboundClause: string, standardClause: string): BurdenAssessment {
  const inboundLength = inboundClause.trim().split(/\s+/).length || 1;
  const standardLength = standardClause.trim().split(/\s+/).length || 1;
  const lengthRatio = Number((inboundLength / standardLength).toFixed(2));

  const restrictivenessScore = countRestrictivePhrases(inboundClause);
  const reciprocity = detectReciprocity(inboundClause, standardClause);

  let burdenLevel: 'low' | 'medium' | 'high' = 'low';
  const reasons: string[] = [];

  if (lengthRatio > 1.5) {
    burdenLevel = 'medium';
    reasons.push(`Inbound clause is ${lengthRatio}x longer than standard.`);
  } else if (lengthRatio < 0.65) {
    reasons.push('Inbound clause is significantly shorter than standard.');
  }

  if (restrictivenessScore >= 3) {
    burdenLevel = 'high';
    reasons.push('Inbound clause contains numerous restrictive qualifiers.');
  } else if (restrictivenessScore >= 2) {
    burdenLevel = 'medium';
    reasons.push('Inbound clause has several restrictive qualifiers.');
  }

  if (reciprocity === 'one-sided') {
    burdenLevel = 'high';
    reasons.push('Obligations are one-sided without reciprocity.');
  } else if (reciprocity === 'unknown') {
    reasons.push('Unable to confirm reciprocity.');
  }

  if (!reasons.length) {
    reasons.push('Clause burden aligns with standard expectations.');
  }

  return {
    lengthRatio,
    restrictivenessScore,
    reciprocity,
    burdenLevel,
    explanation: reasons.join(' '),
  };
}
