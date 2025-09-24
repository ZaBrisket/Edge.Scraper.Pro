export type ProvisionId =
  | "employee-non-solicit"
  | "confidential-carveouts"
  | "affiliate-scope"
  | "efforts-modifier";

export interface ChecklistProvision {
  id: ProvisionId;
  title: string;
  required: boolean;
  baseline: string;
  acceptIfIncludes: string[];
  mustContain: string[];
  mustNotContain: string[];
  weights: Record<string, number>;
}

export interface EdgewaterChecklist {
  version: string;
  provisions: ChecklistProvision[];
}

export interface SuggestedEdit {
  id: string;
  provisionId: ProvisionId;
  originalText: string;
  suggestedText: string;
  reason: string;
  severity: number; // 0..1
  start?: number;   // character index in flattened text (best-effort)
  end?: number;
}

export interface AnalysisResult {
  textPreview: string;
  issues: SuggestedEdit[];
  stats: { chars: number; words: number; detectedClauses: number };
}
