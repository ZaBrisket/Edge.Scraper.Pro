import { describe, it, expect } from "vitest";
import { Document, Packer, Paragraph } from "docx";
import { buildTrackedDocx } from "../../src/nda/redline";
import JSZip from "jszip";

async function mkDocx(text: string): Promise<Buffer> {
  const doc = new Document({
    sections: [{ properties: {}, children: [new Paragraph(text)] }]
  });
  return await Packer.toBuffer(doc);
}

describe("redline export", () => {
  it("injects <w:ins>/<w:del> and enables trackRevisions", async () => {
    const original = await mkDocx("Use best efforts to deliver.");
    const out = await buildTrackedDocx(original, [
      {
        originalText: "best efforts",
        suggestedText: "commercially reasonable efforts",
        reason: "modifier"
      }
    ]);
    const zip = await JSZip.loadAsync(out);
    const docXml = await zip.file("word/document.xml")!.async("text");
    const settingsXml = await zip.file("word/settings.xml")!.async("text");
    expect(docXml).toMatch(/<w:del[^>]*>/);
    expect(docXml).toMatch(/<w:ins[^>]*>/);
    expect(settingsXml).toMatch(/trackRevisions/);
  });

  it("wraps inserted clauses in paragraphs", async () => {
    const original = await mkDocx("Agreement text.");
    const out = await buildTrackedDocx(original, [
      { originalText: "", suggestedText: "New clause", reason: "missing" }
    ]);
    const zip = await JSZip.loadAsync(out);
    const docXml = await zip.file("word/document.xml")!.async("text");
    expect(docXml).toMatch(/<w:p>\s*<w:ins[^>]*>[\s\S]*New clause/);
  });
});
