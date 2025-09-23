import { Document, Packer, Paragraph, TextRun } from 'docx';
import { Buffer } from 'node:buffer';
import {
  buildStructureFromPlainText,
  extractStructuredDocx,
  sanitizePlainText,
  validateDocxInput,
} from './docx-processor';

describe('docx processor', () => {
  it('validates MIME type and extension', () => {
    const buffer = Buffer.from('test');
    expect(() => validateDocxInput('nda.pdf', 'application/pdf', buffer)).toThrow('Only .docx files are supported.');
    expect(() => validateDocxInput('nda.docx', 'application/pdf', buffer)).toThrow(
      'Unsupported MIME type. Only .docx documents are allowed.',
    );
  });

  it('extracts structured content from generated docx', async () => {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ children: [new TextRun('Confidential Information definition.')] }),
            new Paragraph({ children: [new TextRun('Permitted use is evaluation of the business opportunity.')] }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    validateDocxInput('nda.docx', undefined, buffer);
    const structure = await extractStructuredDocx(buffer);

    expect(structure.paragraphs).toHaveLength(2);
    expect(structure.paragraphs[0].text.toLowerCase()).toContain('confidential information');
    expect(structure.plainText.length).toBeGreaterThan(20);
  });

  it('builds structure from plain text and sanitizes control characters', () => {
    const structure = buildStructureFromPlainText('First paragraph\n\nSecond paragraph<script>alert(1)</script>');
    expect(structure.paragraphs).toHaveLength(2);
    expect(structure.paragraphs[1].text).toBe('Second paragraph');
    expect(sanitizePlainText('Hello\u0000World')).toBe('Hello World');
  });
});
