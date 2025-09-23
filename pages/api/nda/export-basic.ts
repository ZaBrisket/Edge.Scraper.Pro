import type { NextApiRequest, NextApiResponse } from 'next';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Header, Footer } from 'docx';
import DiffMatchPatch from '@2toad/diff-match-patch';
import { clientIp, limitOrThrow } from '../../../src/lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.KILL_SWITCH === '1') {
    return res.status(503).json({ error: 'Temporarily unavailable', code: 'KILLED' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const ip = clientIp(req);
    await limitOrThrow(`nda-export-basic:${ip}`, { points: 20, window: '60 s' });

    const {
      originalText = '',
      proposedText = '',
      resultFileName = 'nda_redlines_basic.docx',
    } = req.body || {};

    if (!originalText && !proposedText) {
      return res.status(400).json({ error: 'Missing originalText/proposedText' });
    }

    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(originalText, proposedText);
    dmp.diff_cleanupSemantic(diffs);

    const children: Paragraph[] = [
      new Paragraph({ text: 'NDA Redlines (Basic Export)', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [new TextRun({ text: 'NOT LEGAL ADVICE — DRAFT', bold: true, color: 'FF0000' })],
      }),
      new Paragraph({ text: '' }),
    ];

    diffs.forEach(([op, data]) => {
      if (!data.trim()) return;
      const run =
        op === 0
          ? new TextRun({ text: data })
          : op === -1
            ? new TextRun({ text: data, strike: true, color: 'FF0000' })
            : new TextRun({ text: data, bold: true, color: '00AA00' });
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
                  children: [
                    new TextRun({
                      text: 'Automated Checklist Output — NOT LEGAL ADVICE',
                      italics: true,
                      size: 20,
                    }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Review required by counsel before use', size: 18 }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    const buff = await Packer.toBuffer(doc);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${resultFileName}"`);
    return res.status(200).send(buff);
  } catch (err: any) {
    console.error('[nda-export-basic error]', err);
    return res.status(500).json({ error: 'Export failed' });
  }
}
