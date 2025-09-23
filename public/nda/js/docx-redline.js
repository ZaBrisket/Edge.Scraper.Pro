// Build a .docx containing original text with comment-anchored redlines near sentence evidence.
import {
  Document, Packer, Paragraph, TextRun,
  CommentRangeStart, CommentRangeEnd, CommentReference, Comment,
  HeadingLevel
} from "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.mjs";

/**
 * @param {{ fullText:string, results:Array, meta:object }} params
 * @returns {Promise<Blob>}
 */
export async function buildRedlinesDoc({ fullText, results, meta }) {
  if (!Document || !Packer) {
    throw new Error("DOCX export unavailable: required libraries did not load.");
  }
  const doc = new Document({
    creator: "EdgeScraperPro NDA Reviewer",
    title: "NDA Redlines"
  });

  const children = [];
  // Cover with metadata
  children.push(new Paragraph({ text: "NDA Review — Redlines", heading: HeadingLevel.TITLE }));
  const metaLines = [
    `File: ${meta?.filename || "—"}`,
    `Size: ${meta?.filesize || "—"}`,
    `Processed: ${meta?.processedAt || "—"}`,
    `Duration: ${typeof meta?.processingMs === "number" ? meta.processingMs + " ms" : "—"}`
  ];
  for (const line of metaLines) children.push(new Paragraph(line));
  children.push(new Paragraph("Generated locally by EdgeScraperPro. Not legal advice."));
  children.push(new Paragraph(" "));

  // Body: paragraph-per-line to aid anchoring
  const lines = (fullText || "").split(/\n+/);
  const paras = lines.map(line => new Paragraph({ children: [new TextRun(line || " ")] }));

  let cid = 1;
  for (const r of results.filter(r => r.status !== "pass")) {
    const ev = r.evidence;
    if (!ev?.text) continue;
    // Locate a paragraph containing the first portion of the evidence (case-insensitive)
    const snippet = ev.text.slice(0, Math.min(50, ev.text.length)).toLowerCase();
    let targetIdx = lines.findIndex(l => l.toLowerCase().includes(snippet));
    if (targetIdx < 0) targetIdx = 0;
    const target = paras[targetIdx];

    const start = new CommentRangeStart(cid);
    const end = new CommentRangeEnd(cid);
    target.children.unshift(start);
    target.children.push(end);
    target.children.push(new CommentReference(cid));

    const comment = new Comment({
      id: cid,
      author: "EdgeScraperPro",
      date: new Date(),
      children: [
        new Paragraph({ children: [ new TextRun({ text: `[${r.category}] ${r.title}`, bold: true }) ]}),
        ...(ev?.text ? [ new Paragraph({ children: [ new TextRun({ text: `Evidence: ${ev.text}` }) ]}) ] : []),
        ...(r.recommendation ? [ new Paragraph({ children: [ new TextRun({ text: `Recommendation: ${r.recommendation}` }) ]}) ] : [])
      ]
    });
    doc.addComment(comment);
    cid++;
  }

  children.push(...paras);
  children.push(new Paragraph(" "));
  children.push(new Paragraph({ text: "Checklist Summary", heading: HeadingLevel.HEADING_1 }));
  for (const r of results) {
    children.push(new Paragraph(`[${r.status.toUpperCase()}] [${r.level}] (sev ${r.severity}) [${r.category}] ${r.title}`));
    if (r.evidence?.text) children.push(new Paragraph(`  Evidence: ${r.evidence.text}`));
    if (r.recommendation) children.push(new Paragraph(`  Recommendation: ${r.recommendation}`));
  }

  doc.addSection({ children });
  return await Packer.toBlob(doc);
}
