import { normalizeText } from './text/normalizer';

export async function parseBuffer(buf: Buffer, contentType: string): Promise<{ text: string; pages?: number }> {
  if (/text\/plain/i.test(contentType)) {
    return { text: normalizeText(buf.toString('utf8')) };
  }

  if (/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i.test(contentType) || /\.docx$/i.test(contentType)) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: normalizeText(value) };
  }

  if (/application\/pdf/i.test(contentType) || /\.pdf$/i.test(contentType)) {
    const pdfParse = (await import('pdf-parse')).default;
    const out = await pdfParse(buf);
    const text = normalizeText(out.text || '');
    if (text && text.length > 1000) {
      return { text, pages: (out as any).numpages || (out as any).numPages };
    }
    throw Object.assign(new Error('Scanned PDF requires OCR'), { code: 'NEEDS_OCR' });
  }

  throw new Error(`Unsupported content type: ${contentType}`);
}
