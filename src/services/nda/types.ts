export interface Proposal {
operation: 'replace' | 'delete' | 'insert';
target: string;
replacement: string;
}
export interface Suggestion {
id: string;
paragraphIndex: number;
clauseType: string;
title: string;
severity: number; // 0-100 burdensomeness
rationale: string;
delta?: { summary: string };
proposal: Proposal;
}
export interface AnalyzeResult {
normalizedText: string;
paragraphs: string[];
suggestions: Suggestion[];
checklistCoverage?: Record<string, { ok: boolean; note: string }>;
}
export interface ApplyResult {
text: string;
htmlDiff: string;
}
export interface DocxParseResult {
paragraphs: string[];
meta?: { pages?: number };
notes?: string[];
}
export interface DocxExportRequest {
base64: string;
edits: Suggestion[];
author?: string;
tz?: string;
}
export interface DocxExportResponse {
base64: string;
filename: string;
skipped?: string[];
}
