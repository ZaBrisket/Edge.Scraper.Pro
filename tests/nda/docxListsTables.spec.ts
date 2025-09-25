import { exportTrackedChanges } from '../../src/services/nda/docx';
import { createDocx, extractDocumentXml, paragraph } from './helpers/docxTestUtils';

describe('docx lists and tables', () => {
  test('skips edits inside list items and tables', async () => {
    const listParagraph = [
      '<w:p>',
      '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>',
      '<w:r><w:t xml:space="preserve">List item term</w:t></w:r>',
      '</w:p>'
    ];
    const tableXml = [
      '<w:tbl>',
      '<w:tr>',
      '<w:tc>',
      '<w:p><w:r><w:t xml:space="preserve">Table term</w:t></w:r></w:p>',
      '</w:tc>',
      '</w:tr>',
      '</w:tbl>'
    ];
    const base64 = await createDocx([listParagraph, tableXml, paragraph('Outside text')]);
    const edits = [
      {
        id: 'list-item',
        clauseType: 'List',
        title: 'List term',
        severity: 0,
        rationale: '',
        paragraphIndex: 0,
        proposal: {
          operation: 'replace' as const,
          target: 'List item term',
          replacement: 'Updated list term'
        }
      },
      {
        id: 'table-cell',
        clauseType: 'Table',
        title: 'Table term',
        severity: 0,
        rationale: '',
        paragraphIndex: 1,
        proposal: {
          operation: 'replace' as const,
          target: 'Table term',
          replacement: 'Updated table term'
        }
      }
    ];
    const res = await exportTrackedChanges({ base64, edits, author: 'EdgeScraperPro', correlationId: 'lists-tables' });
    expect(res.skipped).toBeDefined();
    expect(res.skipped).toHaveLength(2);
    expect(res.skipped?.join(' ') || '').toMatch(/list/);
    expect(res.skipped?.join(' ') || '').toMatch(/table/);
    const xml = await extractDocumentXml(res.base64);
    expect(xml).not.toMatch(/<w:del /);
    expect(xml).not.toMatch(/<w:ins /);
    expect(xml).toContain('List item term');
    expect(xml).toContain('Table term');
  });
});
