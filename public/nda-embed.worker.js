// Web Worker for local embeddings (Transformers.js with Xenova/all-MiniLM-L6-v2)
// CDN UMD build attaches a global `transformers` object. Ref docs: CDN usage & pipelines. 
// (Runs fully in-browser; no server) — Sources: transformers.js docs & Xenova model card.

let extractor = null;
let ready = false;

async function ensure(){
  if (ready) return;
  importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
  const { pipeline } = self.transformers;
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2'); // mean-pooled embeddings
  ready = true;
  postMessage({ type:'ready' });
}
onmessage = async (e)=>{
  const { type, texts, id } = e.data||{};
  await ensure();
  if (type==='embed'){
    const out = await extractor(texts, { pooling:'mean', normalize:true });
    const arr = out.tolist ? out.tolist() : out; // ensure plain arrays
    postMessage({ type:'embed', id, vectors: arr });
  }
};
