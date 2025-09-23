import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'node:fs/promises';
import { clientIp, limitOrThrow } from '../../../src/lib/rate-limit';
import { generateTrackedChanges } from '../../../src/nda/aspose';

export const config = {
  api: {
    bodyParser: false,
  },
};

type FormidableFile = formidable.File;

function parseForm(
  req: NextApiRequest
): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function firstFile(input: FormidableFile | FormidableFile[] | undefined): FormidableFile | null {
  if (!input) return null;
  return Array.isArray(input) ? input[0] : input;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.KILL_SWITCH === '1') {
    return res.status(503).json({ error: 'Service temporarily unavailable', code: 'KILLED' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let originalPath: string | undefined;
  let revisedPath: string | undefined;
  try {
    const ip = clientIp(req);
    await limitOrThrow(`nda-export-aspose:${ip}`, { points: 6, window: '60 s' });

    const { fields, files } = await parseForm(req);
    const original = firstFile(files.original || files.base || files.file);
    const proposed = firstFile(files.proposed || files.revised);

    if (!original?.filepath || !proposed?.filepath) {
      return res.status(400).json({ error: 'Missing original/proposed files' });
    }

    originalPath = original.filepath;
    revisedPath = proposed.filepath;

    const resultFileName = (fields.resultFileName as string) || 'nda_redlines.docx';
    const author = (fields.author as string) || 'EdgeScraperPro NDA Bot';

    const buffer = await generateTrackedChanges({
      originalPath,
      revisedPath,
      resultFileName,
      author,
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${resultFileName}"`);
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[nda-export-docx error]', err);
    if (err?.code === 'ASPOSE_UNAVAILABLE' || err?.statusCode === 503) {
      return res
        .status(503)
        .json({ error: 'Aspose service unavailable', code: 'ASPOSE_UNAVAILABLE' });
    }
    return res.status(500).json({ error: 'Export failed' });
  } finally {
    try {
      if (originalPath) {
        await fs.unlink(originalPath);
      }
      if (revisedPath) {
        await fs.unlink(revisedPath);
      }
    } catch (cleanupError) {
      // ignore cleanup failures
    }
  }
}
