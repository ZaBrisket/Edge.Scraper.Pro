function encodeXml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;"); }
function trackedDel(text, author = "EdgeScraperPro") {
const date = new Date().toISOString();
const body = `<w:r><w:rPr/><w:delText xml:space="preserve">${encodeXml(text)}</w:delText></w:r>`;
return `<w:del w:author="${author}" w:date="${date}" w:id="${String(Math.floor(Math.random()*1000000)+1)}">${body}</w:del>`;
}
function trackedIns(text, author = "EdgeScraperPro") {
const date = new Date().toISOString();
const body = `<w:r><w:rPr/><w:t xml:space="preserve">${encodeXml(text)}</w:t></w:r>`;
return `<w:ins w:author="${author}" w:date="${date}" w:id="${String(Math.floor(Math.random()*1000000)+1)}">${body}</w:ins>`;
}
function replaceInTextRuns(docXml, targetText, replacementOOXML) {
const idx = docXml.indexOf(targetText);
if (idx === -1) {
  return docXml;
}
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
const middle = `${encodeXml(beforeText)}</w:t></w:r>${replacementOOXML}<w:r><w:rPr><w:lang w:val="en-US"/></w:rPr><w:t xml:space="preserve">${encodeXml(afterText)}`;
return `${prefix}${middle}${suffix}`;
}

async function exportTrackedChanges({ base64, edits, author }) {
const JSZip = require('jszip');
const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
const docXmlFile = zip.file('word/document.xml');
if (!docXmlFile) throw new Error('word/document.xml missing');
let xmlStr = await docXmlFile.async('text');

const skipped = [];
edits.forEach((s, i) => {
  const targetText = (s.proposal && s.proposal.target || '').trim();
  if (!targetText) return;
  const delTag = trackedDel(s.proposal.target, author);
  const insTag = s.proposal.replacement ? trackedIns(s.proposal.replacement, author) : "";
  const repl = insTag ? `${delTag}${insTag}` : delTag;
  const before = xmlStr;
  const afterReplace = replaceInTextRuns(xmlStr, targetText, repl);
  xmlStr = afterReplace;
  if (xmlStr === before) skipped.push(`Edit ${i+1}: could not map text within runs.`);
});

await zip.file('word/document.xml', xmlStr);
const out = await zip.generateAsync({ type: 'nodebuffer' });
return { base64: out.toString('base64'), filename: 'nda-redlines.docx', skipped };
}

module.exports = { exportTrackedChanges };
