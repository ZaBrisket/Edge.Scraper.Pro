import JSZip from 'jszip';
import Engine from '../../src/services/nda/policyEngine';
import { parseDocxToParagraphs, exportTrackedChanges } from '../../src/services/nda/docx';

describe('NDA Reviewer v2 integration', () => {
  it('parses docx, analyzes clauses, and exports selected tracked changes', async () => {
    const paragraphs = [
      'The term shall be 30 months.',
      'Your affiliates, portfolio companies and all related entities shall immediately be deemed Representatives under this Agreement.',
    ];
    const base64 = await buildDocx(paragraphs);

    const parseResult = await parseDocxToParagraphs(Buffer.from(base64, 'base64'));
    expect(parseResult.paragraphs).toHaveLength(paragraphs.length);

    const joined = parseResult.paragraphs.join('\n\n');
    const analysis = Engine.analyze(joined);

    const termSuggestion = analysis.suggestions.find((s) => s.clauseType === 'Term');
    const affiliateSuggestion = analysis.suggestions.find((s) => s.clauseType === 'Affiliate Language');

    expect(termSuggestion).toBeTruthy();
    expect(affiliateSuggestion).toBeTruthy();

    const applied = Engine.apply(joined, termSuggestion ? [termSuggestion] : []);
    expect(applied.text).toContain('24 months');
    expect(applied.text).not.toContain('30 months');
    // Affiliate language remains untouched because it was not selected.
    expect(applied.text).toContain('affiliates, portfolio companies');

    const exportResult = await exportTrackedChanges({ base64, edits: termSuggestion ? [termSuggestion] : [], author: 'Test Runner' });
    expect(exportResult.skipped).toEqual([]);

    const outZip = await JSZip.loadAsync(Buffer.from(exportResult.base64, 'base64'));
    const xml = await outZip.file('word/document.xml')?.async('text');
    expect(xml).toBeTruthy();
    expect(xml).toMatch(/<w:del /);
    expect(xml).toMatch(/<w:ins /);
    expect(xml).toMatch(/24 months/);
    // Original affiliate paragraph still present to demonstrate selective export.
    expect(xml).toMatch(/affiliates, portfolio companies/);
  });
});

async function buildDocx(paragraphs: string[]): Promise<string> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  const body = paragraphs
    .map((text) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`)
    .join('\n');
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf.toString('base64');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
