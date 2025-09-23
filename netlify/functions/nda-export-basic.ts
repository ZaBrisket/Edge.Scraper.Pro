import type { Handler } from '@netlify/functions';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Header, Footer } from 'docx';
import DiffMatchPatch from '@2toad/diff-match-patch';
import { limitOrThrow, clientIp } from '../../src/lib/rate-limit';

export const handler: Handler = async (event, context) => {
  try {
    if (process.env.KILL_SWITCH === '1') {
      return res(503, { error: 'Temporarily unavailable', code: 'KILLED' });
    }

    await limitOrThrow(`nda-export-basic:${clientIp(event, context)}`, { points: 20, window: '60 s' });

    if (event.httpMethod !== 'POST') {
      return res(405, { error: 'Method Not Allowed' });
    }

    const { originalText = '', proposedText = '', resultFileName = 'nda_redlines_basic.docx' } = JSON.parse(event.body || '{}');

    if (!originalText && !proposedText) {
      return res(400, { error: 'Missing originalText/proposedText' });
    }

    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(originalText, proposedText);
    dmp.diff_cleanupSemantic(diffs);

    const children: Paragraph[] = [
      new Paragraph({ text: 'NDA Redlines (Basic Export)', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun({ text: 'NOT LEGAL ADVICE — DRAFT', bold: true, color: 'FF0000' })] }),
      new Paragraph({ text: '' })
    ];

    diffs.forEach(([op, data]) => {
      if (!data.trim()) return;
      const run =
        op === 0
          ? new TextRun({ text: data })
          : op === -1
          ? new TextRun({ text: data, strike: true, color: 'FF0000' })
          : new TextRun({ text: data, bold: true, color: '00FF00' });
      children.push(new Paragraph({ children: [run] }));
    });

    const doc = new Document({
      creator: 'EdgeScraperPro NDA Reviewer',
      description: 'Automated checklist output — NOT LEGAL ADVICE',
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Automated Checklist Output — NOT LEGAL ADVICE', italics: true, size: 20 })]
                })
              ]
            })
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({ children: [new TextRun({ text: 'Review required by counsel before use', size: 18 })] })]
            })
          },
          children
        }
      ]
    });

    const buff = await Packer.toBuffer(doc);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${resultFileName}"`
      },
      body: buff.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err: any) {
    console.error('[nda-export-basic error]', err);
    return res(500, { error: 'Export failed' });
  }
};

function res(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
