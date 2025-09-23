import { Buffer } from 'node:buffer';

export type Severity = 'critical' | 'medium' | 'low';

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: Severity;
  standardText: string;
}

export interface ProvisionMatch {
  checklistItem: ChecklistItem;
  similarity: number;
  paragraphId?: string;
  paragraphText?: string;
  missing: boolean;
}

export interface BurdenAssessment {
  lengthRatio: number;
  restrictivenessScore: number;
  reciprocity: 'mutual' | 'one-sided' | 'unknown';
  burdenLevel: 'low' | 'medium' | 'high';
  explanation: string;
}

export interface DocumentLocation {
  paragraphId: string;
  index: number;
}

export interface NDASuggestion {
  id: string;
  checklistId: string;
  title: string;
  category: string;
  severity: Severity;
  similarity: number;
  burden: 'low' | 'medium' | 'high';
  action: 'flag' | 'targeted-edit' | 'replace' | 'add';
  rationale: string;
  originalText?: string;
  suggestedText: string;
  burdenDetails: BurdenAssessment;
  location?: DocumentLocation;
  defaultSelected: boolean;
}

export interface DocxParagraph {
  id: string;
  text: string;
  numbering?: string | null;
  level?: number;
  nodeIndex: number;
  properties?: unknown;
  runs?: unknown;
}

export interface DocxStructure {
  source: 'docx' | 'text';
  plainText: string;
  paragraphs: DocxParagraph[];
  documentXml?: string;
  xmlDocument?: any;
  originalBuffer?: Buffer;
}

export interface AnalyzeNdaRequest {
  text?: string;
  fileName?: string;
  mimeType?: string;
  fileBuffer?: Buffer;
  fileBase64?: string;
  checklistOverride?: ChecklistItem[];
  sessionId?: string;
  includeDocxExport?: boolean;
  selectedIssueIds?: string[];
}

export interface AnalyzeNdaResponse {
  issues: NDASuggestion[];
  extractedText: string;
  exportDocumentBase64?: string;
  warnings: string[];
  metrics: {
    totalClauses: number;
    matchedClauses: number;
    missingClauses: number;
  };
}
