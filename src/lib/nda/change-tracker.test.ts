import JSZip from 'jszip';
import { generateTrackedChangesDoc } from './change-tracker';
import { buildStructureFromPlainText } from './docx-processor';
import { NDASuggestion } from './types';

describe('generateTrackedChangesDoc', () => {
  it('creates tracked changes for text-originated suggestions by remapping paragraph ids', async () => {
    const structure = buildStructureFromPlainText('Original clause one.\n\nAnother clause.');
    const suggestion: NDASuggestion = {
      id: 'suggestion-1',
      checklistId: 'chk-1',
      title: 'Confidentiality Scope',
      category: 'Confidentiality',
      severity: 'critical',
      similarity: 0.9,
      burden: 'medium',
      action: 'targeted-edit',
      rationale: 'Test rationale',
      originalText: structure.paragraphs[0].text,
      suggestedText: 'Updated clause one.',
      burdenDetails: {
        lengthRatio: 1,
        restrictivenessScore: 0,
        reciprocity: 'mutual',
        burdenLevel: 'medium',
        explanation: 'Test burden.',
      },
      location: {
        paragraphId: structure.paragraphs[0].id,
        index: 0,
      },
      defaultSelected: true,
    };

    const buffer = await generateTrackedChangesDoc(structure, [suggestion]);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')?.async('text');

    expect(xml).toBeDefined();
    expect(xml).toContain('w:del');
    expect(xml).toContain('w:ins');
    expect(xml).toContain('Original clause one.');
    expect(xml).toContain('Updated clause one.');
  });
});
