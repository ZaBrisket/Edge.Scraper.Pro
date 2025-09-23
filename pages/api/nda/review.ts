import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'node:fs/promises';
import { parseFile } from '../../../src/nda/parser';
import { runExtraction } from '../../../src/nda/extractor';
import { sha256File, writeAudit } from '../../../src/nda/audit';
import { clientIp, limitOrThrow } from '../../../src/lib/rate-limit';
import { getChecklist, pickVariant } from '../../../src/nda/checklist.registry';
import { getCachedReview, setCachedReview } from '../../../src/nda/cache';

const LEGAL_DISCLAIMER =
  'This tool is an automated checklist reviewer. It is NOT legal advice. Outputs require review and approval by qualified counsel.';

const MAX_BYTES = parseInt(process.env.NDA_MAX_BYTES || '26214400', 10);
const MAX_PAGES = parseInt(process.env.NDA_MAX_PAGES || '60', 10);

type FormidableFile = formidable.File;

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseRequest(
  req: NextApiRequest
): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  const form = formidable({
    maxFileSize: MAX_BYTES,
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

function firstFile(file: formidable.File | formidable.File[] | undefined): FormidableFile | null {
  if (!file) return null;
  return Array.isArray(file) ? file[0] : file;
}

function respond(res: NextApiResponse, status: number, payload: any) {
  res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.KILL_SWITCH === '1') {
    return respond(res, 503, {
      error: 'Service temporarily unavailable for maintenance',
      code: 'KILLED',
    });
  }

  if (req.method !== 'POST') {
    return respond(res, 405, { error: 'Method Not Allowed' });
  }

  let uploadPath: string | undefined;
  try {
    const ip = clientIp(req);
    await limitOrThrow(`nda-review:${ip}`, { points: 10, window: '60 s' });

    const { fields, files } = await parseRequest(req);
    const formFields = fields as Record<string, any>;
    const optionsRaw = formFields.options as string | undefined;
    let useOCRRequested = false;
    if (typeof optionsRaw === 'string') {
      try {
        const parsedOptions = JSON.parse(optionsRaw);
        useOCRRequested = Boolean(parsedOptions.useOCR);
      } catch {}
    } else if (typeof formFields.useOCR === 'string') {
      useOCRRequested = formFields.useOCR === 'true';
    }

    const upload = firstFile(
      (files as Record<string, any>).file || (files as Record<string, any>).document
    );
    if (!upload || !upload.filepath) {
      return respond(res, 400, { error: 'Missing file upload' });
    }

    uploadPath = upload.filepath;
    const contentType = upload.mimetype || 'application/octet-stream';

    const docSha256 = await sha256File(uploadPath);
    const checklist = getChecklist('edgewater-nda');
    const cached = getCachedReview(docSha256, checklist.version);
    if (cached) {
      await writeAudit({
        kind: 'review',
        checklistId: cached.checklistId,
        version: cached.checklistVersion,
        docSha256,
        createdAt: new Date().toISOString(),
        meta: { cached: true, useOCRRequested },
      });
      return respond(res, 200, { data: cached, disclaimer: LEGAL_DISCLAIMER });
    }

    let parsed;
    try {
      parsed = await parseFile(uploadPath, contentType);
    } catch (err: any) {
      if (err?.code === 'NEEDS_OCR') {
        return respond(res, 412, { error: 'Scanned PDF requires OCR', code: 'NEEDS_OCR' });
      }
      throw err;
    }

    if ((parsed.pages || 0) > MAX_PAGES) {
      return respond(res, 422, {
        error: `Document too long (${parsed.pages} pages, max ${MAX_PAGES})`,
        code: 'TOO_LONG',
      });
    }

    const start = Date.now();
    const { findings } = runExtraction(parsed.text, checklist);
    const processingMs = Date.now() - start;
    const variant = pickVariant(docSha256);

    const result = {
      checklistId: checklist.id,
      checklistVersion: checklist.version,
      variant,
      findings,
      stats: { tokens: parsed.text.length, pages: parsed.pages, processingMs },
      audit: { docSha256, createdAt: new Date().toISOString() },
    };

    setCachedReview(result);

    await writeAudit({
      kind: 'review',
      checklistId: result.checklistId,
      version: result.checklistVersion,
      docSha256,
      createdAt: result.audit.createdAt,
      meta: { useOCRRequested },
    });

    respond(res, 200, { data: result, disclaimer: LEGAL_DISCLAIMER });
  } catch (err: any) {
    console.error('[nda-review error]', err);
    if (err?.httpCode === 413 || err?.message?.includes('maxFileSize exceeded')) {
      return respond(res, 413, { error: `File too large (max ${MAX_BYTES} bytes)` });
    }
    if (err?.statusCode === 429) {
      return respond(res, 429, { error: 'Too Many Requests', reset: err.reset });
    }
    respond(res, 500, { error: 'Internal Server Error' });
  } finally {
    // remove temp files when possible
    try {
      if (uploadPath) {
        await fs.unlink(uploadPath);
      }
    } catch (cleanupError) {
      // ignore cleanup failures
    }
  }
}
