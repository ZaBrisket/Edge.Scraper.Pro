import { Document, Packer, Paragraph, TextRun } from 'docx';
import { Buffer } from 'node:buffer';
import { analyzeNda } from './analyzer';
import { EDGEWATER_CHECKLIST } from './similarity-scorer';

describe('NDA analyzer integration', () => {
  it('analyzes plain text input and returns checklist coverage', async () => {
    const text = `${EDGEWATER_CHECKLIST[0].standardText}\n\n${EDGEWATER_CHECKLIST[1].standardText}`;
    const response = await analyzeNda({ text, sessionId: 'test-text' });

    expect(response.issues).toHaveLength(EDGEWATER_CHECKLIST.length);
    const additions = response.issues.filter((issue) => issue.action === 'add');
    expect(additions.length).toBeGreaterThan(0);
    expect(response.metrics.totalClauses).toBeGreaterThan(0);
  });

  it('processes a docx upload and generates tracked changes export', async () => {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun(
                  'Recipient agrees to hold all Confidential Information in strict confidence and not disclose it to third parties.',
                ),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun('Upon request the receiving party will return all materials and certify destruction.'),
              ],
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const baseRequest = {
      fileBuffer: Buffer.from(buffer),
      fileName: 'sample.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sessionId: 'docx-session',
    } as const;

    const response = await analyzeNda(baseRequest);
    expect(response.issues).toHaveLength(EDGEWATER_CHECKLIST.length);
    expect(response.metrics.totalClauses).toBeGreaterThanOrEqual(2);
    const missing = response.issues.filter((issue) => issue.action === 'add');
    expect(missing.length).toBeGreaterThan(0);

    const actionableIds = response.issues
      .filter((issue) => issue.action === 'add' || issue.action === 'replace')
      .slice(0, 2)
      .map((issue) => issue.id);

    const exportResponse = await analyzeNda({
      ...baseRequest,
      includeDocxExport: true,
      selectedIssueIds: actionableIds,
    });

    expect(exportResponse.exportDocumentBase64).toBeDefined();
    if (exportResponse.exportDocumentBase64) {
      const exportedBuffer = Buffer.from(exportResponse.exportDocumentBase64, 'base64');
      expect(exportedBuffer.length).toBeGreaterThan(0);
    }
  });
});
