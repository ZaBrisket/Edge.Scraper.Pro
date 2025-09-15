const fetch = global.fetch;

const BASE = process.env.SCRAPER_BASE || '';
const urls = [
  "https://www.insurancejournal.com/news/national/2025/01/27/809603.htm",
  "https://www.insurancejournal.com/magazines/mag-features/2025/01/27/809390.htm",
  "https://www.insurancejournal.com/news/international/2025/01/24/809519.htm",
  "https://www.insurancejournal.com/news/national/2025/01/23/809288.htm",
  "https://www.insurancejournal.com/news/southeast/2025/01/23/809296.htm",
  "https://www.insurancejournal.com/news/international/2025/01/23/809282.htm",
  "https://www.insurancejournal.com/news/midwest/2025/01/22/809181.htm",
  "https://www.insurancejournal.com/news/midwest/2025/01/21/808989.htm",
  "https://www.insurancejournal.com/news/southeast/2025/01/21/808961.htm",
  "https://www.insurancejournal.com/news/east/2025/01/21/808901.htm",
  "https://www.insurancejournal.com/news/west/2025/01/21/808401.htm",
  "https://www.insurancejournal.com/news/west/2025/01/21/808393.htm",
  "https://www.insurancejournal.com/news/southcentral/2025/01/17/808773.htm",
  "https://www.insurancejournal.com/news/west/2025/01/16/808175.htm",
  "https://www.insurancejournal.com/news/midwest/2025/01/15/808344.htm",
  "https://www.insurancejournal.com/news/west/2025/01/15/808018.htm",
  "https://www.insurancejournal.com/news/international/2025/01/14/808223.htm",
  "https://www.insurancejournal.com/news/west/2025/01/14/807840.htm",
  "https://www.insurancejournal.com/news/west/2025/01/13/808015.htm",
  "https://www.insurancejournal.com/news/international/2025/01/13/807992.htm",
  "https://www.insurancejournal.com/news/national/2025/01/13/807956.htm",
  "https://www.insurancejournal.com/news/west/2025/01/13/807798.htm",
  "https://www.insurancejournal.com/news/national/2025/01/10/807644.htm",
  "https://www.insurancejournal.com/news/east/2025/01/09/807630.htm",
  "https://www.insurancejournal.com/news/southeast/2025/01/09/807426.htm"
];

async function runOne(url) {
  const qs = new URLSearchParams({ url, parse: 'article' }).toString();
  const prefix = BASE || '';
  const r = await fetch(`${prefix}/.netlify/functions/fetch-url?${qs}`, {
    headers: { 'X-API-Key': 'public-2024' }
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${url} -> ${j.error}`);
  if (!j.article || !j.article.content) throw new Error(`${url} -> no article content`);
  return { url, strategy: j.strategy, ms: j.ms, title: j.article.title };
}

(async () => {
  const results = [];
  let failed = 0;
  for (const u of urls) {
    try {
      const out = await runOne(u);
      results.push(out);
      console.log('OK', String(out.strategy).padEnd(20), String(out.ms).padStart(5)+'ms', '::', out.title);
    } catch (e) {
      failed++;
      console.error('FAIL', u, e.message);
    }
  }
  console.log(`\nDone. ${results.length} succeeded, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})();

