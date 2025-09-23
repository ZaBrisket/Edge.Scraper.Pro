import { Buffer } from 'node:buffer';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import { parseStringPromise, Builder } from 'xml2js';
import { DocxParagraph, DocxStructure } from './types';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function sanitizePlainText(input: string): string {
  const stripped = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return stripped.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTextFromParagraph(paragraph: any): string {
  if (!paragraph) {
    return '';
  }

  const runs = Array.isArray(paragraph['w:r']) ? paragraph['w:r'] : [];
  const texts: string[] = [];

  runs.forEach((run: any) => {
    if (Array.isArray(run['w:t'])) {
      run['w:t'].forEach((t: any) => {
        if (typeof t === 'string') {
          texts.push(t);
        } else if (t?._) {
          texts.push(t._);
        }
      });
    }

    if (Array.isArray(run['w:tab'])) {
      texts.push('\t');
    }

    if (Array.isArray(run['w:br'])) {
      texts.push('\n');
    }
  });

  return sanitizePlainText(texts.join(' '));
}

function getParagraphNumbering(paragraph: any): { numbering?: string | null; level?: number } {
  const properties = paragraph['w:pPr']?.[0];
  const numPr = properties?.['w:numPr']?.[0];
  const level = numPr?.['w:ilvl']?.[0]?.['$']?.['w:val'];
  const numId = numPr?.['w:numId']?.[0]?.['$']?.['w:val'];

  if (numId) {
    const numbering = level ? `${numId}.${level}` : `${numId}`;
    return {
      numbering,
      level: level ? Number.parseInt(level, 10) : undefined,
    };
  }

  return { numbering: null, level: undefined };
}

export function validateDocxInput(
  fileName: string | undefined,
  mimeType: string | undefined,
  buffer: Buffer | undefined,
): void {
  if (!buffer || !buffer.length) {
    throw new Error('No document data received.');
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error('Document exceeds 5MB limit.');
  }

  if (!fileName?.toLowerCase().endsWith('.docx')) {
    throw new Error('Only .docx files are supported.');
  }

  if (mimeType && mimeType !== DOCX_CONTENT_TYPE) {
    throw new Error('Unsupported MIME type. Only .docx documents are allowed.');
  }
}

export async function extractStructuredDocx(buffer: Buffer): Promise<DocxStructure> {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('Unable to locate document.xml in .docx archive.');
  }

  const documentXml = await documentFile.async('text');
  const xmlDocument = await parseStringPromise(documentXml, {
    preserveChildrenOrder: true,
    explicitArray: true,
  });

  const body = xmlDocument['w:document']?.['w:body']?.[0];
  const paragraphNodes: any[] = Array.isArray(body?.['w:p']) ? body['w:p'] : [];

  const paragraphs: DocxParagraph[] = paragraphNodes.map((node, index) => {
    const text = extractTextFromParagraph(node);
    const numberingDetails = getParagraphNumbering(node);

    return {
      id: `p-${index}`,
      text,
      numbering: numberingDetails.numbering ?? null,
      level: numberingDetails.level,
      nodeIndex: index,
      properties: node['w:pPr']?.[0],
      runs: node['w:r'],
    };
  });

  const mammothResult = await mammoth.extractRawText({ buffer });
  const plainText = sanitizePlainText(mammothResult.value || paragraphs.map((p) => p.text).join('\n'));

  return {
    source: 'docx',
    plainText,
    paragraphs,
    documentXml,
    xmlDocument,
    originalBuffer: buffer,
  };
}

export function buildStructureFromPlainText(text: string): DocxStructure {
  const normalized = text.replace(/\r\n/g, '\n');
  const rawBlocks = normalized.split(/\n{2,}/);
  const paragraphs: DocxParagraph[] = rawBlocks
    .map((block) => sanitizePlainText(block))
    .map((block) => block.trim())
    .filter((block) => block.length)
    .map((block, index) => ({
      id: `text-${index}`,
      text: block,
      numbering: null,
      level: undefined,
      nodeIndex: index,
    }));

  return {
    source: 'text',
    plainText: paragraphs.map((paragraph) => paragraph.text).join('\n'),
    paragraphs,
  };
}

export async function rebuildDocumentXml(structure: DocxStructure): Promise<string> {
  if (!structure.xmlDocument) {
    const builder = new Builder({ headless: true });
    return builder.buildObject({});
  }

  const builder = new Builder({ headless: true });
  return builder.buildObject(structure.xmlDocument);
}

export { sanitizePlainText };
