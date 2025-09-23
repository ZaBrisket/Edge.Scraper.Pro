// Structure-aware redlines using Aspose.Words Cloud SDK.
// - Finds anchors with SearchOnline (regex) to get node paths
// - Replaces content using Range Replace between precise nodes
// - Maintains lists/numbering by working at paragraph scope
// - Adds review comments with InsertCommentOnline
//
// Env: ASPOSE_CLIENT_ID, ASPOSE_CLIENT_SECRET
// Sources for APIs: Range replace, Search, Paragraph/List APIs, InsertCommentOnline.
// (See PR body for links.)

const aspose = require('asposewordscloud');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const { documentBase64, fileName='NDA.docx', operations=[], author='EdgeScraperPro NDA Bot' } = JSON.parse(event.body||'{}');
    if (!documentBase64 || !operations?.length) return { statusCode: 400, body: 'Missing document or operations' };

    const cfg = new aspose.Configuration(process.env.ASPOSE_CLIENT_ID, process.env.ASPOSE_CLIENT_SECRET);
    const api = new aspose.WordsApi(cfg);
    let current = Buffer.from(documentBase64, 'base64');

    // Helper: search for an anchor regex and return node paths of matches
    async function searchAnchors(docBuf, pattern){
      const req = new aspose.SearchOnlineRequest({ document: docBuf, pattern });
      const res = await api.searchOnline(req); // returns JSON + doc streams
      const json = JSON.parse(res.model.body); // SearchResponse
      const items = json?.SearchResults?.ResultsList || json?.SearchResults?.Items || [];
      // Normalize to array of {Node, Text}
      return items.map(x => ({ nodePath: x.Node?.NodePath || x.NodePath || x.NodeId || '', text: x.Text || '' }));
    }

    // Helper: replace a range (entire paragraph or run) with tracked revision text
    async function replaceRangeByParagraph(docBuf, startNodePath, replacement, revisionAuthor){
      // Use end selector ":end" to capture entire paragraph content.
      const startIdentifier = encodeURIComponent(startNodePath);
      const endIdentifier = encodeURIComponent(startNodePath + ':end');
      const url = `/words/online/post/range/${startIdentifier}/${endIdentifier}`;

      const form = new aspose.internal.MultiPartFormData();
      form.addFile('document', docBuf, fileName);
      form.addJson('rangeText', { Text: replacement, TextType: 'Text' });

      const resp = await api.invokeApiToStream('PUT', url, form.getHeaders(), form.getFormData(), { revisionAuthor, revisionDateTime: new Date().toISOString(), destFileName: fileName });
      return mergeOnlineResponse(resp);
    }

    // Helper: add a comment (attach to first paragraph by default, but we attempt to anchor via node)
    async function insertComment(docBuf, nodePath, text){
      const comment = new aspose.CommentInsert();
      comment.text = text;
      comment.author = author;
      comment.initial = 'ES';
      // RangeStart/End left undefined: API will anchor at selection start of doc; for precise anchors, additional position resolution can be added later.
      const req = new aspose.InsertCommentOnlineRequest({ document: docBuf, comment, revisionAuthor: author, revisionDateTime: new Date().toISOString(), destFileName: fileName });
      const out = await api.insertCommentOnline(req);
      return mergeOnlineResponse(out);
    }

    // Helper: merge Aspose Online responses -> Buffer
    function mergeOnlineResponse(resp){
      const iter = resp.document?.values?.() || resp.values?.();
      const first = iter && iter.next && iter.next().value;
      if (!first) return Buffer.from([]);
      return toBuffer(first);
    }
    function toBuffer(v){
      return new Promise((resolve,reject)=>{
        if (!v) return resolve(Buffer.alloc(0));
        if (Buffer.isBuffer(v)) return resolve(v);
        if (typeof v.pipe==='function'){ const chunks=[]; v.on('data',c=>chunks.push(Buffer.from(c))); v.on('end',()=>resolve(Buffer.concat(chunks))); v.on('error',reject); return; }
        if (typeof v.arrayBuffer==='function'){ v.arrayBuffer().then(ab=>resolve(Buffer.from(ab))).catch(reject); return; }
        resolve(Buffer.from(String(v)));
      });
    }

    // Process operations:
    for (const op of operations){
      if (op.kind === 'replace' && op.find && op.with){
        const anchors = await searchAnchors(current, op.anchor || op.find);
        // Replace each anchor paragraph content with tracked revision text.
        for (const a of anchors.slice(0, 10)){ // safety cap
          // Operate at paragraph level to preserve numbering/formatting
          const paraPath = a.nodePath?.split('/runs/')[0] || a.nodePath?.split('/recentChanges/')[0] || a.nodePath;
          current = await replaceRangeByParagraph(current, paraPath, op.with, author);
        }
      }
    }

    // Add comments last (one per op)
    for (const op of operations){
      if (op.kind === 'comment' && op.text){
        const anchors = await searchAnchors(current, op.anchor || '.');
        const nodePath = anchors[0]?.nodePath || 'sections/0/paragraphs/0';
        current = await insertComment(current, nodePath, `${op.reason ? op.reason+': ' : ''}${op.text}`);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      body: current.toString('base64'),
      isBase64Encoded: true
    };
  } catch(e){
    return { statusCode: 500, body: `nda-redline-ast error: ${e.message}` };
  }
};
