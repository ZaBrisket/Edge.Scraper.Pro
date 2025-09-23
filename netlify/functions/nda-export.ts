import type { Handler, HandlerEvent } from '@netlify/functions';
import { Readable } from 'node:stream';
import { WordsApi, CompareData, ConvertDocumentRequest, DownloadFileRequest, UploadFileRequest, CompareDocumentRequest } from 'asposewordscloud';
import { applyRanges, previewDiff } from '../../src/lib/nda/diff';

function parseJsonBody(event: HandlerEvent): any {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toHtmlParagraphs(text: string) {
  const escape = (value: string) => value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]!));
  return `<html><head><meta charset="utf-8"></head><body>${text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escape(paragraph.trim())}</p>`)
    .join('')}</body></html>`;
}

function bufferToStream(buffer: Buffer) {
  return Readable.from(buffer);
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const appSid = process.env.ASPOSE_WORDS_APP_SID;
    const appKey = process.env.ASPOSE_WORDS_APP_KEY;

    if (!appSid || !appKey) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          code: 'ASPOSE_CREDS_MISSING',
          message: 'Set Netlify environment variables ASPOSE_WORDS_APP_SID and ASPOSE_WORDS_APP_KEY.'
        })
      };
    }

    const body = parseJsonBody(event);
    const normalizedText = typeof body.normalizedText === 'string' ? body.normalizedText : '';
    const downloadName = typeof body.downloadName === 'string' && body.downloadName.trim() ? body.downloadName.trim() : 'nda-tracked-changes.docx';
    const editsInput = Array.isArray(body.edits) ? body.edits : [];

    if (!normalizedText) {
      return { statusCode: 400, body: 'Missing normalizedText' };
    }

    const edits = editsInput
      .map((entry) => ({
        start: Number(entry.start),
        end: Number(entry.end),
        replacement: typeof entry.replacement === 'string' ? entry.replacement : ''
      }))
      .filter((entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end >= entry.start && entry.replacement);

    const revisedText = edits.length ? applyRanges(normalizedText, edits.sort((a, b) => a.start - b.start)) : normalizedText;
    previewDiff(normalizedText, revisedText);

    const originalKind = typeof body.originalKind === 'string' ? body.originalKind : '';
    const originalText = typeof body.originalText === 'string' ? body.originalText : '';
    const originalFileBase64 = typeof body.originalFileBase64 === 'string' ? body.originalFileBase64 : '';

    if (originalKind !== 'docx' && originalKind !== 'text') {
      return { statusCode: 400, body: 'Unsupported originalKind' };
    }

    const wordsApi = new WordsApi(appSid, appKey);
    const timestamp = Date.now();
    const originalDocName = `nda-original-${timestamp}.docx`;
    const revisedDocName = `nda-revised-${timestamp}.docx`;
    const resultDocName = `nda-tracked-${timestamp}.docx`;

    if (originalKind === 'docx') {
      if (!originalFileBase64) {
        return { statusCode: 400, body: 'Missing originalFileBase64' };
      }
      const buffer = Buffer.from(originalFileBase64, 'base64');
      await wordsApi.uploadFile(new UploadFileRequest({
        path: originalDocName,
        fileContent: buffer
      }));
    } else {
      const html = toHtmlParagraphs(originalText || normalizedText);
      await wordsApi.convertDocument(
        new ConvertDocumentRequest({
          document: bufferToStream(Buffer.from(html, 'utf8')),
          format: 'docx',
          outPath: originalDocName
        })
      );
    }

    const revisedHtml = toHtmlParagraphs(revisedText);
    await wordsApi.convertDocument(
      new ConvertDocumentRequest({
        document: bufferToStream(Buffer.from(revisedHtml, 'utf8')),
        format: 'docx',
        outPath: revisedDocName
      })
    );

    const compareData = new CompareData({
      comparingWithDocument: revisedDocName,
      author: 'EdgeScraperPro',
      dateTime: new Date(),
      resultDocumentFormat: 'docx'
    });

    await wordsApi.compareDocument(
      new CompareDocumentRequest({
        name: originalDocName,
        compareData,
        destFileName: resultDocName
      })
    );

    const download = await wordsApi.downloadFile(new DownloadFileRequest({ path: resultDocName }));
    const fileBuffer = Buffer.isBuffer(download.body) ? (download.body as Buffer) : Buffer.from(download.body as ArrayBuffer);
    const base64 = fileBuffer.toString('base64');

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${downloadName}"`
      },
      body: base64,
      isBase64Encoded: true
    };
  } catch (error: any) {
    console.error('nda-export error', error?.response ?? error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
