export type Rule = {
  id: string;
  title: string;
  category: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKER';
  severity: number;
  require?: string[];
  prefer?: string[];
  forbid?: string[];
  safe_clause?: string;
  notes?: string;
};

export type Checklist = {
  name: string;
  version: string;
  rules: Rule[];
};

export type FoundMatch = {
  ruleId: string;
  start: number;
  end: number;
  snippet: string;
};

export type Issue = {
  id: string;
  ruleId: string;
  title: string;
  category: string;
  level: Rule['level'];
  severity: number;
  status: 'non_compliant' | 'substantial' | 'compliant';
  rationale: string[];
  snippet: string;
  suggestion?: string;
  ranges: Array<{ start: number; end: number }>;
};

export type AnalyzeResult = {
  normalizedText: string;
  issues: Issue[];
  meta: {
    charCount: number;
    paragraphCount: number;
  };
};
