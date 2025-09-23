(function(){
  const els = {
    file: document.getElementById('file'),
    ocr: document.getElementById('use-ocr'),
    semantic: document.getElementById('semantic'),
    pro: document.getElementById('pro-redlines'),
    record: document.getElementById('record-precedents'),
    counterparty: document.getElementById('counterparty'),
    btnAnalyze: document.getElementById('btn-analyze'),
    btnCSV: document.getElementById('btn-export-csv'),
    btnJSON: document.getElementById('btn-export-json'),
    btnDOCX: document.getElementById('btn-export-docx'),
    original: document.getElementById('original'),
    redlines: document.getElementById('redlines'),
    resultsBody: document.querySelector('#results tbody'),
    privacy: document.getElementById('privacy-line'),
  };

  const state = {
    file: null, fileName: null, text: '', findings: [],
    rulepack: null, synonyms: null,
    profile: () => document.getElementById('mode-unilateral').checked ? 'unilateral':'mutual',
    embedWorker: null, embedReady:false, clauseVecs:null
  };

  // ---------- Loaders ----------
  async function loadRulepack(){ if(!state.rulepack){ state.rulepack = await (await fetch('/checklists/edgewater-nda.json')).json(); } return state.rulepack; }
  async function loadSynonyms(){ if(!state.synonyms){ state.synonyms = await (await fetch('/checklists/synonyms/legal_synonyms.json')).json(); } return state.synonyms; }

  // ---------- Extraction ----------
  function extOf(name){ return (name || '').split('.').pop()?.toLowerCase(); }
  async function extractText(file, useOCR=false){
    const ext = extOf(file.name);
    if (ext === 'txt') return await file.text();
    if (ext === 'docx') return await extractDocxRaw(file);
    if (ext === 'pdf')  return await extractPdfText(file, useOCR);
    throw new Error('Unsupported file type');
  }
  async function extractDocxRaw(file){
    const ab = await file.arrayBuffer();
    const { value } = await window.mammoth.extractRawText({ arrayBuffer: ab });
    return value;
  }
  async function extractPdfText(file, useOCR){
    const ab = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: ab });
    const pdf = await loadingTask.promise;
    let text = '';
    for (let p=1; p<=pdf.numPages; p++){
      const page = await pdf.getPage(p);
      if (!useOCR){
        const content = await page.getTextContent();
        text += content.items.map(i=>i.str).join(' ') + '\n';
      } else {
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const { data } = await Tesseract.recognize(canvas, 'eng');
        text += data.text + '\n';
      }
    }
    return text;
  }

  // ---------- Clause segmentation ----------
  function segmentParagraphs(text){
    return text.split(/\n{2,}|\r?\n(?=[A-Z0-9][\w\W]{0,120}?:)|\r?\n(?=\d+\.)/).map(s=>s.trim()).filter(Boolean).slice(0,1200);
  }

  // ---------- Heuristics: defined terms + asymmetry ----------
  function extractDefinedTerms(text){
    // Common drafting style: "Confidential Information" / (“Discloser”)
    const terms = new Set();
    const pat1 = /“([^”]{2,40})”/g; // smart quotes
    const pat2 = /"([^"]{2,40})"/g;
    const pat3 = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,3})\b(?=\s*\()/g;
    let m; while ((m=pat1.exec(text))) terms.add(m[1]);
    while ((m=pat2.exec(text))) terms.add(m[1]);
    while ((m=pat3.exec(text))) terms.add(m[1]);
    return [...terms].slice(0,200);
  }
  function detectAsymmetry(text){
    // naive party pickup
    const m = text.match(/between\s+(.*?)(?:,|\s)(?:.*)and\s+(.*?)(?:,|\s)/i);
    const partyA = (m?.[1]||'Party A'); const partyB=(m?.[2]||'Party B');
    const shallA = (text.match(new RegExp(`${partyA.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[\\s\\S]{0,120}?\\b(shall|must)\\b`,'gi'))||[]).length;
    const shallB = (text.match(new RegExp(`${partyB.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[\\s\\S]{0,120}?\\b(shall|must)\\b`,'gi'))||[]).length;
    const totalShall = (text.match(/\b(shall|must)\b/gi)||[]).length;
    return { partyA, partyB, shallA, shallB, totalShall };
  }

  // ---------- Rules engine (regex + synonyms) ----------
  function expandPatterns(rule, synonyms){
    const repl = (s)=>s.replace(/\{(\w+)\}/g,(_,k)=> (synonyms[k]||[]).join('|'));
    const out = JSON.parse(JSON.stringify(rule));
    ['required','forbidden','warn'].forEach(k=>{
      if(Array.isArray(out[k])) out[k] = out[k].map(p=> repl(p));
    });
    return out;
  }
  function evaluateRules(text, rulepack, profile, synonyms){
    const rules = (rulepack[profile]||[]).map(r=> expandPatterns(r, synonyms));
    const results = [];
    for (const rule of rules){
      const matches = []; let ok = true;
      for (const pat of (rule.required||[])){ const rx=new RegExp(pat,'i'); if(!rx.test(text)){ ok=false; matches.push({type:'missing',pattern:pat}); } else matches.push({type:'required',pattern:pat}); }
      for (const pat of (rule.forbidden||[])){ const rx=new RegExp(pat,'i'); if(rx.test(text)){ ok=false; matches.push({type:'forbidden',pattern:pat}); } }
      for (const pat of (rule.warn||[])){ const rx=new RegExp(pat,'i'); if(rx.test(text)) matches.push({type:'warn',pattern:pat}); }
      results.push({ id:rule.id, title:rule.title, ok, severity:rule.severity||(ok?'ok':'error'), matches, suggestion: rule.suggest||null, fallback: rule.fallback||null });
    }
    return results;
  }

  // ---------- Embeddings (web worker) ----------
  function ensureEmbedWorker(){
    if (state.embedWorker) return;
    state.embedWorker = new Worker('/nda-embed.worker.js');
    state.embedWorker.onmessage = (e)=>{ if (e.data?.type==='ready'){ state.embedReady=true; } };
  }
  function embed(texts){ 
    return new Promise((resolve,reject)=>{
      ensureEmbedWorker();
      const id = Math.random().toString(36).slice(2);
      const onmsg=(e)=>{ if(e.data?.type==='embed' && e.data.id===id){ state.embedWorker.removeEventListener('message',onmsg); resolve(e.data.vectors); } };
      state.embedWorker.addEventListener('message', onmsg);
      state.embedWorker.postMessage({type:'embed', id, texts});
    });
  }
  function cosine(a,b){ let s=0,na=0,nb=0; for (let i=0;i<a.length;i++){ s+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; } return s/(Math.sqrt(na)*Math.sqrt(nb)+1e-9); }

  async function semanticScore(text, rulepack, profile){
    const paras = segmentParagraphs(text);
    const targets = (rulepack[profile]||[]).map(r=> r.semantic || r.title);
    const [paraVecs, targetVecs] = await Promise.all([embed(paras), embed(targets)]);
    const hits = {};
    for (let t=0;t<targets.length;t++){
      let best = {score:-1, paraIndex:-1};
      for (let p=0;p<paras.length;p++){
        const score = cosine(targetVecs[t], paraVecs[p]);
        if (score>best.score) best={score, paraIndex:p};
      }
      hits[targets[t]] = {score:best.score, para: paras[best.paraIndex]||''};
    }
    return { paras, hits };
  }

  // ---------- Suggestions -> operations ----------
  function toOps(results){
    const ops = [];
    for (const r of results){
      if (!r.ok && r.suggestion?.replace){
        for (const rep of r.suggestion.replace){
          ops.push({ kind:'replace', anchor: r.suggestion.anchor || rep.find, find: rep.find, with: rep.with, reason: r.title });
        }
      }
      if (!r.ok && r.suggestion?.comment){
        ops.push({ kind:'comment', anchor: r.suggestion.anchor || r.suggestion?.replace?.[0]?.find || '', text: r.suggestion.comment, reason: r.title });
      }
    }
    return ops;
  }
  function previewRedlines(text, ops){
    let out = text;
    for (const op of ops){
      if (op.kind==='replace' && op.find && op.with){
        const rx = new RegExp(op.find, 'ig');
        out = out.replace(rx, (m)=>`<del>${m}</del> <ins>${op.with}</ins>`);
      }
    }
    return out;
  }

  // ---------- Precedents (Netlify Blobs via function) ----------
  async function getPrecedents(counterparty){
    if (!counterparty) return null;
    const res = await fetch('/.netlify/functions/precedents?counterparty=' + encodeURIComponent(counterparty));
    if (!res.ok) return null;
    return await res.json();
  }
  async function recordDecisions(counterparty, payload){
    if (!counterparty || !els.record.checked) return;
    try{
      await fetch('/.netlify/functions/precedents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ counterparty, payload }) });
    } catch {}
  }

  // ---------- UI helpers ----------
  function renderResults(findings){
    const row = (r)=>{
      const status = r.ok ? `<span class="ok">OK</span>` : (r.severity==='warn'?`<span class="warn">Warn</span>`:`<span class="err">Issue</span>`);
      const details = r.matches.map(m=> `<div class="muted">${m.type}: <span class="mono">${m.pattern}</span></div>`).join('');
      const suggestion = [
        r.suggestion?.text ? `<div class="mono">${r.suggestion.text}</div>` : '',
        r.fallback ? `<div class="muted">Fallback: ${r.fallback.join(' → ')}</div>` : ''
      ].join('');
      return `<tr><td>${r.title}</td><td>${status}</td><td>${details}</td><td>${suggestion}</td></tr>`;
    };
    els.resultsBody.innerHTML = findings.map(row).join('');
    els.btnCSV.disabled = els.btnJSON.disabled = findings.length===0;
  }
  function renderInsights(text){
    const terms = extractDefinedTerms(text);
    document.getElementById('terms').innerHTML = `<strong>Defined terms:</strong> <span class="muted">${terms.slice(0,60).join(', ')}</span>`;
    const asym = detectAsymmetry(text);
    const skew = (asym.shallA && asym.shallB) ? (Math.max(asym.shallA,asym.shallB)/Math.max(1,Math.min(asym.shallA,asym.shallB))) : 0;
    const msg = (skew>=10) ? `⚠️ High obligation asymmetry detected.` : `Approx. obligations: ${asym.shallA} vs ${asym.shallB} (“shall/must”).`;
    document.getElementById('asymmetry').innerHTML = `<strong>Obligation balance:</strong> <span class="muted">${msg}</span>`;
  }

  // ---------- Events ----------
  els.file.addEventListener('change', ()=>{ state.file = els.file.files?.[0]||null; state.fileName = state.file?.name || 'NDA.docx'; });
  els.pro.addEventListener('change', ()=>{ els.privacy.textContent = els.pro.checked ? 'Mode: Pro redlines enabled (Aspose Cloud, no storage).' : 'Mode: Local-only. Turn on Pro redlines to use Aspose Cloud.'; });

  els.btnAnalyze.addEventListener('click', async ()=>{
    if (!state.file){ alert('Select a file first.'); return; }
    els.btnAnalyze.disabled = true;
    try{
      const useOCR = els.ocr.checked;
      const [rules, syns] = await Promise.all([loadRulepack(), loadSynonyms()]);
      const text = await extractText(state.file, useOCR);
      state.text = text;
      els.original.textContent = text.slice(0, 30000);

      // Baseline (regex+synonyms)
      let findings = evaluateRules(text, rules, state.profile(), syns);

      // Semantic pass (optional): raise/warn matches with low regex coverage
      if (els.semantic.checked){
        ensureEmbedWorker();
        const { hits } = await semanticScore(text, rules, state.profile());
        // augment findings with semantic confidence
        findings = findings.map(f=>{
          const h = hits[f.semantic||f.title];
          if (h && h.score) (f.semanticScore = +h.score.toFixed(3), f.semanticPara = h.para);
          return f;
        });
      }

      state.findings = findings;
      renderResults(findings);
      renderInsights(text);

      // Build ops & preview
      const ops = toOps(findings);
      els.redlines.innerHTML = previewRedlines(text, ops).slice(0, 30000);
      els.btnDOCX.disabled = !(els.pro.checked && ops.length>0);

      // Precedents fetch + annotate (non-blocking)
      const cp = (els.counterparty.value||'').trim();
      if (cp){
        const prec = await getPrecedents(cp);
        if (prec?.accepted?.length){
          // simple hinting: if we see previously accepted replacements for rule ids, show as muted note
          // (future: auto-apply on toggle)
          console.log('Precedents for', cp, prec);
        }
      }
    } catch(e){ console.error(e); alert('Analysis failed: '+e.message); }
    finally{ els.btnAnalyze.disabled=false; }
  });

  function download(name, blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
  els.btnCSV.addEventListener('click', ()=>{
    const rows=[['Rule','Status','Severity','Details','Suggestion','SemanticScore']];
    state.findings.forEach(f=>{
      const det=f.matches.map(m=>`${m.type}:${m.pattern}`).join('; ');
      rows.push([f.title, f.ok?'OK':'Issue', f.severity||'', det, f.suggestion?.text||'', String(f.semanticScore||'')]);
    });
    const csv=rows.map(r=>r.map(x=>`"${(x||'').replaceAll('"','""')}"`).join(',')).join('\n');
    download('nda_checklist.csv', new Blob([csv],{type:'text/csv'}));
  });
  els.btnJSON.addEventListener('click', ()=>{
    download('nda_checklist.json', new Blob([JSON.stringify(state.findings,null,2)], {type:'application/json'}));
  });
  els.btnDOCX.addEventListener('click', async ()=>{
    try{
      const ops = toOps(state.findings);
      if (!ops.length){ alert('No redlines suggested.'); return; }
      const buf = await state.file.arrayBuffer();
      const payload = {
        fileName: state.fileName,
        documentBase64: btoa(String.fromCharCode(...new Uint8Array(buf))),
        operations: ops,
        author: 'EdgeScraperPro NDA Bot'
      };
      const res = await fetch('/.netlify/functions/nda-redline-ast', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      download(state.fileName.replace(/\.(pdf|docx|txt)$/i,'') + '.redlines.docx', blob);
      if (els.record.checked){
        await recordDecisions((els.counterparty.value||'').trim(), { accepted: ops, timestamp: Date.now(), profile: state.profile() });
      }
    }catch(e){ alert('Export failed: '+e.message); }
  });
})();
