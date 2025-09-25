import { exportTrackedChanges } from '../../src/services/nda/docx';
import { createDocx, extractDocumentXml, paragraph } from './helpers/docxTestUtils';

describe('exportTrackedChanges', () => {
  test('export inserts w:ins and w:del around changed text', async () => {
    const base64 = await createDocx([paragraph('The term shall be thirty (30) months.')]);
    const edits = [
      {
        id: 'term-change',
        clauseType: 'Term',
        title: 'Term duration',
        severity: 0,
        rationale: '',
        paragraphIndex: 0,
        proposal: {
          operation: 'replace' as const,
          target: 'thirty (30) months',
          replacement: '24 months'
        }
      }
    ];
    const res = await exportTrackedChanges({ base64, edits, author: 'EdgeScraperPro', correlationId: 'jest-basic' });
    const xml = await extractDocumentXml(res.base64);
    expect(xml).toContain('<w:del ');
    expect(xml).toContain('<w:ins ');
    expect(xml).toContain('24 months');
  });
});
