import JSZip from 'jszip';

type ParagraphInput = string | string[];

const DOC_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export async function createDocx(paragraphs: ParagraphInput[]): Promise<string> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `${DOC_HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`
  );
  const paragraphXml = paragraphs
    .map((p) => (Array.isArray(p) ? p.join('') : p))
    .join('');
  const documentXml = `${DOC_HEADER}
<w:document xmlns:w="${WORD_NAMESPACE}">
  <w:body>
    ${paragraphXml}
  </w:body>
</w:document>`;
  zip.folder('word')?.file('document.xml', documentXml);
  zip.folder('_rels')?.file(
    '.rels',
    `${DOC_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf.toString('base64');
}

export async function extractDocumentXml(base64: string): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  const doc = zip.file('word/document.xml');
  if (!doc) {
    throw new Error('word/document.xml missing');
  }
  return doc.async('text');
}

export function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
