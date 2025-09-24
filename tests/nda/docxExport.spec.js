const JSZip = require('jszip');
const { exportTrackedChanges } = require('../../netlify/functions/_lib/docx-export-shim');

function minimalDocxXml(text) {
return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:body>
   <w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>
 </w:body>
</w:document>`;
}
function escapeXml(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

async function buildDocx(text) {
const zip = new JSZip();
zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`);
zip.folder('word').file('document.xml', minimalDocxXml(text));
zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
const buf = await zip.generateAsync({ type: 'nodebuffer' });
return buf.toString('base64');
}

test("export inserts w:ins/w:del around changed text", async () => {
const original = "The term shall be thirty (30) months.";
const base64 = await buildDocx(original);
const edits = [{
  proposal: { target: "thirty (30) months", replacement: "24 months", operation: "replace" }
}];
const res = await exportTrackedChanges({ base64, edits, author: "EdgeScraperPro" });
const outZip = await JSZip.loadAsync(Buffer.from(res.base64, 'base64'));
const xml = await outZip.file('word/document.xml').async('text');
expect(xml).toMatch(/<w:del /);
expect(xml).toMatch(/<w:ins /);
expect(xml).toMatch(/24 months/);
});
