import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { DocxExportRequest, DocxExportResponse, DocxParseResult } from "./types";

export interface Run {
  text: string;
  from: number;
  to: number;
  openXmlBefore: string;
  openXmlAfter: string;
}

interface NormalizationEntry {
  start: number;
  end: number;
}

interface ParagraphInfo {
  index: number;
  start: number;
  end: number;
  xml: string;
  runs: Run[];
  leads: string[];
  tail: string;
  decoded: string;
  normalized: string;
  map: NormalizationEntry[];
  isList: boolean;
  isTable: boolean;
}

export async function parseDocxToParagraphs(buf: Buffer): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(buf);
  const appXml = await safeText(zip, "docProps/app.xml");
  let pages: number | undefined;
  if (appXml) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(appXml);
      const props = parsed?.Properties ?? parsed?.Properties?.Properties;
      if (props && typeof props.Pages === "number") {
        pages = props.Pages;
      }
    } catch (_) {
      // ignore metadata parsing failures
    }
  }
  const docXml = await safeText(zip, "word/document.xml");
  if (!docXml) {
    return { paragraphs: [], meta: { pages }, notes: [] };
  }
  const paragraphs = parseParagraphsWithContext(docXml);
  const normalizedParagraphs = paragraphs
    .map((p) => collapseWhitespace(normalizeQuotesInText(p.decoded)).trim())
    .filter((text) => text.length > 0);
  return { paragraphs: normalizedParagraphs, meta: { pages }, notes: [] };
}

export async function exportTrackedChanges(req: DocxExportRequest): Promise<DocxExportResponse> {
  if (shouldUseLegacyMapper()) {
    return exportTrackedChangesLegacy(req);
  }
  const buf = Buffer.from(req.base64, "base64");
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("word/document.xml missing");
  }
  let xml = await docFile.async("text");
  let paragraphs = parseParagraphsWithContext(xml);
  const skipped: string[] = [];
  const author = req.author && req.author.trim() ? req.author.trim() : "EdgeScraperPro";
  const idGenerator = createIdGenerator((req.correlationId && req.correlationId.trim()) || req.base64.slice(0, 32));
  const tz = req.tz;

  req.edits.forEach((suggestion, index) => {
    const proposal = suggestion?.proposal;
    const targetRaw = proposal?.target ?? "";
    const normalizedTarget = buildNormalization(targetRaw).normalized;
    if (!normalizedTarget) {
      skipped.push(`Edit ${index + 1}: empty target text.`);
      return;
    }

    const replacementRaw = proposal?.operation === "delete" ? "" : proposal?.replacement ?? "";
    const candidateOrder: number[] = [];
    if (Number.isFinite(suggestion?.paragraphIndex)) {
      const idx = Number(suggestion.paragraphIndex);
      if (idx >= 0 && idx < paragraphs.length) {
        candidateOrder.push(idx);
      }
    }
    for (let i = 0; i < paragraphs.length; i += 1) {
      if (!candidateOrder.includes(i)) {
        candidateOrder.push(i);
      }
    }

    let applied = false;
    let structureBlocked = false;

    for (const pIdx of candidateOrder) {
      const paragraph = paragraphs[pIdx];
      if (!paragraph) {
        continue;
      }
      if (paragraph.isList || paragraph.isTable) {
        structureBlocked = true;
        continue;
      }
      if (!paragraph.normalized) {
        continue;
      }
      const match = findMatch(paragraph, normalizedTarget);
      if (!match) {
        continue;
      }
      const updated = applyTrackedChange(paragraph, match.from, match.to, replacementRaw, author, tz, idGenerator);
      if (!updated) {
        continue;
      }
      xml = xml.slice(0, paragraph.start) + updated + xml.slice(paragraph.end);
      paragraphs = parseParagraphsWithContext(xml);
      applied = true;
      break;
    }

    if (!applied) {
      if (structureBlocked) {
        skipped.push(`Edit ${index + 1}: skipped because the target paragraph is inside a list or table.`);
      } else {
        skipped.push(`Edit ${index + 1}: unable to map target text within document.`);
      }
    }
  });

  await zip.file("word/document.xml", xml);
  const out = await zip.generateAsync({ type: "nodebuffer" });
  return {
    base64: out.toString("base64"),
    filename: "nda-redlines.docx",
    skipped
  };
}

async function exportTrackedChangesLegacy(req: DocxExportRequest): Promise<DocxExportResponse> {
  const buf = Buffer.from(req.base64, "base64");
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("word/document.xml missing");
  }
  let xml = await docFile.async("text");
  const skipped: string[] = [];
  const author = req.author && req.author.trim() ? req.author.trim() : "EdgeScraperPro";
  const idGenerator = createIdGenerator((req.correlationId && req.correlationId.trim()) || req.base64.slice(0, 32));
  const tz = req.tz;
  req.edits.forEach((suggestion, index) => {
    const proposal = suggestion?.proposal;
    if (!proposal?.target) {
      skipped.push(`Edit ${index + 1}: empty target text.`);
      return;
    }
    const replacementRaw = proposal.operation === "delete" ? "" : proposal.replacement ?? "";
    const tracked = buildTrackedRun(proposal.target, replacementRaw, author, tz, idGenerator);
    const before = xml;
    xml = legacyReplaceInTextRuns(xml, proposal.target, tracked);
    if (xml === before) {
      skipped.push(`Edit ${index + 1}: legacy mapper could not locate target text.`);
    }
  });
  await zip.file("word/document.xml", xml);
  const out = await zip.generateAsync({ type: "nodebuffer" });
  return {
    base64: out.toString("base64"),
    filename: "nda-redlines.docx",
    skipped
  };
}

function applyTrackedChange(
  paragraph: ParagraphInfo,
  from: number,
  to: number,
  replacement: string,
  author: string,
  tz: string | undefined,
  idGenerator: () => string
): string | null {
  if (from >= to) {
    return null;
  }
  const original = paragraph.decoded.slice(from, to);
  const tracked = buildTrackedRun(original, replacement, author, tz, idGenerator);
  let xml = "";
  let inserted = false;

  for (let i = 0; i < paragraph.runs.length; i += 1) {
    const run = paragraph.runs[i];
    xml += paragraph.leads[i] ?? "";
    if (to <= run.from || from >= run.to) {
      xml += renderSegment(run, run.text);
      continue;
    }
    const startOffset = Math.max(from, run.from) - run.from;
    const endOffset = Math.min(to, run.to) - run.from;
    const before = startOffset > 0 ? run.text.slice(0, startOffset) : "";
    const after = endOffset < run.text.length ? run.text.slice(endOffset) : "";
    if (before) {
      xml += renderSegment(run, before);
    }
    if (!inserted) {
      xml += tracked;
      inserted = true;
    }
    if (after) {
      xml += renderSegment(run, after);
    }
  }
  xml += paragraph.tail;
  return inserted ? xml : null;
}

function renderSegment(run: Run, text: string): string {
  if (!text) {
    return "";
  }
  return `${run.openXmlBefore}${encodeXml(text)}${run.openXmlAfter}`;
}

function legacyReplaceInTextRuns(docXml: string, targetText: string, replacementWithOOXML: string): string {
  const idx = docXml.indexOf(targetText);
  if (idx === -1) {
    return docXml;
  }
  const openIdx = docXml.lastIndexOf("<w:t", idx);
  if (openIdx === -1) {
    return docXml;
  }
  const start = docXml.indexOf(">", openIdx);
  if (start === -1) {
    return docXml;
  }
  const contentStart = start + 1;
  const closeIdx = docXml.indexOf("</w:t>", idx);
  if (closeIdx === -1) {
    return docXml;
  }
  const beforeText = docXml.slice(contentStart, idx);
  const afterText = docXml.slice(idx + targetText.length, closeIdx);
  const prefix = docXml.slice(0, contentStart);
  const suffix = docXml.slice(closeIdx);
  const middle = `${encodeXml(beforeText)}</w:t></w:r>${replacementWithOOXML}<w:r><w:rPr/><w:t xml:space="preserve">${encodeXml(afterText)}`;
  return `${prefix}${middle}${suffix}`;
}

function findMatch(paragraph: ParagraphInfo, normalizedTarget: string): { from: number; to: number } | null {
  if (!normalizedTarget || !paragraph.normalized || paragraph.map.length === 0) {
    return null;
  }
  const idx = paragraph.normalized.indexOf(normalizedTarget);
  if (idx === -1) {
    return null;
  }
  const startEntry = paragraph.map[idx];
  const endEntry = paragraph.map[idx + normalizedTarget.length - 1];
  if (!startEntry || !endEntry) {
    return null;
  }
  return { from: startEntry.start, to: endEntry.end };
}

function parseParagraphsWithContext(xml: string): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  const regex = /<w:p\b[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const start = match.index;
    const slice = match[0];
    const end = start + slice.length;
    const parsed = parseParagraph(slice);
    const isList = /<w:numPr\b/i.test(slice);
    const isTable = isParagraphInsideTable(xml, start);
    paragraphs.push({
      index: paragraphs.length,
      start,
      end,
      xml: slice,
      runs: parsed.runs,
      leads: parsed.leads,
      tail: parsed.tail,
      decoded: parsed.decoded,
      normalized: parsed.normalized,
      map: parsed.map,
      isList,
      isTable
    });
  }
  return paragraphs;
}

function parseParagraph(xml: string): {
  runs: Run[];
  leads: string[];
  tail: string;
  decoded: string;
  normalized: string;
  map: NormalizationEntry[];
} {
  const runRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  const runs: Run[] = [];
  const leads: string[] = [];
  let tail = "";
  let decoded = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = runRegex.exec(xml)) !== null) {
    const rawText = match[1];
    const fullMatch = match[0];
    const relTextStart = match.index + fullMatch.indexOf(">") + 1;
    const relTextEnd = relTextStart + rawText.length;
    const runStart = xml.lastIndexOf("<w:r", match.index);
    if (runStart === -1) {
      continue;
    }
    const runEndIndex = xml.indexOf("</w:r>", relTextEnd);
    if (runEndIndex === -1) {
      continue;
    }
    const runEnd = runEndIndex + "</w:r>".length;
    leads.push(xml.slice(cursor, runStart));
    const openXmlBefore = xml.slice(runStart, relTextStart);
    const openXmlAfter = xml.slice(relTextEnd, runEnd);
    const decodedText = decodeXml(rawText);
    const from = decoded.length;
    const to = from + decodedText.length;
    runs.push({ text: decodedText, from, to, openXmlBefore, openXmlAfter });
    decoded += decodedText;
    cursor = runEnd;
  }
  tail = xml.slice(cursor);
  const normalization = buildNormalization(decoded);
  return { runs, leads, tail, decoded, normalized: normalization.normalized, map: normalization.map };
}

function buildTrackedRun(original: string, replacement: string, author: string, tz: string | undefined, idGenerator: () => string): string {
  const timestamp = getTimestamp(tz);
  const delId = idGenerator();
  const insId = idGenerator();
  const delText = encodeXml(original);
  const insText = encodeXml(replacement);
  const del = `<w:del w:author="${encodeXmlAttribute(author)}" w:date="${timestamp}" w:id="${delId}"><w:r><w:rPr/><w:delText xml:space="preserve">${delText}</w:delText></w:r></w:del>`;
  if (!replacement) {
    return del;
  }
  const ins = `<w:ins w:author="${encodeXmlAttribute(author)}" w:date="${timestamp}" w:id="${insId}"><w:r><w:rPr/><w:t xml:space="preserve">${insText}</w:t></w:r></w:ins>`;
  return `${del}${ins}`;
}

function getTimestamp(tz?: string): string {
  if (!tz) {
    return new Date().toISOString();
  }
  try {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
  } catch (_) {
    return new Date().toISOString();
  }
}

function buildNormalization(text: string): { normalized: string; map: NormalizationEntry[] } {
  const normalizedChars: string[] = [];
  const map: NormalizationEntry[] = [];
  let i = 0;
  let spaceStart: number | null = null;
  const commitSpace = (endIndex: number) => {
    if (spaceStart === null) {
      return;
    }
    if (normalizedChars.length > 0) {
      normalizedChars.push(" ");
      map.push({ start: spaceStart, end: endIndex });
    }
    spaceStart = null;
  };

  while (i < text.length) {
    const ch = text[i];
    if (isWhitespace(ch)) {
      if (spaceStart === null) {
        spaceStart = i;
      }
      i += 1;
      continue;
    }
    commitSpace(i);
    const normalizedChar = normalizeQuoteChar(ch);
    normalizedChars.push(normalizedChar);
    map.push({ start: i, end: i + 1 });
    i += 1;
  }
  commitSpace(text.length);
  if (normalizedChars.length && normalizedChars[0] === " ") {
    normalizedChars.shift();
    map.shift();
  }
  if (normalizedChars.length && normalizedChars[normalizedChars.length - 1] === " ") {
    normalizedChars.pop();
    map.pop();
  }
  return { normalized: normalizedChars.join(""), map };
}

function normalizeQuotesInText(text: string): string {
  return Array.from(text).map(normalizeQuoteChar).join("");
}

function normalizeQuoteChar(ch: string): string {
  switch (ch) {
    case "\u2018":
    case "\u2019":
    case "\u201A":
    case "\u201B":
    case "\u2032":
    case "\u2035":
      return "'";
    case "\u201C":
    case "\u201D":
    case "\u201E":
    case "\u201F":
    case "\u2033":
    case "\u2036":
      return '"';
    default:
      return ch;
  }
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch) || ch === "\u00A0";
}

function collapseWhitespace(text: string): string {
  return text.replace(/[\s\u00A0]+/g, " ");
}

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function encodeXmlAttribute(text: string): string {
  return encodeXml(text);
}

async function safeText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) {
    return null;
  }
  return file.async("text");
}

function isParagraphInsideTable(xml: string, paragraphStart: number): boolean {
  const lastTableOpen = xml.lastIndexOf("<w:tbl", paragraphStart);
  if (lastTableOpen === -1) {
    return false;
  }
  const lastTableClose = xml.lastIndexOf("</w:tbl>", paragraphStart);
  return lastTableClose < lastTableOpen;
}

function shouldUseLegacyMapper(): boolean {
  const mode = (process.env.NDA_EXPORT_MAPPER || "v2").toLowerCase();
  return mode === "off" || mode === "v1" || mode === "legacy" || mode === "false";
}

function createIdGenerator(seed: string): () => string {
  const hashed = hashString(seed);
  const rng = mulberry32(hashed);
  let counter = Math.floor(rng() * 1000000) + 1;
  return () => String(counter++);
}

function hashString(input: string): number {
  let h = 2166136261 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default { parseDocxToParagraphs, exportTrackedChanges };
