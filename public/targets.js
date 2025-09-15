/**
 * M&A Target List Builder for EdgeScraperPro
 * Handles SourceScrub CSV exports with 2-line header format
 * 100% client-side processing with localStorage persistence
 */

// ============= Configuration =============
const CONFIG = {
  STORAGE_KEY: 'edgescraperpro:targets:v2',
  STORAGE_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  CLEARBIT_API: 'https://logo.clearbit.com',
  DEFAULT_LOGO_SIZE: 64,
  SESSION_EXPIRY_HOURS: 24
};

// ============= Global State =============
const AppState = {
  raw: [],          // Original parsed rows
  processed: [],    // Processed with derived fields
  filtered: [],     // After filters applied
  headerMap: {},    // Raw header -> canonical mapping
  fileInfo: null,   // File metadata
  sort: {
    column: null,
    direction: 'asc'
  },
  filters: {
    search: '',
    state: '',
    industry: '',
    endMarket: ''
  }
};

// ============= DOM Helpers =============
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

// ============= Header Mapping =============
const HEADER_MAP = {
  'company name': 'companyName',
  'informal name': 'informalName',
  'founding year': 'foundingYear',
  'street': 'street',
  'city': 'city',
  'state': 'state',
  'postal code': 'postalCode',
  'country': 'country',
  'phone number': 'phone',
  'website': 'website',
  'description': 'description',
  'specialties': 'specialties',
  'linkedin account': 'linkedinCompany',
  'employee count': 'employeeCount',
  'employee range': 'employeeRange',
  'products and services': 'productsServices',
  'end markets': 'endMarkets',
  '3 months growth rate %': 'growth3m',
  '6 months growth rate %': 'growth6m',
  '9 months growth rate %': 'growth9m',
  '12 months growth rate %': 'growth12m',
  '24 months growth rate %': 'growth24m',
  'growth intent': 'growthIntent',
  'job count': 'jobCount',
  'ownership': 'ownership',
  'total raised': 'totalRaised',
  'latest raised': 'latestRaised',
  'date of most recent investment': 'lastInvestmentDate',
  'investors': 'investors',
  'parent company': 'parentCompany',
  'executive title': 'execTitle',
  'executive first name': 'execFirstName',
  'executive last name': 'execLastName',
  'executive email': 'execEmail',
  'executive linkedin': 'execLinkedIn',
  'last financial year': 'lastFinancialYear',
  'verified revenue': 'verifiedRevenue',
  'latest estimated revenue ($)': 'estRevenue',
  'latest estimated revenue min ($)': 'estRevenueMin',
  'latest estimated revenue max ($)': 'estRevenueMax',
  'financial growth %': 'financialGrowth',
  'financial growth period (yr)': 'financialGrowthYears',
  'sources count': 'sourcesCount',
  'crm id': 'crmId',
  '(crm) top prospect?': 'crmTopProspect',
  'my tags': 'myTags',
  'firm tags': 'firmTags',
  'industries': 'industries',
  'lists': 'lists',
  'profileurl': 'profileUrl',
  'lead investor': 'leadInvestor',
  'notes': 'notes',
  'registration number 1': 'regNumber1',
  'registry type 1': 'regType1'
};

// ============= Utility Functions =============
function normalizeHeader(header) {
  return header.toLowerCase()
    .replace(/[^a-z0-9\s$%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapHeaders(headers) {
  const map = {};
  headers.forEach(header => {
    const normalized = normalizeHeader(header);
    map[header] = HEADER_MAP[normalized] || normalized.replace(/\s+/g, '_');
  });
  return map;
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseMoney(value) {
  const num = parseNumber(value);
  return num ? Math.round(num * 100) / 100 : null;
}

function cleanEmployeeRange(value) {
  // Remove tab characters that appear in SourceScrub data
  return String(value || '').replace(/\t/g, '').trim();
}

function extractDomain(url) {
  if (!url) return '';
  try {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(cleanUrl);
    let domain = urlObj.hostname.toLowerCase();
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    return domain;
  } catch {
    // Fallback for invalid URLs
    const cleaned = String(url).toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '');
    return cleaned.split('/')[0] || '';
  }
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function unique(array) {
  return [...new Set(array)];
}

function median(numbers) {
  const valid = numbers.filter(n => n != null && !isNaN(n));
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatMoney(value) {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatNumber(value) {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('en-US');
}

// ============= CSV Parsing =============
async function parseCSV(file) {
  const text = await file.text();
  
  // Remove UTF-8 BOM if present
  const cleanText = text.replace(/^\uFEFF/, '');
  
  // Handle SourceScrub 2-line header format
  const lines = cleanText.split(/\r?\n/);
  let dataStart = 0;
  
  // Check if first line contains "Search Url"
  if (lines[0] && lines[0].toLowerCase().includes('search url')) {
    // Skip first line (Search Url) and second line (blank)
    dataStart = 2;
  }
  
  const csvData = lines.slice(dataStart).join('\n');
  
  return new Promise((resolve, reject) => {
    Papa.parse(csvData, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const headers = results.meta.fields || [];
        const headerMap = mapHeaders(headers);
        
        // Map raw data to canonical field names
        const rows = results.data.map(row => {
          const mapped = {};
          for (const [rawKey, value] of Object.entries(row)) {
            const canonicalKey = headerMap[rawKey];
            mapped[canonicalKey] = typeof value === 'string' ? value.trim() : value;
          }
          return mapped;
        });
        
        resolve({ headerMap, rows });
      },
      error: reject
    });
  });
}

// ============= Data Processing =============
function processRow(row) {
  // Basic fields
  const website = row.website || '';
  const domain = extractDomain(website);
  
  // Clean employee range (remove tabs)
  const employeeRange = cleanEmployeeRange(row.employeeRange);
  
  // Parse numeric fields
  const employeeCount = parseNumber(row.employeeCount);
  const revenue = parseMoney(row.estRevenue);
  const revenueMin = parseMoney(row.estRevenueMin);
  const revenueMax = parseMoney(row.estRevenueMax);
  const revenueMM = revenue ? revenue / 1000000 : null;
  
  // Executive info
  const execFirstName = row.execFirstName || '';
  const execLastName = row.execLastName || '';
  const execName = [execFirstName, execLastName].filter(Boolean).join(' ');
  const execTitle = row.execTitle || '';
  const execBlock = [execName, execTitle].filter(Boolean).join('\n');
  
  // Parse list fields
  const industries = parseList(row.industries);
  const endMarkets = parseList(row.endMarkets);
  
  return {
    // Core identifiers
    companyName: row.companyName || '',
    informalName: row.informalName || row.companyName || '',
    
    // Location
    city: row.city || '',
    state: row.state || '',
    cityState: [row.city, row.state].filter(Boolean).join(', '),
    country: row.country || '',
    
    // Web presence
    website,
    domain,
    logoUrl: domain ? `${CONFIG.CLEARBIT_API}/${domain}?size=${CONFIG.DEFAULT_LOGO_SIZE}` : '',
    
    // Description
    description: row.description || '',
    
    // Size metrics
    employeeCount,
    employeeRange,
    
    // Financial metrics
    revenue,
    revenueMin,
    revenueMax,
    revenueMM,
    
    // Executive info
    execFirstName,
    execLastName,
    execName,
    execTitle,
    execBlock,
    execEmail: row.execEmail || '',
    execLinkedIn: row.execLinkedIn || '',
    
    // Categories
    industries,
    endMarkets,
    
    // Additional data
    foundingYear: parseNumber(row.foundingYear),
    ownership: row.ownership || '',
    totalRaised: parseMoney(row.totalRaised),
    profileUrl: row.profileUrl || '',
    linkedinCompany: row.linkedinCompany || '',
    sourcesCount: parseNumber(row.sourcesCount),
    
    // Raw row for export
    _raw: row
  };
}

// ============= Data Validation =============
function validateData(processed) {
  const issues = [];
  const warnings = [];
  
  // Check for duplicate websites
  const websites = processed.map(r => r.website).filter(Boolean);
  const duplicates = websites.filter((w, i) => websites.indexOf(w) !== i);
  if (duplicates.length > 0) {
    warnings.push(`Found ${unique(duplicates).length} duplicate website entries`);
  }
  
  // Check data completeness
  const missingRevenue = processed.filter(r => !r.revenue).length;
  if (missingRevenue > 0) {
    warnings.push(`${missingRevenue} companies missing revenue data`);
  }
  
  const missingEmployees = processed.filter(r => !r.employeeCount && !r.employeeRange).length;
  if (missingEmployees > 0) {
    warnings.push(`${missingEmployees} companies missing employee data`);
  }
  
  const missingExec = processed.filter(r => !r.execName && !r.execTitle).length;
  if (missingExec > 0) {
    warnings.push(`${missingExec} companies missing executive information`);
  }
  
  return { issues, warnings };
}

// ============= Filtering & Sorting =============
function applyFilters() {
  let filtered = [...AppState.processed];
  
  // Search filter
  const search = AppState.filters.search.toLowerCase();
  if (search) {
    filtered = filtered.filter(row => {
      const searchable = [
        row.companyName,
        row.informalName,
        row.domain,
        row.execName,
        row.execTitle,
        row.description,
        row.city,
        row.state,
        ...row.industries,
        ...row.endMarkets
      ].join(' ').toLowerCase();
      return searchable.includes(search);
    });
  }
  
  // State filter
  if (AppState.filters.state) {
    filtered = filtered.filter(row => row.state === AppState.filters.state);
  }
  
  // Industry filter
  if (AppState.filters.industry) {
    filtered = filtered.filter(row => row.industries.includes(AppState.filters.industry));
  }
  
  // End market filter
  if (AppState.filters.endMarket) {
    filtered = filtered.filter(row => row.endMarkets.includes(AppState.filters.endMarket));
  }
  
  AppState.filtered = filtered;
  
  // Apply sort if active
  if (AppState.sort.column) {
    sortData(AppState.sort.column, AppState.sort.direction);
  }
}

function sortData(column, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  
  AppState.filtered.sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];
    
    // Handle null/undefined
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';
    
    // Numeric comparison
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
  
  AppState.sort = { column, direction };
}

// ============= UI Rendering =============
function renderStats() {
  const data = AppState.filtered;
  
  if (data.length === 0) {
    hide($('statsPanel'));
    return;
  }
  
  show($('statsPanel'));
  
  // Calculate statistics
  const revenues = data.map(r => r.revenue).filter(r => r != null);
  const employees = data.map(r => r.employeeCount).filter(e => e != null);
  const states = unique(data.map(r => r.state).filter(Boolean));
  const allIndustries = unique(data.flatMap(r => r.industries));
  const allEndMarkets = unique(data.flatMap(r => r.endMarkets));
  
  // Update stat cards
  $('statCount').textContent = data.length;
  $('statRevenue').textContent = formatMoney(median(revenues));
  $('statEmployees').textContent = formatNumber(median(employees));
  $('statStates').textContent = states.length;
  
  // State distribution
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
    .join('');
  
  $('statDetails').innerHTML = topStates ? `Top States: ${topStates}` : '';
  
  // Update filter options
  updateFilterOptions(states, allIndustries, allEndMarkets);
}

function updateFilterOptions(states, industries, endMarkets) {
  // State filter
  const stateSelect = $('stateFilter');
  const currentState = stateSelect.value;
  stateSelect.innerHTML = '<option value="">All States</option>' +
    states.sort().map(s => `<option value="${s}">${s}</option>`).join('');
  stateSelect.value = currentState;
  
  // Industry filter
  const industrySelect = $('industryFilter');
  const currentIndustry = industrySelect.value;
  industrySelect.innerHTML = '<option value="">All Industries</option>' +
    industries.sort().map(i => `<option value="${i}">${i}</option>`).join('');
  industrySelect.value = currentIndustry;
  
  // End market filter
  const endMarketSelect = $('endMarketFilter');
  const currentEndMarket = endMarketSelect.value;
  endMarketSelect.innerHTML = '<option value="">All End Markets</option>' +
    endMarkets.sort().map(m => `<option value="${m}">${m}</option>`).join('');
  endMarketSelect.value = currentEndMarket;
}

function renderTable() {
  const data = AppState.filtered;
  
  if (data.length === 0) {
    hide($('tablePanel'));
    return;
  }
  
  show($('tablePanel'));
  
  // Table columns configuration
  const columns = [
    { key: 'index', label: '#', width: '40px' },
    { key: 'logo', label: '', width: '40px' },
    { key: 'informalName', label: 'Company', sortable: true },
    { key: 'city', label: 'City', sortable: true },
    { key: 'state', label: 'State', sortable: true },
    { key: 'website', label: 'Website', class: 'mono' },
    { key: 'domain', label: 'Domain', class: 'mono', sortable: true },
    { key: 'description', label: 'Description' },
    { key: 'employeeCount', label: 'Employees', sortable: true, class: 'number' },
    { key: 'revenueMM', label: 'Revenue ($MM)', sortable: true, class: 'number' },
    { key: 'execTitle', label: 'Exec Title' },
    { key: 'execName', label: 'Exec Name', sortable: true },
    { key: 'execBlock', label: 'Executive', class: 'wrap' },
    { key: 'revenue', label: 'Revenue ($)', sortable: true, class: 'number' }
  ];
  
  // Render header
  const thead = $('tableHead');
  thead.innerHTML = '<tr>' + columns.map(col => {
    const sortClass = col.sortable ? 'sortable' : '';
    const sortedClass = AppState.sort.column === col.key ? 
      `sorted-${AppState.sort.direction}` : '';
    const widthStyle = col.width ? `style="width:${col.width}"` : '';
    const dataAttr = col.sortable ? `data-column="${col.key}"` : '';
    
    return `<th class="${sortClass} ${sortedClass}" ${widthStyle} ${dataAttr}>${col.label}</th>`;
  }).join('') + '</tr>';
  
  // Render body
  const tbody = $('tableBody');
  tbody.innerHTML = data.map((row, index) => {
    const logoCell = row.logoUrl ? 
      `<img class="company-logo" src="${row.logoUrl}" alt="" onerror="this.parentElement.innerHTML='<div class=\\'logo-placeholder\\'>${row.informalName.charAt(0).toUpperCase()}</div>'">` :
      `<div class="logo-placeholder">${row.informalName.charAt(0).toUpperCase()}</div>`;
    
    const websiteCell = row.website ? 
      `<a href="${row.website}" target="_blank" rel="noopener">${row.website}</a>` : '';
    
    return `<tr>
      <td>${index + 1}</td>
      <td>${logoCell}</td>
      <td>${escapeHtml(row.informalName)}</td>
      <td>${escapeHtml(row.city)}</td>
      <td>${escapeHtml(row.state)}</td>
      <td class="mono">${websiteCell}</td>
      <td class="mono">${escapeHtml(row.domain)}</td>
      <td>${escapeHtml(row.description.substring(0, 200))}</td>
      <td class="number">${row.employeeCount || row.employeeRange || '—'}</td>
      <td class="number">${row.revenueMM ? row.revenueMM.toFixed(2) : '—'}</td>
      <td>${escapeHtml(row.execTitle)}</td>
      <td>${escapeHtml(row.execName)}</td>
      <td class="wrap">${escapeHtml(row.execBlock)}</td>
      <td class="number">${formatMoney(row.revenue)}</td>
    </tr>`;
  }).join('');
  
  // Attach sort handlers
  thead.querySelectorAll('th[data-column]').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.column;
      const newDirection = AppState.sort.column === column && 
        AppState.sort.direction === 'asc' ? 'desc' : 'asc';
      sortData(column, newDirection);
      renderTable();
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function showMessage(text, type = 'success') {
  const msg = $('uploadMessage');
  msg.className = `message message-${type}`;
  msg.textContent = text;
  show(msg);
  
  if (type === 'success') {
    setTimeout(() => hide(msg), 5000);
  }
}

function showIssues(validation) {
  const box = $('dataIssues');
  const list = $('issuesList');
  
  if (!validation.warnings.length && !validation.issues.length) {
    hide(box);
    return;
  }
  
  show(box);
  
  let html = '<ul>';
  validation.issues.forEach(issue => {
    html += `<li style="color:var(--danger)">${issue}</li>`;
  });
  validation.warnings.forEach(warning => {
    html += `<li style="color:var(--warning)">${warning}</li>`;
  });
  html += '</ul>';
  
  list.innerHTML = html;
}

// ============= Export Functions =============
function exportCSV() {
  const data = AppState.filtered;
  if (!data.length) {
    showMessage('No data to export', 'warning');
    return;
  }
  
  const includePII = $('includePII').checked;
  
  // Headers
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
    'Employee Range',
    'Est. Rev ($MM)',
    'Executive Title',
    'Executive Name',
    'Executive',
    'Latest Revenue ($)'
  ];
  
  if (includePII) {
    headers.push('Executive Email');
  }
  
  // Data rows
  const rows = [headers];
  data.forEach((row, i) => {
    const csvRow = [
      i + 1,
      row.informalName,
      row.city,
      row.state,
      row.cityState,
      row.website,
      row.domain,
      row.description,
      row.employeeCount || '',
      row.employeeRange,
      row.revenueMM ? row.revenueMM.toFixed(2) : '',
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
  
  // Generate CSV
  const csv = Papa.unparse(rows);
  downloadFile(csv, 'target-universe.csv', 'text/csv');
}

function exportExcel() {
  const data = AppState.filtered;
  if (!data.length) {
    showMessage('No data to export', 'warning');
    return;
  }
  
  const includePII = $('includePII').checked;
  
  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: Target Universe (curated view)
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
  
  const targetData = [targetHeaders];
  data.forEach((row, i) => {
    const excelRow = [
      i + 1,
      row.domain ? { f: `IFERROR(IMAGE("${CONFIG.CLEARBIT_API}/${row.domain}?size=64"), "")` } : '',
      row.informalName,
      row.city,
      row.state,
      row.cityState,
      row.website,
      row.domain,
      row.description,
      row.employeeCount || row.employeeRange,
      row.revenueMM ? Number(row.revenueMM.toFixed(2)) : '',
      row.execTitle,
      row.execFirstName,
      row.execLastName,
      row.execBlock,
      row.revenue || ''
    ];
    
    if (includePII) {
      excelRow.push(row.execEmail);
    }
    
    targetData.push(excelRow);
  });
  
  const ws1 = XLSX.utils.aoa_to_sheet(targetData);
  XLSX.utils.book_append_sheet(wb, ws1, 'Target Universe');
  
  // Sheet 2: Raw Source Data
  const ws2 = XLSX.utils.json_to_sheet(AppState.raw);
  XLSX.utils.book_append_sheet(wb, ws2, 'Source Data');
  
  // Export
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  downloadFile(blob, 'target-universe.xlsx');
}

function downloadFile(content, filename, mimeType) {
  const blob = content instanceof Blob ? content : 
    new Blob([content], { type: mimeType });
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

// ============= Storage Functions =============
function saveSession() {
  try {
    const data = {
      raw: AppState.raw,
      headerMap: AppState.headerMap,
      fileInfo: AppState.fileInfo,
      timestamp: Date.now()
    };
    
    const json = JSON.stringify(data);
    if (json.length > CONFIG.STORAGE_MAX_SIZE) {
      console.warn('Data too large for localStorage');
      return;
    }
    
    localStorage.setItem(CONFIG.STORAGE_KEY, json);
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

function loadSession() {
  try {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!stored) return false;
    
    const data = JSON.parse(stored);
    
    // Check age
    const age = Date.now() - data.timestamp;
    const maxAge = CONFIG.SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
    if (age > maxAge) {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      return false;
    }
    
    AppState.raw = data.raw;
    AppState.headerMap = data.headerMap;
    AppState.fileInfo = data.fileInfo;
    
    // Reprocess data
    AppState.processed = AppState.raw.map(processRow);
    AppState.filtered = AppState.processed;
    
    return true;
  } catch (error) {
    console.error('Failed to load session:', error);
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    return false;
  }
}

function clearSession() {
  localStorage.removeItem(CONFIG.STORAGE_KEY);
}

// ============= File Processing =============
async function processFile(file) {
  try {
    showMessage('Processing file...', 'success');
    
    // Parse CSV
    const { headerMap, rows } = await parseCSV(file);
    
    AppState.raw = rows;
    AppState.headerMap = headerMap;
    AppState.fileInfo = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified
    };
    
    // Process rows
    AppState.processed = rows.map(processRow);
    AppState.filtered = AppState.processed;
    
    // Validate
    const validation = validateData(AppState.processed);
    if (validation.issues.length || validation.warnings.length) {
      showIssues(validation);
    }
    
    // Save session
    saveSession();
    
    // Update UI
    applyFilters();
    renderStats();
    renderTable();
    
    showMessage(`Successfully loaded ${AppState.processed.length} companies`, 'success');
    
  } catch (error) {
    console.error('File processing error:', error);
    showMessage(`Error: ${error.message}`, 'error');
  }
}

// ============= Event Handlers =============
function initializeApp() {
  // File upload
  const uploadZone = $('uploadZone');
  const fileInput = $('fileInput');
  
  uploadZone.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  });
  
  // Drag and drop
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });
  
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });
  
  // Filters
  $('searchInput').addEventListener('input', (e) => {
    AppState.filters.search = e.target.value;
    applyFilters();
    renderStats();
    renderTable();
  });
  
  $('stateFilter').addEventListener('change', (e) => {
    AppState.filters.state = e.target.value;
    applyFilters();
    renderStats();
    renderTable();
  });
  
  $('industryFilter').addEventListener('change', (e) => {
    AppState.filters.industry = e.target.value;
    applyFilters();
    renderStats();
    renderTable();
  });
  
  $('endMarketFilter').addEventListener('change', (e) => {
    AppState.filters.endMarket = e.target.value;
    applyFilters();
    renderStats();
    renderTable();
  });
  
  // Export buttons
  $('exportCsvBtn').addEventListener('click', exportCSV);
  $('exportExcelBtn').addEventListener('click', exportExcel);
  
  // Clear button
  $('clearBtn').addEventListener('click', () => {
    if (confirm('Clear all data? This cannot be undone.')) {
      clearSession();
      
      // Reset state
      AppState.raw = [];
      AppState.processed = [];
      AppState.filtered = [];
      AppState.headerMap = {};
      AppState.fileInfo = null;
      AppState.sort = { column: null, direction: 'asc' };
      AppState.filters = { search: '', state: '', industry: '', endMarket: '' };
      
      // Reset UI
      hide($('statsPanel'));
      hide($('tablePanel'));
      hide($('uploadMessage'));
      hide($('dataIssues'));
      
      $('searchInput').value = '';
      $('stateFilter').value = '';
      $('industryFilter').value = '';
      $('endMarketFilter').value = '';
      
      showMessage('All data cleared', 'success');
    }
  });
  
  // Load previous session if available
  if (loadSession()) {
    applyFilters();
    renderStats();
    renderTable();
    showMessage('Previous session restored', 'success');
  }
}

// ============= Initialize on Load =============
document.addEventListener('DOMContentLoaded', initializeApp);