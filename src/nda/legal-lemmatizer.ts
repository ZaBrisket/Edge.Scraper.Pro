const SPECIALIZED_MAP: Record<string, string> = {
  confidentiality: 'confidentiality',
  confidential: 'confidential',
  disclosures: 'disclosure',
  disclosing: 'disclose',
  survives: 'survive',
  survival: 'survival',
  representatives: 'representative',
  advisors: 'advisor',
  affiliates: 'affiliate',
  obligations: 'obligation',
  liabilities: 'liability',
  remedies: 'remedy',
  injunctive: 'injunctive',
  governing: 'govern',
  jurisdiction: 'jurisdiction',
  venue: 'venue',
  employees: 'employee',
  contractors: 'contractor',
  proposals: 'proposal',
  proposing: 'propose',
  proposed: 'propose',
  evaluation: 'evaluation',
  evaluating: 'evaluate',
  evaluates: 'evaluate',
  evaluated: 'evaluate',
  surviving: 'survive',
  solicitations: 'solicitation',
  soliciting: 'solicit',
  solicited: 'solicit',
  transaction: 'transaction',
  transactions: 'transaction',
  analyses: 'analysis',
};

const SUFFIX_RULES: { test: RegExp; replace: string }[] = [
  { test: /(ies)$/i, replace: 'y' },
  { test: /(ing)$/i, replace: '' },
  { test: /(ations)$/i, replace: 'ation' },
  { test: /(ments)$/i, replace: 'ment' },
  { test: /(ances)$/i, replace: 'ance' },
  { test: /(ers)$/i, replace: 'er' },
  { test: /(ors)$/i, replace: 'or' },
];

function applyRules(word: string): string {
  for (const rule of SUFFIX_RULES) {
    if (rule.test.test(word)) {
      return word.replace(rule.test, rule.replace);
    }
  }
  if (/s$/i.test(word) && !/(ss|us|is|se)$/i.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

export function legalLemma(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (SPECIALIZED_MAP[lower]) return SPECIALIZED_MAP[lower];
  const normalized = lower.normalize('NFKC');
  if (SPECIALIZED_MAP[normalized]) return SPECIALIZED_MAP[normalized];
  const withoutPunctuation = normalized.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
  if (SPECIALIZED_MAP[withoutPunctuation]) return SPECIALIZED_MAP[withoutPunctuation];
  return applyRules(withoutPunctuation || normalized);
}

export function legalNormalizeTokens(tokens: string[]): string[] {
  return tokens.map(token => legalLemma(token));
}
