import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { DocxParseResult, DocxExportRequest, DocxExportResponse } from "./types";

export async function parseDocxToParagraphs(buf: Buffer): Promise<DocxParseResult> {
// Try to read Pages count from docProps/app.xml; extract word/document.xml text into paragraphs.
const zip = await JSZip.loadAsync(buf);
const appXml = await safeText(zip, "docProps/app.xml");
let pages: number | undefined;
if (appXml) {
  try {
    const parser = new XMLParser({ ignoreAttributes: false });
    const j = parser.parse(appXml);
    const sheets = j.Properties && j.Properties.Properties && j.Properties.Properties.Pages;
    pages = typeof sheets === "number" ? sheets : undefined;
  } catch (_) {}
}
const docXml = await safeText(zip, "word/document.xml");
if (!docXml) {
  return { paragraphs: [], meta: { pages } };
}
// Extract paragraph <w:p> text by concatenating all <w:t> within
const pTexts: string[] = [];
const pMatches = docXml.split(/<w:p\b/);
pMatches.shift(); // before first p
pMatches.forEach(chunk => {
  const segment = "<w:p " + chunk;
  const texts = Array.from(segment.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => decodeXml(m[1]));
  const joined = texts.join('');
  const cleaned = joined.replace(/\s+/g, ' ').trim();
  if (cleaned) pTexts.push(cleaned);
});
return { paragraphs: pTexts, meta: { pages }, notes: [] };
}

export async function exportTrackedChanges(req: DocxExportRequest): Promise<DocxExportResponse> {
const buf = Buffer.from(req.base64, "base64");
const zip = await JSZip.loadAsync(buf);
const docXml = await safeText(zip, "word/document.xml");
if (!docXml) throw new Error("word/document.xml missing");
let xmlStr = docXml;

const skipped: string[] = [];

// For each edit, perform within-paragraph text replacement by wrapping del/ins around substrings in <w:t>.
req.edits.forEach((s, i) => {
  const targetText = (s.proposal && s.proposal.target || '').trim();
  if (!targetText) return;
  // Replace only first occurrence to avoid over-redlining duplicates
  const delTag = trackedDel(s.proposal.target, req.author);
  const insTag = s.proposal.replacement ? trackedIns(s.proposal.replacement, req.author) : "";
  const repl = insTag ? `${delTag}${insTag}` : delTag;
  const before = xmlStr;
  xmlStr = replaceInTextRuns(xmlStr, targetText, repl);
  if (xmlStr === before) {
    skipped.push(`Edit ${i+1}: could not map text within runs (likely table/image or formatting split).`);
  }
});

// Write back
await zip.file("word/document.xml", xmlStr);
const out = await zip.generateAsync({ type: "nodebuffer" });
return {
  base64: out.toString("base64"),
  filename: "nda-redlines.docx",
  skipped
};
}

function trackedDel(text: string, author = "EdgeScraperPro") {
const date = new Date().toISOString();
const body = `<w:r><w:rPr/><w:delText xml:space="preserve">${encodeXml(text)}</w:delText></w:r>`;
return `<w:del w:author="${author}" w:date="${date}" w:id="${randId()}">${body}</w:del>`;
}
function trackedIns(text: string, author = "EdgeScraperPro") {
const date = new Date().toISOString();
const body = `<w:r><w:rPr/><w:t xml:space="preserve">${encodeXml(text)}</w:t></w:r>`;
return `<w:ins w:author="${author}" w:date="${date}" w:id="${randId()}">${body}</w:ins>`;
}
function randId(): string {
return String(Math.floor(Math.random() * 1000000) + 1);
}
function encodeXml(s: string): string {
return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function decodeXml(s: string): string {
return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}
async function safeText(zip: JSZip, path: string): Promise<string | null> {
const f = zip.file(path);
if (!f) return null;
return f.async("text");
}

/** Replace first occurrence of target (regex string) inside <w:t> text nodes by injecting raw OOXML (ins/del) */
function replaceInTextRuns(docXml: string, targetText: string, replacementWithOOXML: string): string {
const idx = docXml.indexOf(targetText);
if (idx === -1) return docXml;
const openIdx = docXml.lastIndexOf('<w:t', idx);
if (openIdx === -1) return docXml;
const start = docXml.indexOf('>', openIdx);
if (start === -1) return docXml;
const contentStart = start + 1;
const closeIdx = docXml.indexOf('</w:t>', idx);
if (closeIdx === -1) return docXml;
const beforeText = docXml.slice(contentStart, idx);
const afterText = docXml.slice(idx + targetText.length, closeIdx);
const prefix = docXml.slice(0, contentStart);
const suffix = docXml.slice(closeIdx);
const middle = `${encodeXml(beforeText)}</w:t></w:r>${replacementWithOOXML}<w:r><w:rPr><w:lang w:val="en-US"/></w:rPr><w:t xml:space="preserve">${encodeXml(afterText)}`;
return `${prefix}${middle}${suffix}`;
}

export default { parseDocxToParagraphs, exportTrackedChanges };
