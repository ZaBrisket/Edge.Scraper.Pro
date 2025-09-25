import { exportTrackedChanges } from '../../src/services/nda/docx';
import { createDocx, extractDocumentXml } from './helpers/docxTestUtils';

describe('docx cross-run mapping', () => {
  test('finds replacements that span multiple runs', async () => {
    const paragraphXml = [
      '<w:p>',
      '<w:r><w:t xml:space="preserve">The term shall be </w:t></w:r>',
      '<w:r><w:t xml:space="preserve">thirty (30) </w:t></w:r>',
      '<w:r><w:t xml:space="preserve">months.</w:t></w:r>',
      '</w:p>'
    ];
    const base64 = await createDocx([paragraphXml]);
    const edits = [
      {
        id: 'cross-run',
        clauseType: 'Term',
        title: 'Cross-run term',
        severity: 0,
        rationale: '',
        paragraphIndex: 0,
        proposal: {
          operation: 'replace' as const,
          target: 'thirty (30) months.',
          replacement: '24 months.'
        }
      }
    ];
    const res = await exportTrackedChanges({ base64, edits, author: 'EdgeScraperPro', correlationId: 'cross-runs' });
    const xml = await extractDocumentXml(res.base64);
    const delIndex = xml.indexOf('<w:del ');
    const insIndex = xml.indexOf('<w:ins ');
    expect(delIndex).toBeGreaterThan(-1);
    expect(insIndex).toBeGreaterThan(-1);
    expect(delIndex).toBeLessThan(insIndex);
    expect(xml).toMatch(/<w:delText[^>]*>thirty \(30\) months\.<\/w:delText>/);
    expect(xml).toMatch(/<w:t xml:space="preserve">24 months\.<\/w:t>/);
    expect(xml).toContain('The term shall be ');
  });
});
