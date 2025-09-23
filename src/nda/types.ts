export type Severity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type LogicNode =
  | { kind: 'ALL_OF'; terms: string[] }
  | { kind: 'ANY_OF'; terms: string[] }
  | { kind: 'NOT'; node: LogicNode }
  | { kind: 'NEAR'; a: string; b: string; distance: number };

export interface ClausePattern {
  name: string;
  aliases: string[];
  mustInclude?: string[];
  shouldInclude?: string[];
  mustNotInclude?: string[];
  numberBounds?: { kind: 'DAYS' | 'MONTHS' | 'YEARS'; min?: number; max?: number };
  structuredHints?: Record<string, string[]>;
  logic?: LogicNode;
  synonyms?: Record<string, string[]>;
  severity: Severity;
  advice: string;
}

export interface Checklist {
  id: 'edgewater-nda';
  version: string;
  updatedAt: string;
  clauses: ClausePattern[];
}

export interface ExtractedSpan {
  heading: string;
  text: string;
  start: number;
  end: number;
  headingScore: number;
}

export interface ClauseFinding {
  clause: string;
  severity: Severity;
  status: 'PASS' | 'WARN' | 'FAIL' | 'NA';
  score: number;
  evidence: ExtractedSpan[];
  notes?: string[];
  suggestedRewrite?: string;
  rationale?: string;
}

export interface ReviewResult {
  checklistId: Checklist['id'];
  checklistVersion: string;
  variant: 'A' | 'B';
  findings: ClauseFinding[];
  stats: { tokens: number; pages?: number; processingMs: number };
  audit: { docSha256: string; createdAt: string };
}
