import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import sanitizeHtml from "sanitize-html";

export async function extractTextFromDocx(buf: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return hardenText(value);
}

export async function extractTextFromPdf(buf: Buffer): Promise<string> {
  const res = await pdfParse(buf);
  return hardenText(res.text || "");
}

export function extractTextFromTxt(buf: Buffer): string {
  return hardenText(buf.toString("utf8"));
}

// Normalize and sanitize text
function hardenText(t: string): string {
  const cleaned = sanitizeHtml(t, { allowedTags: [], allowedAttributes: {} });
  return cleaned.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
