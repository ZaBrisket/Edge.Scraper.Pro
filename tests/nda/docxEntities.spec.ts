import { exportTrackedChanges } from '../../src/services/nda/docx';
import { createDocx, extractDocumentXml, paragraph } from './helpers/docxTestUtils';

describe('docx entities', () => {
  test('preserves entities and smart quotes without double encoding', async () => {
    const base64 = await createDocx([paragraph('A & B “quotes”—ok')]);
    const edits = [
      {
        id: 'entities',
        clauseType: 'Definitions',
        title: 'Entities wording',
        severity: 0,
        rationale: '',
        paragraphIndex: 0,
        proposal: {
          operation: 'replace' as const,
          target: 'A & B “quotes”',
          replacement: 'Parties'
        }
      }
    ];
    const res = await exportTrackedChanges({ base64, edits, author: 'EdgeScraperPro', correlationId: 'entities-test' });
    expect(res.skipped?.length ?? 0).toBe(0);
    const xml = await extractDocumentXml(res.base64);
    expect(xml).toMatch(/<w:delText[^>]*>A &amp; B “quotes”<\/w:delText>/);
    expect(xml).not.toMatch(/&amp;amp;/);
    expect(xml).toMatch(/<w:ins [^>]*>.*Parties.*<\/w:ins>/s);
    expect(xml).toContain('—ok');
  });
});
