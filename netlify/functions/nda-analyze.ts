import type { Handler, HandlerEvent } from '@netlify/functions';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';
import { analyzeNdaText } from '../../src/lib/nda/analyze';

function parseJsonBody(event: HandlerEvent): any {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();

    if (contentType.includes('application/json')) {
      const body = parseJsonBody(event);
      const kind = typeof body.kind === 'string' ? body.kind.toLowerCase() : '';

      if (kind === 'text') {
        const text = typeof body.text === 'string' ? body.text : '';
        if (!text.trim()) {
          return { statusCode: 400, body: 'Missing text' };
        }
        const result = analyzeNdaText(text);
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: true, ...result })
        };
      }

      if (kind === 'docx') {
        const base64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';
        if (!base64) {
          return { statusCode: 400, body: 'Missing fileBase64' };
        }
        const buffer = Buffer.from(base64, 'base64');
        const type = await fileTypeFromBuffer(buffer);
        if (!type || (type.mime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && type.ext !== 'docx')) {
          return { statusCode: 400, body: 'File is not a .docx' };
        }
        const { value } = await mammoth.extractRawText({ buffer });
        const text = (value || '').trim();
        if (!text) {
          return { statusCode: 400, body: 'Empty document' };
        }
        const result = analyzeNdaText(text);
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: true, ...result })
        };
      }

      return { statusCode: 400, body: 'Unsupported kind' };
    }

    return { statusCode: 415, body: 'Use application/json with {kind,fileBase64|text}' };
  } catch (error) {
    console.error('nda-analyze error', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
