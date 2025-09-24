import JSZip from "jszip";
import { XMLBuilder, XMLParser } from "fast-xml-parser";

type Redline = {
  originalText: string;
  suggestedText: string;
  reason: string;
  author?: string;
  dateISO?: string;
};

// Minimal XML helpers
const XML_OPTS = {
  ignoreAttributes: false,
  preserveOrder: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true // we will re-add namespaces at root
};

export async function buildTrackedDocx(
  originalDocx: Buffer,
  edits: Redline[],
  author = "Edgewater NDA Reviewer"
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originalDocx);
  const docXmlPath = "word/document.xml";
  const settingsPath = "word/settings.xml";

  // Ensure track revisions setting
  const settingsXml = await readFileText(zip, settingsPath);
  const settingsPatched = ensureTrackRevisions(settingsXml);
  await zip.file(settingsPath, settingsPatched);

  // Patch document.xml
  const docXml = await readFileText(zip, docXmlPath);
  const patched = applyTrackedChanges(docXml, edits, author);
  await zip.file(docXmlPath, patched);

  return zip.generateAsync({ type: "nodebuffer" });
}

function ensureTrackRevisions(xml: string): string {
  const parser = new XMLParser(XML_OPTS);
  const builder = new XMLBuilder(XML_OPTS);
  const obj = parser.parse(xml);
  if (!obj?.settings) return xml;
  const settings = obj.settings;
  if (!settings["trackRevisions"]) settings["trackRevisions"] = "";
  const rebuilt = builder.build({ settings });
  return addWordNs(rebuilt, "w:settings");
}

function applyTrackedChanges(xml: string, edits: Redline[], author: string): string {
  let out = xml;
  for (const [i, e] of edits.entries()) {
    if (!e.originalText || e.originalText.trim().length === 0) {
      const insXml = insRunXml(e.suggestedText, author, e.dateISO, i + 1);
      const insParagraph = `<w:p>${insXml}</w:p>`;
      if (/<\/w:body>/i.test(out)) {
        out = out.replace(/<\/w:body>/i, `${insParagraph}</w:body>`);
      } else {
        out = out.replace(/(<w:body[^>]*>)/i, `$1${insParagraph}`);
      }
      continue;
    }
    const escapedOriginal = escapeForRegExp(e.originalText);
    const delXml = delRunXml(e.originalText, author, e.dateISO, i + 1);
    const insXml = insRunXml(e.suggestedText, author, e.dateISO, i + 1);
    const pattern = new RegExp(`(<w:t[^>]*>)(${escapedOriginal})(</w:t>)`, "i");
    if (pattern.test(out)) {
      out = out.replace(pattern, `${delXml}${insXml}`);
    } else {
      out = out.replace(
        e.originalText,
        `${unwrapTextRuns(delXml)}${unwrapTextRuns(insXml)}`
      );
    }
  }
  return out;
}

function delRunXml(
  text: string,
  author: string,
  dateISO = new Date().toISOString(),
  id = 1
): string {
  const t = xmlSafe(text);
  return `<w:del w:author="${xmlSafe(author)}" w:date="${dateISO}" w:id="${id}"><w:r><w:delText xml:space="preserve">${t}</w:delText></w:r></w:del>`;
}
function insRunXml(
  text: string,
  author: string,
  dateISO = new Date().toISOString(),
  id = 1
): string {
  const runs = text
    .split(/\n/)
    .map(
      (line) =>
        `<w:r><w:t xml:space="preserve">${xmlSafe(line)}</w:t></w:r>`
    )
    .join(`<w:r><w:br/></w:r>`);
  return `<w:ins w:author="${xmlSafe(author)}" w:date="${dateISO}" w:id="${id}">${runs}</w:ins>`;
}

function addWordNs(xmlFragment: string, rootTag: string): string {
  if (xmlFragment.includes("xmlns:w=")) return xmlFragment;
  return xmlFragment.replace(
    new RegExp(`<${rootTag}`),
    `<${rootTag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`
  );
}

async function readFileText(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) throw new Error(`Missing ${path}`);
  return entry.async("text");
}

function xmlSafe(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;"
    }[c] as string)
  );
}

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unwrapTextRuns(xml: string): string {
  return xml.replace(/<\/?w:t[^>]*>/g, "");
}
