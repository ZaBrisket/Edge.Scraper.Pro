/**
 * M&A Target List Builder - EdgeScraperPro
 * Client-side processing for SourceScrub CSV/XLSX exports
 * Features: Header mapping, data curation, filtering, sorting, export
 */

/* ========== Configuration ========== */

const CONFIG = {
  STORAGE_KEY: 'espro:targets:v1',
  MAX_STORAGE_SIZE: 5 * 1024 * 1024, // 5MB limit for localStorage
  CLEARBIT_LOGO_URL: 'https://logo.clearbit.com',
  REQUIRED_COLUMNS: [
    'Company Name',
    'Website',
    'Latest Estimated Revenue ($)'
  ],
  PREFERRED_COLUMNS: [
    'Informal Name',
    'City',
    'State',
    'Executive Title',
    'Executive First Name',
    'Executive Last Name',
    'Employee Count',
    'Industries',
    'End Markets'
  ]
};

/* ========== Header Mapping System ========== */

const HEADER_SYNONYMS = new Map([
  ['company name', ['company', 'legal name', 'business name']],
  ['informal name', ['company (informal)', 'brand name', 'dba', 'trade name']],
  ['founding year', ['founded', 'foundingyear', 'year founded', 'established']],
  ['street', ['address', 'street address', 'address 1']],
  ['city', ['town', 'municipality']],
  ['state', ['region', 'province', 'state/province']],
  ['postal code', ['zip', 'zipcode', 'zip code', 'postal']],
  ['country', ['nation', 'country code']],
  ['phone number', ['phone', 'telephone', 'tel', 'contact number']],
  ['website', ['url', 'homepage', 'web site', 'company website']],
  ['description', ['company description', 'overview', 'about', 'summary']],
  ['specialties', ['specializations', 'expertise']],
  ['linkedin account', ['linkedin', 'company linkedin', 'linkedin url']],
  ['employee count', ['employees', '# employees', 'headcount', 'staff count']],
  ['employee range', ['size range', 'company size', 'employee size']],
  ['products and services', ['products & services', 'offerings']],
  ['end markets', ['end-markets', 'end market', 'target markets', 'markets']],
  ['ownership', ['ownership type', 'company type']],
  ['total raised', ['total funding', 'cumulative raised']],
  ['latest raised', ['last round', 'recent funding']],
  ['investors', ['investor list', 'backers']],
  ['parent company', ['parent', 'holding company']],
  ['executive title', ['exec title', 'executive role', 'exec position']],
  ['executive first name', ['exec first name', 'exec first', 'executive fname']],
  ['executive last name', ['exec last name', 'exec last', 'executive lname']],
  ['executive email', ['exec email', 'executive contact', 'exec contact email']],
  ['executive linkedin', ['exec linkedin', 'executive linkedin url']],
  ['latest estimated revenue ($)', ['latest estimated revenue', 'estimated revenue', 'est revenue']],
  ['latest estimated revenue min ($)', ['revenue min', 'est revenue min', 'minimum revenue']],
  ['latest estimated revenue max ($)', ['revenue max', 'est revenue max', 'maximum revenue']],
  ['sources count', ['# sources', 'source count', 'data sources']],
  ['industries', ['industry', 'sectors', 'industry sectors']],
  ['lists', ['list membership', 'member of lists']],
  ['profileurl', ['profile url', 'profile', 'sourcescrub url']],
  ['mz summary description', ['mz description', 'curated description', 'summary description']]
]);

/* ========== State Management ========== */

const state = {
  rawRows: [],
  processedRows: [],
  filteredRows: [],
  headerMap: {},
  fileMetadata: null,
  currentSort: { column: null, direction: 'asc' },
  filters: {
    search: '',
    state: '',
    industry: '',
    endMarket: ''
  }
};

/* ========== Utility Functions ========== */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCanonicalHeader(rawHeader) {
  const normalized = normalizeHeader(rawHeader);
  
  // Direct match
  for (const [canonical, synonyms] of HEADER_SYNONYMS.entries()) {
    if (normalized === canonical) return canonical;
    if (synonyms.includes(normalized)) return canonical;
  }
  
  // Fuzzy match (contains)
  for (const [canonical, synonyms] of HEADER_SYNONYMS.entries()) {
    if (normalized.includes(canonical)) return canonical;
    for (const synonym of synonyms) {
      if (normalized.includes(synonym)) return canonical;
    }
  }
  
  return normalized;
}

function buildHeaderMap(headers) {
  const map = {};
  headers.forEach(rawHeader => {
    map[rawHeader] = findCanonicalHeader(rawHeader);
  });
  return map;
}

function parseNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number' && isFinite(value)) return value;
  const str = String(value).replace(/[^\d.-]/g, '');
  if (!str) return null;
  const num = Number(str);
  return isFinite(num) ? num : null;
}

function parseMoney(value) {
  const num = parseNumber(value);
  return num != null ? Math.round(num * 100) / 100 : null;
}

function cleanEmployeeRange(value) {
  // Remove stray tabs that appear in SourceScrub exports
  return String(value || '').replace(/\t/g, '').trim();
}

function extractDomain(url) {
  if (!url) return '';
  try {
    // Handle URLs without protocol
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(fullUrl);
    let hostname = urlObj.hostname.toLowerCase();
    // Remove www prefix
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    // Fallback for malformed URLs
    const cleaned = String(url)
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '');
    return cleaned.split('/')[0] || '';
  }
}

function tokenizeCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function unique(array) {
  return Array.from(new Set(array));
}

function median(numbers) {
  const filtered = numbers.filter(n => typeof n === 'number' && !isNaN(n));
  if (!filtered.length) return null;
  const sorted = [...filtered].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatMoney(value) {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatNumber(value) {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('en-US');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ========== CSV/XLSX Parsing ========== */

async function parseFile(file) {
  const extension = file.name.toLowerCase().split('.').pop();
  
  if (extension === 'csv') {
    return await parseCsv(file);
  } else if (extension === 'xlsx' || extension === 'xls') {
    return await parseExcel(file);
  } else {
    throw new Error('Unsupported file type. Please upload a CSV or Excel file.');
  }
}

async function parseCsv(file) {
  const text = await file.text();
  
  // Remove BOM if present
  const cleanText = text.replace(/^\uFEFF/, '');
  
  // Handle SourceScrub 2-line header (Search Url + blank line)
  const lines = cleanText.split(/\r?\n/);
  let startIndex = 0;
  
  // Check if first line contains "Search Url"
  if (lines[0] && lines[0].toLowerCase().includes('search url')) {
    // Skip first two lines (Search Url line + blank line)
    startIndex = 2;
  }
  
  const dataText = lines.slice(startIndex).join('\n');
  
  return new Promise((resolve, reject) => {
    Papa.parse(dataText, {
      header: true,
      dynamicTyping: false, // We'll handle type conversion ourselves
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const headers = results.meta.fields || [];
        const headerMap = buildHeaderMap(headers);
        
        const rows = results.data.map(row => {
          const normalizedRow = {};
          for (const [rawKey, value] of Object.entries(row)) {
            const canonicalKey = headerMap[rawKey] || rawKey;
            normalizedRow[canonicalKey] = typeof value === 'string' ? value.trim() : value;
          }
          return normalizedRow;
        });
        
        resolve({ headerMap, rows });
      },
      error: (error) => reject(error)
    });
  });
}

async function parseExcel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  // Try to find SourceScrub sheet first
  let sheetName = workbook.SheetNames.find(name => 
    name.toLowerCase().includes('sourcescrub') || 
    name.toLowerCase().includes('source')
  );
  
  // Fallback to first sheet
  if (!sheetName) {
    sheetName = workbook.SheetNames[0];
  }
  
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  if (!jsonData.length) {
    throw new Error('No data found in Excel file');
  }
  
  const headers = Object.keys(jsonData[0]);
  const headerMap = buildHeaderMap(headers);
  
  const rows = jsonData.map(row => {
    const normalizedRow = {};
    for (const [rawKey, value] of Object.entries(row)) {
      const canonicalKey = headerMap[rawKey] || rawKey;
      normalizedRow[canonicalKey] = typeof value === 'string' ? value.trim() : value;
    }
    return normalizedRow;
  });
  
  return { headerMap, rows };
}

/* ========== Data Processing ========== */

function processRow(row) {
  // Core fields
  const website = row['website'] || '';
  const domain = extractDomain(website);
  
  // Company info
  const companyName = row['company name'] || '';
  const informalName = row['informal name'] || companyName;
  
  // Location
  const city = row['city'] || '';
  const state = row['state'] || '';
  const cityState = [city, state].filter(Boolean).join(', ');
  
  // Description (prefer MZ Summary if available)
  const mzSummary = row['mz summary description'];
  const description = (mzSummary && mzSummary.trim()) ? 
    mzSummary : (row['description'] || '');
  
  // Employee data
  const employeeCount = parseNumber(row['employee count']);
  const employeeRange = cleanEmployeeRange(row['employee range']);
  
  // Revenue data
  const revenue = parseMoney(row['latest estimated revenue ($)']);
  const revenueMin = parseMoney(row['latest estimated revenue min ($)']);
  const revenueMax = parseMoney(row['latest estimated revenue max ($)']);
  const revenueMM = revenue ? revenue / 1000000 : null;
  
  // Executive data
  const execFirst = row['executive first name'] || '';
  const execLast = row['executive last name'] || '';
  const execTitle = row['executive title'] || '';
  const execName = [execFirst, execLast].filter(Boolean).join(' ');
  const execBlock = [execName, execTitle].filter(Boolean).join('\n');
  const execEmail = row['executive email'] || '';
  
  // Categories
  const industries = tokenizeCsv(row['industries']);
  const endMarkets = tokenizeCsv(row['end markets']);
  
  // Additional metadata
  const foundingYear = parseNumber(row['founding year']);
  const sourcesCount = parseNumber(row['sources count']);
  
  return {
    // Identifiers
    companyName,
    informalName,
    
    // Location
    city,
    state,
    cityState,
    country: row['country'] || '',
    
    // Web presence
    website,
    domain,
    logoUrl: domain ? `${CONFIG.CLEARBIT_LOGO_URL}/${domain}?size=64` : '',
    
    // Description
    description,
    
    // Size metrics
    employeeCount,
    employeeRange,
    
    // Financial metrics
    revenue,
    revenueMin,
    revenueMax,
    revenueMM,
    
    // Executive info
    execFirst,
    execLast,
    execTitle,
    execName,
    execBlock,
    execEmail,
    execLinkedIn: row['executive linkedin'] || '',
    
    // Categories
    industries,
    endMarkets,
    
    // Additional data
    foundingYear,
    ownership: row['ownership'] || '',
    totalRaised: parseMoney(row['total raised']),
    profileUrl: row['profileurl'] || '',
    companyLinkedIn: row['linkedin account'] || '',
    sourcesCount
  };
}

/* ========== Data Validation ========== */

function validateData(rows, headerMap) {
  const issues = [];
  const warnings = [];
  
  // Check required columns
  const canonicalHeaders = new Set(Object.values(headerMap));
  const missingRequired = CONFIG.REQUIRED_COLUMNS.filter(col => 
    !canonicalHeaders.has(normalizeHeader(col))
  );
  
  if (missingRequired.length > 0) {
    issues.push(`Missing required columns: ${missingRequired.join(', ')}`);
  }
  
  // Check preferred columns
  const missingPreferred = CONFIG.PREFERRED_COLUMNS.filter(col =>
    !canonicalHeaders.has(normalizeHeader(col))
  );
  
  if (missingPreferred.length > 0) {
    warnings.push(`Missing optional columns that improve output: ${missingPreferred.join(', ')}`);
  }
  
  // Check for duplicate websites
  const websites = rows.map(r => r.website).filter(Boolean);
  const duplicates = websites.filter((site, index) => websites.indexOf(site) !== index);
  
  if (duplicates.length > 0) {
    warnings.push(`Found ${unique(duplicates).length} duplicate website entries`);
  }
  
  // Check data completeness
  const missingRevenue = rows.filter(r => !r.revenue).length;
  if (missingRevenue > 0) {
    warnings.push(`${missingRevenue} companies missing revenue data`);
  }
  
  const missingEmployees = rows.filter(r => !r.employeeCount && !r.employeeRange).length;
  if (missingEmployees > 0) {
    warnings.push(`${missingEmployees} companies missing employee data`);
  }
  
  return { issues, warnings };
}

/* ========== Filtering & Sorting ========== */

function applyFilters() {
  let rows = [...state.processedRows];
  
  // Search filter
  const searchTerm = state.filters.search.toLowerCase();
  if (searchTerm) {
    rows = rows.filter(row => {
      const searchableText = [
        row.companyName,
        row.informalName,
        row.domain,
        row.website,
        row.execName,
        row.execTitle,
        row.description,
        row.industries.join(' '),
        row.endMarkets.join(' '),
        row.city,
        row.state
      ].join(' ').toLowerCase();
      
      return searchableText.includes(searchTerm);
    });
  }
  
  // State filter
  if (state.filters.state) {
    rows = rows.filter(row => row.state === state.filters.state);
  }
  
  // Industry filter
  if (state.filters.industry) {
    rows = rows.filter(row => row.industries.includes(state.filters.industry));
  }
  
  // End market filter
  if (state.filters.endMarket) {
    rows = rows.filter(row => row.endMarkets.includes(state.filters.endMarket));
  }
  
  state.filteredRows = rows;
  
  // Apply current sort
  if (state.currentSort.column) {
    sortTable(state.currentSort.column, state.currentSort.direction);
  }
}

function sortTable(column, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  
  state.filteredRows.sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];
    
    // Handle null/undefined
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';
    
    // Numeric comparison for number fields
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * multiplier;
    }
    
    // String comparison
    aVal = String(aVal).toLowerCase();
    bVal = String(bVal).toLowerCase();
    
    if (aVal < bVal) return -1 * multiplier;
    if (aVal > bVal) return 1 * multiplier;
    return 0;
  });
  
  state.currentSort = { column, direction };
}

/* ========== UI Rendering ========== */

function renderSummary() {
  const data = state.filteredRows;
  
  if (data.length === 0) {
    $('#summaryPanel').classList.add('hidden');
    return;
  }
  
  $('#summaryPanel').classList.remove('hidden');
  
  // Calculate statistics
  const revenues = data.map(r => r.revenue).filter(r => r != null);
  const employees = data.map(r => r.employeeCount).filter(e => e != null);
  const states = unique(data.map(r => r.state).filter(Boolean));
  const industries = unique(data.flatMap(r => r.industries));
  const endMarkets = unique(data.flatMap(r => r.endMarkets));
  
  // Update stat cards
  $('#statCompanies').textContent = data.length;
  $('#statRevenue').textContent = formatMoney(median(revenues));
  $('#statEmployees').textContent = formatNumber(median(employees));
  $('#statStates').textContent = states.length;
  
  // Top states
  const stateCount = {};
  data.forEach(row => {
    if (row.state) {
      stateCount[row.state] = (stateCount[row.state] || 0) + 1;
    }
  });
  
  const topStates = Object.entries(stateCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([state, count]) => `<span class="pill">${state} (${count})</span>`)
    .join(' ');
  
  $('#topStates').innerHTML = topStates ? `Top States: ${topStates}` : '';
  
  // Top industries
  const industryCount = {};
  data.forEach(row => {
    row.industries.forEach(industry => {
      industryCount[industry] = (industryCount[industry] || 0) + 1;
    });
  });
  
  const topIndustries = Object.entries(industryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([industry, count]) => `<span class="pill">${industry} (${count})</span>`)
    .join(' ');
  
  $('#topIndustries').innerHTML = topIndustries ? `Top Industries: ${topIndustries}` : '';
  
  // Update filter dropdowns
  updateFilterOptions(states, industries, endMarkets);
}

function updateFilterOptions(states, industries, endMarkets) {
  // State filter
  const stateSelect = $('#stateFilter');
  const currentState = stateSelect.value;
  stateSelect.innerHTML = '<option value="">All States</option>' +
    states.sort().map(s => `<option value="${s}">${s}</option>`).join('');
  stateSelect.value = currentState;
  
  // Industry filter
  const industrySelect = $('#industryFilter');
  const currentIndustry = industrySelect.value;
  industrySelect.innerHTML = '<option value="">All Industries</option>' +
    industries.sort().map(i => `<option value="${i}">${i}</option>`).join('');
  industrySelect.value = currentIndustry;
  
  // End market filter
  const endMarketSelect = $('#endMarketFilter');
  const currentEndMarket = endMarketSelect.value;
  endMarketSelect.innerHTML = '<option value="">All End Markets</option>' +
    endMarkets.sort().map(m => `<option value="${m}">${m}</option>`).join('');
  endMarketSelect.value = currentEndMarket;
}

function renderTable() {
  if (state.filteredRows.length === 0) {
    $('#tablePanel').classList.add('hidden');
    return;
  }
  
  $('#tablePanel').classList.remove('hidden');
  
  // Define columns
  const columns = [
    { key: '#', label: '#', width: '40px', sortable: false },
    { key: 'logo', label: '', width: '40px', sortable: false },
    { key: 'informalName', label: 'Company', sortable: true },
    { key: 'city', label: 'City', sortable: true },
    { key: 'state', label: 'State', sortable: true },
    { key: 'cityState', label: 'City, State', sortable: true },
    { key: 'website', label: 'Website', sortable: true, class: 'mono' },
    { key: 'domain', label: 'Domain', sortable: true, class: 'mono' },
    { key: 'description', label: 'Description', sortable: false },
    { key: 'employeeCount', label: 'Count', sortable: true, class: 'text-right' },
    { key: 'revenueMM', label: 'Est. Rev ($MM)', sortable: true, class: 'text-right' },
    { key: 'execTitle', label: 'Executive Title', sortable: true },
    { key: 'execName', label: 'Executive Name', sortable: true },
    { key: 'execBlock', label: 'Executive', sortable: false, class: 'wrap' },
    { key: 'revenue', label: 'Latest Revenue ($)', sortable: true, class: 'text-right' }
  ];
  
  // Render header
  const thead = $('#targetThead');
  thead.innerHTML = '<tr>' +
    columns.map(col => {
      let classes = [];
      if (col.sortable) {
        if (state.currentSort.column === col.key) {
          classes.push(`sorted-${state.currentSort.direction}`);
        }
      }
      const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
      const widthAttr = col.width ? ` style="width: ${col.width}"` : '';
      const dataAttr = col.sortable ? ` data-column="${col.key}"` : '';
      
      return `<th${classAttr}${widthAttr}${dataAttr}>${col.label}</th>`;
    }).join('') + '</tr>';
  
  // Render body
  const tbody = $('#targetTbody');
  tbody.innerHTML = state.filteredRows.map((row, index) => {
    const cells = [
      `<td>${index + 1}</td>`,
      `<td>${renderLogo(row)}</td>`,
      `<td>${escapeHtml(row.informalName)}</td>`,
      `<td>${escapeHtml(row.city)}</td>`,
      `<td>${escapeHtml(row.state)}</td>`,
      `<td>${escapeHtml(row.cityState)}</td>`,
      `<td class="mono">${row.website ? `<a href="${row.website}" target="_blank" rel="noopener">${escapeHtml(row.website)}</a>` : ''}</td>`,
      `<td class="mono">${escapeHtml(row.domain)}</td>`,
      `<td>${escapeHtml(row.description)}</td>`,
      `<td class="text-right nowrap">${row.employeeCount != null ? formatNumber(row.employeeCount) : row.employeeRange || '—'}</td>`,
      `<td class="text-right nowrap">${row.revenueMM != null ? row.revenueMM.toFixed(2) : '—'}</td>`,
      `<td>${escapeHtml(row.execTitle)}</td>`,
      `<td>${escapeHtml(row.execName)}</td>`,
      `<td class="wrap">${escapeHtml(row.execBlock)}</td>`,
      `<td class="text-right nowrap">${formatMoney(row.revenue)}</td>`
    ];
    
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  
  // Attach sort handlers
  $$('#targetThead th[data-column]').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.column;
      const newDirection = state.currentSort.column === column && state.currentSort.direction === 'asc' ? 'desc' : 'asc';
      sortTable(column, newDirection);
      renderTable();
    });
  });
}

function renderLogo(row) {
  if (!row.logoUrl) {
    return `<div class="logo-placeholder">${row.informalName.charAt(0).toUpperCase()}</div>`;
  }
  
  return `<img class="logo" 
    src="${row.logoUrl}" 
    alt="${row.informalName} logo"
    onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'logo-placeholder\\'>${row.informalName.charAt(0).toUpperCase()}</div>'"
  />`;
}

function showIssues(validation) {
  const issuesBox = $('#issuesBox');
  const content = $('#issuesContent');
  
  if (!validation.issues.length && !validation.warnings.length) {
    issuesBox.classList.add('hidden');
    return;
  }
  
  issuesBox.classList.remove('hidden');
  
  let html = '';
  
  if (validation.issues.length > 0) {
    html += '<div class="error">Issues:</div><ul>';
    validation.issues.forEach(issue => {
      html += `<li>${escapeHtml(issue)}</li>`;
    });
    html += '</ul>';
  }
  
  if (validation.warnings.length > 0) {
    html += '<div class="warning">Warnings:</div><ul>';
    validation.warnings.forEach(warning => {
      html += `<li>${escapeHtml(warning)}</li>`;
    });
    html += '</ul>';
  }
  
  content.innerHTML = html;
}

function showMessage(message, type = 'success') {
  const status = $('#uploadStatus');
  status.className = `message ${type}`;
  status.textContent = message;
  status.classList.remove('hidden');
  
  if (type === 'success') {
    setTimeout(() => status.classList.add('hidden'), 5000);
  }
}

/* ========== Export Functions ========== */

function exportCsv() {
  const includePII = $('#includePII').checked;
  const data = state.filteredRows;
  
  if (data.length === 0) {
    showMessage('No data to export', 'warning');
    return;
  }
  
  // Define headers
  const headers = [
    '#',
    'Company',
    'City',
    'State',
    'City, State',
    'Website',
    'Domain',
    'Description',
    'Employee Count',
    'Est. Rev ($MM)',
    'Executive Title',
    'Executive Name',
    'Executive',
    'Latest Revenue ($)'
  ];
  
  if (includePII) {
    headers.push('Executive Email');
  }
  
  // Build rows
  const rows = [headers];
  
  data.forEach((row, index) => {
    const csvRow = [
      index + 1,
      row.informalName,
      row.city,
      row.state,
      row.cityState,
      row.website,
      row.domain,
      row.description,
      row.employeeCount != null ? row.employeeCount : row.employeeRange,
      row.revenueMM != null ? row.revenueMM.toFixed(2) : '',
      row.execTitle,
      row.execName,
      row.execBlock.replace(/\n/g, ' '),
      row.revenue || ''
    ];
    
    if (includePII) {
      csvRow.push(row.execEmail);
    }
    
    rows.push(csvRow);
  });
  
  // Convert to CSV string
  const csv = Papa.unparse(rows);
  
  // Download
  downloadFile(csv, 'target-universe.csv', 'text/csv');
}

function exportExcel() {
  const includePII = $('#includePII').checked;
  const targetData = state.filteredRows;
  
  if (targetData.length === 0) {
    showMessage('No data to export', 'warning');
    return;
  }
  
  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: Target Universe (with Excel IMAGE formula for logos)
  const targetHeaders = [
    '#',
    'Logo',
    'Company',
    'City',
    'State',
    'City, State',
    'Website',
    'Domain',
    'Description',
    'Count',
    'Est. Rev ($MM)',
    'Executive Title',
    'Executive First Name',
    'Executive Last Name',
    'Executive',
    'Latest Revenue ($)'
  ];
  
  if (includePII) {
    targetHeaders.push('Executive Email');
  }
  
  const targetRows = [targetHeaders];
  
  targetData.forEach((row, index) => {
    const excelRow = [
      index + 1,
      // Excel 365 IMAGE formula for logo
      row.domain ? { f: `IFERROR(IMAGE("${CONFIG.CLEARBIT_LOGO_URL}/${row.domain}?size=64"), "")` } : '',
      row.informalName,
      row.city,
      row.state,
      row.cityState,
      row.website,
      row.domain,
      row.description,
      row.employeeCount != null ? row.employeeCount : row.employeeRange,
      row.revenueMM != null ? Number(row.revenueMM.toFixed(2)) : '',
      row.execTitle,
      row.execFirst,
      row.execLast,
      row.execBlock,
      row.revenue || ''
    ];
    
    if (includePII) {
      excelRow.push(row.execEmail);
    }
    
    targetRows.push(excelRow);
  });
  
  const ws1 = XLSX.utils.aoa_to_sheet(targetRows);
  XLSX.utils.book_append_sheet(wb, ws1, 'Target Universe');
  
  // Sheet 2: Source Raw (normalized data)
  const ws2 = XLSX.utils.json_to_sheet(state.rawRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'Source Data');
  
  // Write and download
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadFile(blob, 'target-universe.xlsx');
}

function downloadFile(content, filename, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ========== Storage Functions ========== */

function saveToStorage() {
  try {
    const dataToStore = {
      rawRows: state.rawRows,
      headerMap: state.headerMap,
      fileMetadata: state.fileMetadata,
      timestamp: Date.now()
    };
    
    const json = JSON.stringify(dataToStore);
    
    // Check size limit
    if (json.length > CONFIG.MAX_STORAGE_SIZE) {
      console.warn('Data too large for localStorage');
      return;
    }
    
    localStorage.setItem(CONFIG.STORAGE_KEY, json);
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!stored) return false;
    
    const data = JSON.parse(stored);
    
    // Check if data is less than 24 hours old
    const age = Date.now() - data.timestamp;
    if (age > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      return false;
    }
    
    state.rawRows = data.rawRows;
    state.headerMap = data.headerMap;
    state.fileMetadata = data.fileMetadata;
    
    // Process data
    state.processedRows = state.rawRows.map(processRow);
    state.filteredRows = state.processedRows;
    
    return true;
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    return false;
  }
}

function clearStorage() {
  localStorage.removeItem(CONFIG.STORAGE_KEY);
}

/* ========== File Handling ========== */

async function handleFile(file) {
  try {
    showMessage('Processing file...', 'success');
    
    // Parse file
    const { headerMap, rows } = await parseFile(file);
    
    // Store raw data
    state.rawRows = rows;
    state.headerMap = headerMap;
    state.fileMetadata = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified
    };
    
    // Process data
    state.processedRows = rows.map(processRow);
    state.filteredRows = state.processedRows;
    
    // Validate
    const validation = validateData(state.processedRows, headerMap);
    if (validation.issues.length > 0 || validation.warnings.length > 0) {
      showIssues(validation);
    }
    
    // Save to storage
    saveToStorage();
    
    // Update UI
    applyFilters();
    renderSummary();
    renderTable();
    
    showMessage(`Successfully loaded ${state.processedRows.length} companies`, 'success');
    
  } catch (error) {
    console.error('File processing error:', error);
    showMessage(`Error: ${error.message}`, 'error');
  }
}

/* ========== Event Handlers ========== */

function initializeEventHandlers() {
  // File upload
  const uploader = $('#uploader');
  const fileInput = $('#fileInput');
  
  uploader.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });
  
  // Drag and drop
  uploader.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploader.classList.add('drag');
  });
  
  uploader.addEventListener('dragleave', () => {
    uploader.classList.remove('drag');
  });
  
  uploader.addEventListener('drop', (e) => {
    e.preventDefault();
    uploader.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  
  // Filters
  $('#searchBox').addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    applyFilters();
    renderSummary();
    renderTable();
  });
  
  $('#stateFilter').addEventListener('change', (e) => {
    state.filters.state = e.target.value;
    applyFilters();
    renderSummary();
    renderTable();
  });
  
  $('#industryFilter').addEventListener('change', (e) => {
    state.filters.industry = e.target.value;
    applyFilters();
    renderSummary();
    renderTable();
  });
  
  $('#endMarketFilter').addEventListener('change', (e) => {
    state.filters.endMarket = e.target.value;
    applyFilters();
    renderSummary();
    renderTable();
  });
  
  // Export buttons
  $('#exportCsvBtn').addEventListener('click', exportCsv);
  $('#exportXlsxBtn').addEventListener('click', exportExcel);
  
  // Clear button
  $('#clearBtn').addEventListener('click', () => {
    if (confirm('Clear all data? This cannot be undone.')) {
      clearStorage();
      state.rawRows = [];
      state.processedRows = [];
      state.filteredRows = [];
      state.headerMap = {};
      state.fileMetadata = null;
      
      $('#summaryPanel').classList.add('hidden');
      $('#tablePanel').classList.add('hidden');
      $('#uploadStatus').classList.add('hidden');
      $('#issuesBox').classList.add('hidden');
      
      // Reset filters
      $('#searchBox').value = '';
      $('#stateFilter').value = '';
      $('#industryFilter').value = '';
      $('#endMarketFilter').value = '';
      state.filters = {
        search: '',
        state: '',
        industry: '',
        endMarket: ''
      };
      
      showMessage('All data cleared', 'success');
    }
  });
}

/* ========== Initialization ========== */

document.addEventListener('DOMContentLoaded', () => {
  initializeEventHandlers();
  
  // Try to load previous session
  if (loadFromStorage()) {
    applyFilters();
    renderSummary();
    renderTable();
    showMessage('Previous session restored', 'success');
  }
});