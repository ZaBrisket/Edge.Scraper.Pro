(function (global) {
  // --- Intelligent column detection -------------------------------------------------
  const FIELD_SYNONYMS = {
    companyName: [/^(company|legal)\s*name$/i, /^name$/i, /^firm$/i, /^organization$/i, /^org$/i, /^account\s*name$/i],
    website: [/^web\s*site$/i, /^website$/i, /^url$/i, /homepage/i, /domain/i, /company\s*site/i, /\bsite\b/i],
    description: [/^description$/i, /profile|overview|about|summary/i],
    specialties: [/specialt(y|ies)/i, /capabilit/i, /competenc/i, /expertise/i, /service\s*lines?/i, /focus\s*areas?/i],
    products: [/^products?$/i, /solutions?|offerings?|equipment|sku/i],
    endMarkets: [/end\s*markets?/i, /markets?\s*served/i, /verticals|segments/i],
    industries: [/^industry$/i, /industries$/i, /sector/i, /naics|sic|category|categories/i],
  };

  const AGGREGATOR_HOSTS = new Set([
    'app.sourcescrub.com',
    'sourcescrub.com',
    'google.com',
    'bing.com',
    'linkedin.com',
    'www.linkedin.com',
    'dnb.com',
    'zoominfo.com',
    'crunchbase.com',
  ]);

  const URL_RE = /^(https?:\/\/)?([A-Za-z0-9-]+\.)+[A-Za-z]{2,}(\/.*)?$/i;

  function headerScore(field, header) {
    const h = String(header || '').trim();
    const pats = FIELD_SYNONYMS[field] || [];
    let s = 0;
    for (const re of pats) {
      if (re.test(h)) s += 2;
    }
    return s;
  }

  function valueShapeStats(values) {
    let urlish = 0;
    let paraish = 0;
    let total = 0;
    const hostCounts = Object.create(null);
    for (const v of values) {
      if (v == null) continue;
      const s = String(v).trim();
      if (!s) continue;
      total += 1;
      if (URL_RE.test(s)) {
        urlish += 1;
        try {
          const candidate = s.includes('://') ? s : `https://${s}`;
          const u = new URL(candidate);
          hostCounts[u.hostname] = (hostCounts[u.hostname] || 0) + 1;
        } catch (err) {
          // ignore invalid URLs
        }
      }
      if (s.length >= 40 && /\s/.test(s)) {
        paraish += 1;
      }
    }
    return {
      total,
      urlishPct: total ? urlish / total : 0,
      paraishPct: total ? paraish / total : 0,
      hostCounts,
    };
  }

  function extractCanonicalWebsite(raw) {
    if (!raw) return null;
    let s = String(raw).trim();
    if (!s) return null;
    try {
      const candidate = s.includes('://') ? s : `https://${s}`;
      const u0 = new URL(candidate);
      if (!AGGREGATOR_HOSTS.has(u0.hostname)) {
        return u0.origin;
      }
      for (const key of ['url', 'u', 'target', 'redirect', 'targetUrl', 'website']) {
        const q = u0.searchParams.get(key);
        if (q) {
          const next = q.includes('://') ? q : `https://${q}`;
          const u1 = new URL(next);
          if (!AGGREGATOR_HOSTS.has(u1.hostname)) {
            return u1.origin;
          }
        }
      }
    } catch (err) {
      // Fall through to null when parsing fails
    }
    return null;
  }

  function pickColumn(field, headers, rows) {
    let best = null;
    let bestScore = -1;
    const usableHeaders = (headers || []).filter((h) => h && h !== '__parsed_extra');
    for (const h of usableHeaders) {
      const vals = rows.map((r) => (r ? r[h] : undefined)).slice(0, 200);
      const shape = valueShapeStats(vals);
      let score = headerScore(field, h);
      if (field === 'website') {
        score += Math.round(shape.urlishPct * 6);
        const topHost = Object.entries(shape.hostCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (topHost && AGGREGATOR_HOSTS.has(topHost)) {
          score -= 3;
        }
      } else if (field === 'description' || field === 'specialties' || field === 'products') {
        score += Math.round(shape.paraishPct * 4);
      }
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return bestScore > 0 ? best : null;
  }

  function buildMapping(headers, rows) {
    return {
      companyName: pickColumn('companyName', headers, rows),
      website: pickColumn('website', headers, rows),
      description: pickColumn('description', headers, rows),
      specialties: pickColumn('specialties', headers, rows),
      products: pickColumn('products', headers, rows),
      endMarkets: pickColumn('endMarkets', headers, rows),
      industries: pickColumn('industries', headers, rows),
    };
  }

  function normalizeRows(rawRows, options = {}) {
    const rows = Array.isArray(rawRows) ? rawRows.filter((row) => row && typeof row === 'object') : [];
    const setSummary = typeof options.setSummary === 'function' ? options.setSummary : null;
    if (rows.length === 0) {
      const emptyMapping = {
        companyName: null,
        website: null,
        description: null,
        specialties: null,
        products: null,
        endMarkets: null,
        industries: null,
      };
      if (setSummary) setSummary(summaryLines(emptyMapping));
      return [];
    }
    const headers = Object.keys(rows[0] || {}).filter((key) => key && key !== '__parsed_extra');
    const mapping = buildMapping(headers, rows);
    if (setSummary) setSummary(summaryLines(mapping));
    const normalized = [];
    for (const row of rows) {
      const nameRaw = mapping.companyName ? row[mapping.companyName] : '';
      const descRaw = mapping.description ? row[mapping.description] : '';
      const specRaw = mapping.specialties ? row[mapping.specialties] : '';
      const prodRaw = mapping.products ? row[mapping.products] : '';
      const marketRaw = mapping.endMarkets ? row[mapping.endMarkets] : '';
      const industryRaw = mapping.industries ? row[mapping.industries] : '';
      const websiteRaw = mapping.website ? row[mapping.website] : null;
      const name = typeof nameRaw === 'string' ? nameRaw.trim() : String(nameRaw || '').trim();
      const website = extractCanonicalWebsite(websiteRaw);
      const desc = typeof descRaw === 'string' ? descRaw.trim() : String(descRaw || '').trim();
      const specs = typeof specRaw === 'string' ? specRaw.trim() : String(specRaw || '').trim();
      const prods = typeof prodRaw === 'string' ? prodRaw.trim() : String(prodRaw || '').trim();
      const mkts = (typeof marketRaw === 'string' ? marketRaw.trim() : String(marketRaw || '').trim())
        || (typeof industryRaw === 'string' ? industryRaw.trim() : String(industryRaw || '').trim());
      const summary = desc || specs || prods || mkts || 'Provides industry-related services (details not specified).';
      if (!name && !website && !summary) continue;
      normalized.push({
        'Company Name': name || '—',
        Website: website || '',
        Summary: summary,
      });
    }
    return normalized;
  }

  function summaryLines(mapping) {
    const order = ['companyName', 'website', 'description', 'specialties', 'products', 'endMarkets', 'industries'];
    const lines = ['Auto-mapped columns:'];
    for (const key of order) {
      lines.push(`${key}: ${mapping[key] ? mapping[key] : 'not found'}`);
    }
    return lines;
  }

  const mappingAPI = {
    FIELD_SYNONYMS,
    AGGREGATOR_HOSTS,
    URL_RE,
    headerScore,
    valueShapeStats,
    extractCanonicalWebsite,
    pickColumn,
    buildMapping,
    normalizeRows,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mappingAPI;
    return;
  }

  global.TargetsMapping = mappingAPI;

  if (typeof document === 'undefined') {
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const fileInput = $('#fileInput');
  const mapDiv = $('#mappingSummary');
  const tableBody = $('#resultsTable tbody');
  const btnCsv = $('#exportCsvBtn');
  const btnXlsx = $('#exportExcelBtn');

  if (global.Papa && typeof global.Papa === 'object') {
    global.Papa.SCRIPT_PATH = '/vendor/papaparse.min.js';
  }

  let toastTimer = null;
  let latestRows = [];

  if (fileInput) {
    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (mapDiv) mapDiv.textContent = 'Parsing…';
      tableBody.innerHTML = '';
      latestRows = [];
      btnCsv.disabled = true;
      btnXlsx.disabled = true;
      try {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ext === 'csv') {
          await parseCsv(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
          await parseXlsx(file);
        } else {
          throw new Error('Unsupported file type. Use CSV/XLSX.');
        }
      } catch (err) {
        console.error(err);
        if (mapDiv) mapDiv.textContent = `Error: ${err.message || String(err)}`;
      }
    });
  }

  async function parseCsv(file) {
    return new Promise((resolve, reject) => {
      global.Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        worker: false,
        complete: (result) => {
          try {
            const records = Array.isArray(result.data) ? result.data : [];
            finish(records);
          } catch (err) {
            console.error(err);
            if (mapDiv) mapDiv.textContent = `Error: ${err.message || String(err)}`;
          }
          resolve();
        },
        error: (err) => reject(err),
      });
    });
  }

  async function parseXlsx(file) {
    try {
      const buf = await file.arrayBuffer();
      const wb = global.XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const records = global.XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      finish(records);
    } catch (err) {
      console.error(err);
      if (mapDiv) mapDiv.textContent = `Error: ${err.message || String(err)}`;
    }
  }

  function finish(records) {
    const normalized = normalizeRows(records, {
      setSummary: (lines) => {
        if (mapDiv) mapDiv.textContent = lines.join('\n');
      },
    });
    latestRows = normalized;
    renderTable(latestRows);
    const hasRows = latestRows && latestRows.length > 0;
    btnCsv.disabled = !hasRows;
    btnXlsx.disabled = !hasRows;
  }

  function renderTable(rows) {
    tableBody.innerHTML = '';
    if (!rows || !rows.length) {
      return;
    }
    const frag = document.createDocumentFragment();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row['Company Name'] || '')}</td>
        <td>${escapeHtml(row.Website || '')}</td>
        <td>${escapeHtml(row.Summary || '')}</td>
      `;
      frag.appendChild(tr);
    }
    tableBody.appendChild(frag);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  btnCsv.addEventListener('click', () => {
    const csv = toCsv(latestRows, ['Company Name', 'Website', 'Summary']);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    download(url, 'ma_targets_standardized.csv');
  });

  btnXlsx.addEventListener('click', () => {
    if (!hasExcelSupport()) {
      showToast('Excel export unavailable (ExcelJS not loaded). Downloading CSV instead.', 'error');
      if (!btnCsv.disabled) btnCsv.click();
      return;
    }
    const ws = global.XLSX.utils.json_to_sheet(latestRows, { header: ['Company Name', 'Website', 'Summary'] });
    const wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, 'Targets');
    const out = global.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    download(url, 'ma_targets_standardized.xlsx');
  });

  function toCsv(rows, headers) {
    const escapeCell = (value) => {
      let s = String(value == null ? '' : value);
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        s = `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const out = [];
    out.push(headers.join(','));
    for (const row of rows || []) {
      out.push(headers.map((header) => escapeCell(row[header])).join(','));
    }
    return out.join('\n');
  }

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function hasExcelSupport() {
    return !!(
      global.XLSX
      && global.XLSX.utils
      && typeof global.XLSX.utils.json_to_sheet === 'function'
    );
  }

  function showToast(message, tone) {
    let toast = document.querySelector('.toast-banner');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast-banner';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.tone = tone || 'info';
    toast.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 4000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
