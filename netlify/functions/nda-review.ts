import type { Handler } from '@netlify/functions';
import { EDGEWATER_CHECKLIST } from '../../src/nda/checklist.edgewater';
import { parseBuffer } from '../../src/nda/parser';
import { runExtraction } from '../../src/nda/extractor';
import { sha256Hex, writeAudit } from '../../src/nda/audit';
import { pickVariant } from '../../src/nda/checklist.registry';
import { limitOrThrow, clientIp } from '../../src/lib/rate-limit';

const MAX_BYTES = parseInt(process.env.NDA_MAX_BYTES || '10485760', 10);
const MAX_PAGES = parseInt(process.env.NDA_MAX_PAGES || '60', 10);
const LEGAL_DISCLAIMER =
  'This tool is an automated checklist reviewer. It is NOT legal advice. Outputs require review and approval by qualified counsel.';

export const handler: Handler = async (event, context) => {
  try {
    if (process.env.KILL_SWITCH === '1') {
      return json(503, { error: 'Service temporarily unavailable for maintenance', code: 'KILLED' });
    }

    await limitOrThrow(`nda-review:${clientIp(event, context)}`, { points: 10, window: '60 s' });

    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }

    const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
    const payload = JSON.parse(body);

    if (!payload?.file?.content || !payload?.file?.contentType) {
      return json(400, { error: 'Missing {file:{content, contentType}}' });
    }

    const buf = Buffer.from(payload.file.content, 'base64');
    if (buf.byteLength > MAX_BYTES) {
      return json(413, { error: `File too large (max ${MAX_BYTES} bytes)` });
    }

    let parsed;
    try {
      parsed = await parseBuffer(buf, payload.file.contentType);
    } catch (e: any) {
      if (e?.code === 'NEEDS_OCR') {
        return json(412, { error: 'Scanned PDF requires OCR', code: 'NEEDS_OCR' });
      }
      throw e;
    }

    if ((parsed.pages || 0) > MAX_PAGES) {
      return json(422, {
        error: `Document too long (${parsed.pages} pages, max ${MAX_PAGES})`,
        code: 'TOO_LONG'
      });
    }

    const start = Date.now();
    const { findings } = runExtraction(parsed.text, EDGEWATER_CHECKLIST);
    const processingMs = Date.now() - start;

    const docSha256 = sha256Hex(buf);
    const variant = pickVariant(docSha256);

    const result = {
      checklistId: EDGEWATER_CHECKLIST.id,
      checklistVersion: EDGEWATER_CHECKLIST.version,
      variant,
      findings,
      stats: { tokens: parsed.text.length, pages: parsed.pages, processingMs },
      audit: { docSha256, createdAt: new Date().toISOString() }
    };

    await writeAudit({
      kind: 'review',
      checklistId: result.checklistId,
      version: result.checklistVersion,
      docSha256,
      createdAt: result.audit.createdAt
    });

    return json(200, { data: result, disclaimer: LEGAL_DISCLAIMER });
  } catch (err: any) {
    console.error('[nda-review error]', err);
    if (err.statusCode === 429) {
      return json(429, { error: 'Too Many Requests', reset: err.reset });
    }
    return json(500, { error: 'Internal Server Error' });
  }
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
