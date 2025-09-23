// Negotiation memory store using Netlify Blobs (site-wide store).
// Keyed by /counterparty/{slug}/{timestamp}. Stores accepted ops per review.
//
// Docs: Netlify Blobs getStore/list/set/get. 
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  try {
    const store = getStore('nda-precedents');
    if (event.httpMethod === 'GET'){
      const counterparty = (new URL(event.rawUrl)).searchParams.get('counterparty') || '';
      if (!counterparty) return respond(400, { error:'missing counterparty' });
      const prefix = `counterparty/${slug(counterparty)}/`;
      const { blobs } = await store.list({ prefix });
      const accepted = [];
      for (const b of blobs){
        const raw = await store.get(b.key, { type:'json' });
        if (raw?.payload?.accepted) accepted.push(...raw.payload.accepted);
      }
      return respond(200, { counterparty, accepted });
    }
    if (event.httpMethod === 'POST'){
      const { counterparty, payload } = JSON.parse(event.body||'{}');
      if (!counterparty || !payload) return respond(400, { error:'missing fields' });
      const key = `counterparty/${slug(counterparty)}/${Date.now()}.json`;
      await store.set(key, JSON.stringify({ counterparty, payload }), { metadata:{ kind:'precedent' } });
      return respond(200, { ok:true, key });
    }
    return respond(405, { error:'method' });
  } catch(e){
    return respond(500, { error: e.message });
  }
};
function respond(code, obj){ return { statusCode: code, headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(obj) }; }
function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
