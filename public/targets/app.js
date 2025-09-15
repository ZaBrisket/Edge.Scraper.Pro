// M&A Target List Builder - Client-Side Processing
// Handles SourceScrub CSV format with 2-line preamble

const state = {
  rawData: [],
  processedData: [],
  filteredData: [],
  filters: {
    states: new Set(),
    industries: new Set(),
    endMarkets: new Set()
  },
  grid: null
};

// Utility functions
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Show/hide elements
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

// Format numbers
const formatMoney = (num) => {
  if (!num || isNaN(num)) return '—';
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
};

// Calculate median
const median = (arr) => {
  const sorted = arr.filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Extract domain from URL
const extractDomain = (url) => {
  if (!url) return '';
  try {
    // Remove protocol
    let domain = url.replace(/^https?:\/\//i, '');
    // Remove www
    domain = domain.replace(/^www\./i, '');
    // Remove path
    domain = domain.split('/')[0];
    return domain;
  } catch {
    return '';
  }
};

// Mask email for privacy
const maskEmail = (email) => {
  if (!email) return '';
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  const masked = user.length <= 2 
    ? '*'.repeat(user.length)
    : user[0] + '*'.repeat(Math.max(user.length - 2, 1)) + user[user.length - 1];
  return `${masked}@${domain}`;
};

// Parse SourceScrub CSV (handles 2-line preamble)
const parseSourceScrubCSV = (csvText) => {
  // Remove the 2-line preamble if present
  const lines = csvText.split(/\r?\n/);
  let startIndex = 0;
  
  // Check if first line contains "Search Url"
  if (lines[0] && lines[0].toLowerCase().includes('search url')) {
    startIndex = 2; // Skip first two lines
  }
  
  // Rejoin without preamble
  const cleanCSV = lines.slice(startIndex).join('\n');
  
  // Parse with PapaParse
  const result = Papa.parse(cleanCSV, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: (header) => header.trim()
  });
  
  return result.data;
};

// Process raw data into target format
const processData = (rawData) => {
  const processed = [];
  const seenWebsites = new Set();
  
  rawData.forEach((row, index) => {
    // Skip if no company name
    if (!row['Company Name']) return;
    
    // Apply filters based on options
    if ($('#filterUS').checked && row['Country'] !== 'US') return;
    
    // Deduplicate by website
    const website = row['Website'] || '';
    if ($('#dedupe').checked && website) {
      if (seenWebsites.has(website)) return;
      seenWebsites.add(website);
    }
    
    // Extract and clean data
    const domain = extractDomain(website);
    const estRevenue = parseFloat(row['Latest Estimated Revenue ($)']) || 0;
    const employeeCount = parseInt(row['Employee Count']) || 0;
    
    // Parse multi-value fields
    const industries = (row['Industries'] || '').split(',').map(i => i.trim()).filter(Boolean);
    const endMarkets = (row['End Markets'] || '').split(',').map(i => i.trim()).filter(Boolean);
    
    // Build processed record
    processed.push({
      id: index + 1,
      companyName: row['Company Name'] || '',
      informalName: row['Informal Name'] || row['Company Name'] || '',
      city: row['City'] || '',
      state: row['State'] || '',
      cityState: `${row['City'] || ''}, ${row['State'] || ''}`.trim(),
      website: website,
      domain: domain,
      logoUrl: domain ? `https://logo.clearbit.com/${domain}?size=64` : null,
      description: row['Description'] || '',
      employeeCount: employeeCount,
      employeeRange: (row['Employee Range'] || '').replace(/\t/g, '').trim(),
      estRevenue: estRevenue,
      estRevenueMM: estRevenue / 1000000,
      executiveTitle: row['Executive Title'] || '',
      executiveFirstName: row['Executive First Name'] || '',
      executiveLastName: row['Executive Last Name'] || '',
      executiveName: `${row['Executive First Name'] || ''} ${row['Executive Last Name'] || ''}`.trim(),
      executiveEmail: row['Executive Email'] || '',
      industries: industries,
      endMarkets: endMarkets,
      foundingYear: parseInt(row['Founding Year']) || null,
      ownership: row['Ownership'] || '',
      totalRaised: parseFloat(row['Total Raised']) || 0,
      sourceScrubUrl: row['ProfileUrl'] || '',
      score: calculateScore(row)
    });
  });
  
  // Sort by revenue by default
  processed.sort((a, b) => b.estRevenue - a.estRevenue);
  
  return processed;
};

// Calculate acquisition score
const calculateScore = (row) => {
  let score = 0;
  
  // Revenue (0-30 points)
  const revenue = parseFloat(row['Latest Estimated Revenue ($)']) || 0;
  const revenueMM = revenue / 1000000;
  if (revenueMM >= 1 && revenueMM <= 10) score += 30;
  else if (revenueMM < 1) score += 15;
  else if (revenueMM <= 20) score += 20;
  
  // Employees (0-20 points)
  const employees = parseInt(row['Employee Count']) || 0;
  if (employees >= 5 && employees <= 50) score += 20;
  else if (employees < 5) score += 10;
  else if (employees <= 100) score += 15;
  
  // Executive contact (0-20 points)
  if (row['Executive Email']) score += 20;
  
  // Funding (0-15 points)
  if (parseFloat(row['Total Raised']) > 0) score += 15;
  
  // Healthcare focus (0-15 points)
  const endMarkets = row['End Markets'] || '';
  if (endMarkets.includes('Healthcare')) score += 15;
  
  return score;
};

// Build filter chips
const buildFilters = () => {
  const container = $('#filterChips');
  container.innerHTML = '';
  
  // Get unique values
  const states = [...new Set(state.processedData.map(d => d.state).filter(Boolean))].sort();
  const industries = [...new Set(state.processedData.flatMap(d => d.industries))].sort();
  const endMarkets = [...new Set(state.processedData.flatMap(d => d.endMarkets))].sort();
  
  // Create filter groups
  const createChipGroup = (items, filterSet, prefix) => {
    items.slice(0, 10).forEach(item => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = `${prefix}: ${item}`;
      chip.dataset.value = item;
      chip.dataset.type = prefix.toLowerCase();
      
      chip.addEventListener('click', () => {
        if (filterSet.has(item)) {
          filterSet.delete(item);
          chip.classList.remove('active');
        } else {
          filterSet.add(item);
          chip.classList.add('active');
        }
        applyFilters();
      });
      
      container.appendChild(chip);
    });
  };
  
  createChipGroup(states, state.filters.states, 'State');
  createChipGroup(industries, state.filters.industries, 'Industry');
  createChipGroup(endMarkets, state.filters.endMarkets, 'Market');
};

// Apply filters to data
const applyFilters = () => {
  state.filteredData = state.processedData.filter(company => {
    // State filter
    if (state.filters.states.size > 0 && !state.filters.states.has(company.state)) {
      return false;
    }
    
    // Industry filter
    if (state.filters.industries.size > 0) {
      const hasIndustry = company.industries.some(i => state.filters.industries.has(i));
      if (!hasIndustry) return false;
    }
    
    // End market filter
    if (state.filters.endMarkets.size > 0) {
      const hasMarket = company.endMarkets.some(m => state.filters.endMarkets.has(m));
      if (!hasMarket) return false;
    }
    
    return true;
  });
  
  updateGrid();
  updateStats();
};

// Update statistics
const updateStats = () => {
  const data = state.filteredData;
  
  $('#statCompanies').textContent = data.length;
  
  const revenues = data.map(d => d.estRevenueMM).filter(r => r > 0);
  const medianRev = median(revenues);
  $('#statRevenue').textContent = medianRev ? `$${medianRev.toFixed(1)}M` : '—';
  
  const employees = data.map(d => d.employeeCount).filter(e => e > 0);
  const avgEmployees = employees.length ? 
    Math.round(employees.reduce((a, b) => a + b, 0) / employees.length) : 0;
  $('#statEmployees').textContent = avgEmployees || '—';
  
  const states = new Set(data.map(d => d.state).filter(Boolean));
  $('#statStates').textContent = states.size;
};

// Create data grid
const createGrid = () => {
  const showLogos = $('#showLogos').checked;
  const maskEmails = $('#maskEmails').checked;
  
  // Define columns
  const columns = [
    ...(showLogos ? [{
      name: 'Logo',
      width: '50px',
      formatter: (cell, row) => {
        const domain = row.cells[4].data; // Domain column
        if (!domain) return '';
        return gridjs.html(`<img class="logo-cell" src="https://logo.clearbit.com/${domain}?size=64" onerror="this.style.display='none'" />`);
      }
    }] : []),
    {
      name: 'Company',
      formatter: (cell, row) => {
        const name = row.cells[showLogos ? 1 : 0].data;
        const website = row.cells[showLogos ? 3 : 2].data;
        if (website) {
          return gridjs.html(`<a href="${website}" target="_blank" style="color: inherit; text-decoration: none;">${name} ↗</a>`);
        }
        return name;
      }
    },
    { name: 'Location' },
    { name: 'Website', hidden: true },
    { name: 'Domain', hidden: true },
    { 
      name: 'Revenue',
      formatter: (cell) => formatMoney(cell)
    },
    { name: 'Employees' },
    { name: 'Executive' },
    { 
      name: 'Email',
      formatter: (cell) => maskEmails ? maskEmail(cell) : cell
    },
    { name: 'Industries' },
    { name: 'Score' }
  ];
  
  // Create grid data
  const data = state.filteredData.map(company => [
    ...(showLogos ? [''] : []), // Logo placeholder
    company.informalName,
    company.cityState,
    company.website,
    company.domain,
    company.estRevenue,
    company.employeeCount || company.employeeRange,
    `${company.executiveName}\n${company.executiveTitle}`.trim(),
    company.executiveEmail,
    company.industries.join(', '),
    company.score
  ]);
  
  // Create or update grid
  if (state.grid) {
    state.grid.updateConfig({
      columns: columns,
      data: data
    }).forceRender();
  } else {
    state.grid = new gridjs.Grid({
      columns: columns,
      data: data,
      search: true,
      sort: true,
      pagination: {
        limit: 25
      },
      style: {
        td: {
          'font-size': '14px'
        },
        th: {
          'font-size': '13px'
        }
      }
    }).render($('#dataGrid'));
  }
};

// Update grid with filtered data
const updateGrid = () => {
  if (!state.grid) {
    createGrid();
  } else {
    createGrid(); // Recreate to update data
  }
};

// Export functions
const exportCSV = () => {
  const data = state.filteredData;
  const maskEmails = $('#maskEmails').checked;
  
  // Build CSV headers
  const headers = [
    'Company Name',
    'Informal Name',
    'City',
    'State',
    'Website',
    'Domain',
    'Description',
    'Employee Count',
    'Employee Range',
    'Est. Revenue ($)',
    'Est. Revenue ($MM)',
    'Executive Name',
    'Executive Title',
    'Executive Email',
    'Industries',
    'End Markets',
    'Founded',
    'Score'
  ];
  
  // Build CSV rows
  const rows = data.map(company => [
    company.companyName,
    company.informalName,
    company.city,
    company.state,
    company.website,
    company.domain,
    company.description,
    company.employeeCount,
    company.employeeRange,
    company.estRevenue,
    company.estRevenueMM.toFixed(2),
    company.executiveName,
    company.executiveTitle,
    maskEmails ? maskEmail(company.executiveEmail) : company.executiveEmail,
    company.industries.join('; '),
    company.endMarkets.join('; '),
    company.foundingYear,
    company.score
  ]);
  
  // Convert to CSV string
  const csv = Papa.unparse({
    fields: headers,
    data: rows
  });
  
  // Download
  downloadFile(csv, 'ma_targets.csv', 'text/csv');
};

const exportExcel = () => {
  const data = state.filteredData;
  const maskEmails = $('#maskEmails').checked;
  
  // Prepare data for Excel
  const wsData = data.map(company => ({
    'Company Name': company.companyName,
    'Informal Name': company.informalName,
    'City': company.city,
    'State': company.state,
    'City, State': company.cityState,
    'Website': company.website,
    'Domain': company.domain,
    'Description': company.description,
    'Employee Count': company.employeeCount,
    'Est. Rev ($MM)': Number(company.estRevenueMM.toFixed(2)),
    'Executive Name': company.executiveName,
    'Executive Title': company.executiveTitle,
    'Executive Email': maskEmails ? maskEmail(company.executiveEmail) : company.executiveEmail,
    'Industries': company.industries.join('; '),
    'End Markets': company.endMarkets.join('; '),
    'Founded': company.foundingYear,
    'Score': company.score
  }));
  
  // Create workbook
  const ws = XLSX.utils.json_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Target Universe');
  
  // Download
  XLSX.writeFile(wb, 'ma_targets.xlsx');
};

const exportJSON = () => {
  const data = state.filteredData;
  const maskEmails = $('#maskEmails').checked;
  
  // Mask emails if needed
  const exportData = data.map(company => ({
    ...company,
    executiveEmail: maskEmails ? maskEmail(company.executiveEmail) : company.executiveEmail
  }));
  
  const json = JSON.stringify(exportData, null, 2);
  downloadFile(json, 'ma_targets.json', 'application/json');
};

// Download helper
const downloadFile = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

// Handle file upload
const handleFile = async (file) => {
  if (!file || !file.name.endsWith('.csv')) {
    showError('Please upload a CSV file');
    return;
  }
  
  try {
    showLoading(true);
    hideMessages();
    
    const text = await file.text();
    const rawData = parseSourceScrubCSV(text);
    
    if (!rawData || rawData.length === 0) {
      throw new Error('No data found in CSV');
    }
    
    state.rawData = rawData;
    state.processedData = processData(rawData);
    state.filteredData = state.processedData;
    
    // Show results
    show($('#statsPanel'));
    show($('#resultsPanel'));
    
    // Build UI
    buildFilters();
    updateGrid();
    updateStats();
    
    showSuccess(`Successfully processed ${state.processedData.length} companies`);
    
  } catch (error) {
    console.error('Error processing file:', error);
    showError(`Failed to process file: ${error.message}`);
  } finally {
    showLoading(false);
  }
};

// UI helpers
const showError = (message) => {
  const el = $('#errorMessage');
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
};

const showSuccess = (message) => {
  const el = $('#successMessage');
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
};

const showLoading = (show) => {
  const el = $('#loading');
  if (show) {
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
};

const hideMessages = () => {
  $('#errorMessage').style.display = 'none';
  $('#successMessage').style.display = 'none';
};

// Initialize event handlers
const init = () => {
  const uploadZone = $('#uploadZone');
  const fileInput = $('#fileInput');
  
  // File input change
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });
  
  // Click to upload
  uploadZone.addEventListener('click', () => {
    fileInput.click();
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
    if (file) handleFile(file);
  });
  
  // Export buttons
  $('#exportCSV').addEventListener('click', exportCSV);
  $('#exportExcel').addEventListener('click', exportExcel);
  $('#exportJSON').addEventListener('click', exportJSON);
  
  // Options change handlers
  $('#maskEmails').addEventListener('change', () => {
    if (state.grid) updateGrid();
  });
  
  $('#showLogos').addEventListener('change', () => {
    if (state.grid) updateGrid();
  });
  
  $('#filterUS').addEventListener('change', () => {
    if (state.rawData.length > 0) {
      state.processedData = processData(state.rawData);
      state.filteredData = state.processedData;
      buildFilters();
      updateGrid();
      updateStats();
    }
  });
  
  $('#dedupe').addEventListener('change', () => {
    if (state.rawData.length > 0) {
      state.processedData = processData(state.rawData);
      state.filteredData = state.processedData;
      buildFilters();
      updateGrid();
      updateStats();
    }
  });
};

// Start the app
document.addEventListener('DOMContentLoaded', init);