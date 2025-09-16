/* Company Description Standardization Engine (CDSE) — production build
 * Goals:
 *  - One sentence, ≤30 words, third-person present
 *  - Priority: Description → Specialties → Products & Services
 *  - Add brief context from End Markets / Industries (≤2 items)
 *  - Remove fluff, revenue, partner/investor/HQ brag, founding/employee brag
 *  - Preserve acronyms; deterministic verb selection
 *  - Exposes: prepare(records), summarize(prepared, overrides), makeSummary(row, cols)
 */

(function () {
  const FLUFF = new RegExp(
    "\\b(leading|innovative|world[- ]?class|premier|top[- ]?tier|cutting[- ]?edge|award[- ]?winning|best[- ]in[- ]class|state[- ]of[- ]the[- ]art|trusted|global|next[- ]?gen|revolutionary|transformative|game[- ]?changing|unique|unparalleled|unrivaled|industry[- ]?leading|mission[- ]?critical)\\b",
    "i"
  );
  const REVENUE = /(\$[\d,.]+|\b\d+(\.\d+)?\s*(million|billion|m|bn)\b|\brevenue\b)/i;
  const PARTNER = /\b(partner(ship|s|ed|ing)?|alliance|reseller|channel\s+partner|collaborat(e|ion|ive|ing|ed))\b/i;
  const GEO_BRAG = /\b(headquartered|based in|global presence|worldwide|nationwide)\b/i;
  const FOUNDING_EMP = /\b(founded in \d{4}|established in \d{4}|over \d+\+?\s+employees|\d+\+?\s+employees)\b/i;

  const TWO_PART_TLDS = new Set([
    "co.uk","ac.uk","gov.uk","org.uk","com.au","com.br","com.mx",
    "co.jp","co.in","com.cn","co.za","com.sg","com.hk","com.tr"
  ]);

  const SYNONYMS = {
    companyName: [
      "Company Name","Company","Name","Organization","Org Name","Legal Name",
      "Account Name","Firm","Business Name","Entity","DBA","Informal Name"
    ],
    website: [
      "Website","Company Website","Domain","Company Domain","URL","Homepage",
      "Web Site","Company URL","ProfileUrl","LinkedIn Website"
    ],
    description: [
      "Description","About","Company Description","Business Description","Profile",
      "Long Description","Short Description","Overview","About Us","Who We Are"
    ],
    specialties: [
      "Specialties","Specialty","Capabilities","Services","Service Lines","Competencies",
      "Focus Areas","Expertise","Practice Areas","Solutions"
    ],
    products: [
      "Products and Services","Products & Services","Products/Services","Offerings",
      "Solutions","Product Lines","Service Offerings"
    ],
    endMarkets: [
      "End Markets","Markets","Customer Segments","Target Markets","Customers",
      "Client Types","Client Segments","Verticals Served"
    ],
    industries: [
      "Industry","Industries","Primary Industry","Sector","Sectors","Verticals",
      "NAICS","SIC","NAICS Description","SIC Description"
    ]
  };

  function norm(s){ return String(s||"").trim().toLowerCase().replace(/[^a-z0-9]+/g," "); }

  function pickCol(headerList, candidates){
    const want = candidates.map(norm);
    for (const h of headerList) if (want.includes(norm(h))) return h;      // exact
    for (const h of headerList) for (const w of want) if (w && norm(h).includes(w)) return h; // partial
    return null;
  }

  function stripLegalSuffix(name){
    return String(name||"").replace(/\b(inc|inc\.|llc|ltd|ltd\.|corp|corp\.|co|co\.)\b/gi,"").replace(/\s{2,}/g," ").trim();
  }

  function deriveNameFromDomain(urlOrDomain){
    if (!urlOrDomain) return null;
    let raw = String(urlOrDomain).trim();
    try { if (!/^https?:\/\//i.test(raw)) raw = "http://" + raw; } catch {}
    try {
      const u = new URL(raw);
      let host = (u.hostname || u.host || "").toLowerCase().replace(/^www\./,"");
      const parts = host.split(".");
      let core = parts.length >= 2 ? parts[parts.length-2] : parts[0];
      const lastTwo = parts.slice(-2).join(".");
      if (TWO_PART_TLDS.has(lastTwo) && parts.length >= 3) core = parts[parts.length-3];
      const name = core.replace(/[-_]+/g," ").split(" ").map(w=>{
        if (/^[A-Z0-9]{2,5}$/.test(w)) return w; // keep ALLCAPS short acronyms
        return w.charAt(0).toUpperCase()+w.slice(1);
      }).join(" ");
      return name || null;
    } catch { return null; }
  }

  function splitSentences(t){ return String(t||"").split(/(?<=[.!?])\s+/); }

  function stripByPatterns(text){
    if (!text) return "";
    const kept = [];
    for (const s of splitSentences(text)) {
      if (!s.trim()) continue;
      if (REVENUE.test(s) || PARTNER.test(s) || GEO_BRAG.test(s) || FOUNDING_EMP.test(s)) continue;
      kept.push(s);
    }
    const x = kept.join(" ").replace(FLUFF,"").replace(/\s+/g," ").trim();
    return x.replace(/^[;,- ]+|[;,- ]+$/g,"");
  }

  function chooseVerb(text, source){
    const t = String(text||"").toLowerCase();
    if (t.includes("manufactur")) return "manufactures";
    if (/(distribut|wholesale|resell)/.test(t)) return "distributes";
    if (/(install|deployment|commission)/.test(t)) return "installs";
    if (/(develop|platform|software|solution)/.test(t)) return "develops";
    if (/(repair|maintenance|maintain|service)/.test(t)) {
      if (/repair/.test(t)) return "repairs";
      if (/maintain/.test(t)) return "maintains";
      return "services";
    }
    if (/(test|tab|balanc|calibrat|certif)/.test(t)) return t.includes("certif") ? "certifies" : "tests";
    if (/(manage|management|outsourc)/.test(t)) return "manages";
    if (/(sell|retail)/.test(t)) return "sells";
    if (/(integrat|system integrator)/.test(t)) return "integrates";
    if (source === "specialties" || source === "products") return "specializes in";
    return "provides";
  }

  function parseListlike(v){
    if (!v) return [];
    let parts = String(v).split(/[;,•|/]+|\s{2,}/);
    if (parts.length===1) parts = String(v).split(",");
    const out=[], seen=new Set();
    for (let p of parts){
      const s = p.trim().replace(/^[\-\s•;:,/]+|[\-\s•;:,/]+$/g,"");
      if (!s) continue;
      const key = s.toLowerCase();
      if (!seen.has(key)){ seen.add(key); out.push(s); }
    }
    return out;
  }

  function joinNatural(items, n=3){
    const arr = items.slice(0,n);
    if (!arr.length) return "";
    if (arr.length===1) return arr[0];
    if (arr.length===2) return `${arr[0]} and ${arr[1]}`;
    return `${arr.slice(0,-1).join(", ")}, and ${arr[arr.length-1]}`;
  }

  function makeSummary(row, cols){
    const companyRaw = (cols.companyName && row[cols.companyName]) || "";
    const website    = (cols.website && row[cols.website]) || "";
    const desc       = (cols.description && row[cols.description]) || "";
    const specs      = (cols.specialties && row[cols.specialties]) || "";
    const products   = (cols.products && row[cols.products]) || "";
    const endMkts    = (cols.endMarkets && row[cols.endMarkets]) || "";
    const industries = (cols.industries && row[cols.industries]) || "";

    const name = stripLegalSuffix(companyRaw) || deriveNameFromDomain(website) || "Company";

    let source="none", primary="";
    if (desc){ source="description"; primary=stripByPatterns(desc); }
    else if (specs){ source="specialties"; primary=stripByPatterns(specs); }
    else if (products){ source="products"; primary=stripByPatterns(products); }

    if (!primary){
      const ind = industries || endMkts || "industry";
      let s = `${name} provides ${String(ind).split(/[;,]/)[0].trim().toLowerCase()}-related services (details not specified).`;
      const words = s.trim().split(/\s+/);
      if (words.length>30) s = words.slice(0,30).join(" ") + ".";
      return s;
    }

    let phrase = "";
    if (source==="specialties" || source==="products"){
      const items = parseListlike(primary);
      phrase = items.length ? joinNatural(items,3) : primary;
    } else {
      let t = primary
        .replace(/^(we|our|the company)\s+/i,"")
        .replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\$&")}\\s+(is|provides|offers|specializes in)\\s+`,"i"),"");
      phrase = t;
    }

    const verb = chooseVerb(primary, source);

    let context = "";
    const ctx = String((endMkts || industries) || "").trim();
    if (ctx){
      let items = parseListlike(ctx);
      if (!items.length) items = [ctx];
      items = items.filter(Boolean).map(s=>s.replace(/\s+/g," ").trim());
      if (items.length) context = ` for ${joinNatural(items,2)}`;
    }

    let sentence = `${name} ${verb} ${phrase}${context}.`
      .replace(/\s+/g," ")
      .replace(/\s+([,.;:])/g,"$1")
      .replace(/\s*[.]+$/,".")
      .trim();

    sentence = splitSentences(sentence)[0] || sentence;
    const words = sentence.split(/\s+/);
    if (words.length>30){
      const alt = `${name} ${verb} ${phrase}.`;
      if (alt.split(/\s+/).length<=30) sentence = alt;
      else sentence = words.slice(0,30).join(" ") + ".";
    }
    return sentence;
  }

  function guessEmbeddedHeader(rows){
    const keys = new Set(
      ["Company Name","Website","Description","Specialties","Products and Services","Industries","End Markets"]
        .map(s=>norm(s))
    );
    for (let i=0;i<Math.min(rows.length,25);i++){
      const vals = Object.values(rows[i]||{}).map(v=>String(v||"").trim());
      const hits = vals.reduce((acc,v)=>acc+(keys.has(norm(v))?1:0),0);
      if (hits>=3) return i;
    }
    return -1;
  }

  function buildColMap(headers){
    return {
      companyName: pickCol(headers,SYNONYMS.companyName),
      website:     pickCol(headers,SYNONYMS.website),
      description: pickCol(headers,SYNONYMS.description),
      specialties: pickCol(headers,SYNONYMS.specialties),
      products:    pickCol(headers,SYNONYMS.products),
      endMarkets:  pickCol(headers,SYNONYMS.endMarkets),
      industries:  pickCol(headers,SYNONYMS.industries)
    };
  }

  function prepare(records){
    if (!Array.isArray(records) || !records.length) {
      return { headers:[], rows:[], cols:null, messages:["No rows found"] };
    }

    const headerRowIdx = guessEmbeddedHeader(records);
    let rows = records, headers = Object.keys(records[0]||{});
    if (headerRowIdx >= 0){
      const promoted = Object.values(records[headerRowIdx]||{}).map(v=>String(v||"").trim());
      headers = promoted;
      rows = records.slice(headerRowIdx+1).map(r=>{
        const obj = {};
        const keys = Object.keys(r);
        for (let i=0;i<promoted.length;i++){
          obj[promoted[i]] = r[keys[i]] ?? "";
        }
        return obj;
      });
    }

    const cols = buildColMap(headers);
    const messages = [];

    if (!cols.companyName && !cols.website){
      messages.push("Missing both Company Name and Website columns.");
    }
    if (!cols.description && !cols.specialties && !cols.products){
      messages.push("Missing all primary content columns (Description/Specialties/Products and Services).");
    }
    return { headers, rows, cols, messages };
  }

  function summarize(prepared, overrides){
    const rows = prepared.rows || [];
    const cols = Object.assign({}, prepared.cols || {}, overrides || {});
    const out = rows.map((row)=>({
      "Company Name": (cols.companyName && row[cols.companyName]) || deriveNameFromDomain(cols.website ? row[cols.website] : "") || "",
      "Website": cols.website ? (row[cols.website]||"") : "",
      "Summary": makeSummary(row, cols)
    }));
    return out;
  }

  window.CDSEngine = { prepare, summarize, makeSummary, buildColMap };
})();
