window.EdgeScraper = {
  async scrapeOne(u, { raw = 0, parse = 'article' } = {}) {
    const qs = new URLSearchParams({ url: u, raw: String(raw), parse });
    const base = window.location.hostname === 'localhost'
      ? 'http://localhost:8888'
      : '';
    const r = await fetch(`${base}/.netlify/functions/fetch-url?${qs.toString()}`, {
      method: 'GET',
      headers: { 'X-API-Key': 'public-2024' }
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} ${t}`);
    }
    return r.json();
  }
};

