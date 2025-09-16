/**
 * Standardization Handler for M&A Targets Page
 * Integrates with existing targets.js functionality
 */

(function() {
  'use strict';

  // Check dependencies
  if (!window.Papa || !window.XLSX || !window.StandardizationEngineV2) {
    console.error('Missing dependencies for standardization feature');
    return;
  }

  // Cache DOM elements
  const elements = {
    fileInput: document.getElementById('std-file-input'),
    mappingSection: document.getElementById('std-mapping-section'),
    autoMapping: document.getElementById('std-auto-mapping'),
    resultsSection: document.getElementById('std-results-section'),
    tbody: document.getElementById('std-results-tbody'),
    exportCsv: document.getElementById('std-export-csv'),
    exportXlsx: document.getElementById('std-export-xlsx'),
    applyMapping: document.getElementById('std-apply-mapping'),
    resultCount: document.getElementById('std-count'),
    
    // Mapping selects
    mapCompany: document.getElementById('map-company-name'),
    mapWebsite: document.getElementById('map-website'),
    mapDescription: document.getElementById('map-description'),
    mapSpecialties: document.getElementById('map-specialties'),
    mapProducts: document.getElementById('map-products'),
    mapIndustries: document.getElementById('map-industries'),
    mapEndMarkets: document.getElementById('map-end-markets')
  };

  // State
  let currentPrepared = null;
  let currentResults = [];

  // File upload handler
  elements.fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    resetUI();
    
    try {
      const extension = file.name.split('.').pop().toLowerCase();
      let data;

      if (extension === 'csv') {
        data = await parseCSV(file);
      } else if (extension === 'xlsx' || extension === 'xls') {
        data = await parseXLSX(file);
      } else {
        throw new Error('Please upload a CSV or Excel file');
      }

      processData(data);
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Error processing file: ${error.message}`);
    }
  });

  // Parse CSV file
  function parseCSV(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors);
          }
          resolve(results.data);
        },
        header: true,
        skipEmptyLines: true,
        error: reject
      });
    });
  }

  // Parse Excel file
  async function parseXLSX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  }

  // Process uploaded data
  function processData(data) {
    // Prepare data with auto-mapping
    currentPrepared = window.StandardizationEngineV2.prepare(data);
    
    if (!currentPrepared.success) {
      alert(currentPrepared.messages.join('\n'));
      return;
    }

    // Display mapping info
    displayMapping(currentPrepared);
    
    // Generate initial results
    generateResults();
    
    // Show sections
    elements.mappingSection.style.display = 'block';
    elements.resultsSection.style.display = 'block';
  }

  // Display mapping information
  function displayMapping(prepared) {
    const { columnMap, messages, headers } = prepared;
    
    // Show auto-mapping summary
    const mappingLines = [
      '<strong>Auto-detected columns:</strong>'
    ];
    
    Object.entries(columnMap).forEach(([key, value]) => {
      const status = value ? `✓ ${value}` : '✗ Not found';
      mappingLines.push(`${key}: ${status}`);
    });
    
    if (messages.length > 0) {
      mappingLines.push('', '<strong>Warnings:</strong>');
      messages.forEach(msg => mappingLines.push(`⚠ ${msg}`));
    }
    
    elements.autoMapping.innerHTML = mappingLines.join('<br>');
    
    // Populate manual mapping dropdowns
    const dropdowns = [
      { element: elements.mapCompany, value: columnMap.companyName },
      { element: elements.mapWebsite, value: columnMap.website },
      { element: elements.mapDescription, value: columnMap.description },
      { element: elements.mapSpecialties, value: columnMap.specialties },
      { element: elements.mapProducts, value: columnMap.products },
      { element: elements.mapIndustries, value: columnMap.industries },
      { element: elements.mapEndMarkets, value: columnMap.endMarkets }
    ];
    
    dropdowns.forEach(({ element, value }) => {
      if (!element) return;
      
      element.innerHTML = '<option value="">(Not mapped)</option>';
      headers.forEach(header => {
        const option = document.createElement('option');
        option.value = header;
        option.textContent = header;
        if (header === value) {
          option.selected = true;
        }
        element.appendChild(option);
      });
    });
  }

  // Generate standardized results
  function generateResults(overrides = {}) {
    currentResults = window.StandardizationEngineV2.summarize(currentPrepared, overrides);
    displayResults(currentResults);
  }

  // Display results in table
  function displayResults(results) {
    const fragment = document.createDocumentFragment();
    
    results.forEach(row => {
      const tr = document.createElement('tr');
      
      // Company Name
      const tdName = document.createElement('td');
      tdName.textContent = row['Company Name'] || '(Unknown)';
      tr.appendChild(tdName);
      
      // Website
      const tdWebsite = document.createElement('td');
      if (row['Website']) {
        const link = document.createElement('a');
        link.href = row['Website'].startsWith('http') ? row['Website'] : `http://${row['Website']}`;
        link.textContent = row['Website'];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        tdWebsite.appendChild(link);
      }
      tr.appendChild(tdWebsite);
      
      // Original Description (truncated)
      const tdOriginal = document.createElement('td');
      const original = row['Original Description'] || '';
      tdOriginal.textContent = original.length > 150 ? 
        original.substring(0, 150) + '...' : original;
      tdOriginal.title = original; // Show full on hover
      tr.appendChild(tdOriginal);
      
      // Standardized Summary
      const tdSummary = document.createElement('td');
      tdSummary.textContent = row['Summary'];
      const wordCount = row['Summary'].split(/\s+/).length;
      if (wordCount > 30) {
        tdSummary.style.color = '#dc3545'; // Red if over limit
      }
      tr.appendChild(tdSummary);
      
      fragment.appendChild(tr);
    });
    
    elements.tbody.innerHTML = '';
    elements.tbody.appendChild(fragment);
    
    // Update count
    elements.resultCount.textContent = `${results.length} companies processed`;
    
    // Enable export buttons
    elements.exportCsv.disabled = results.length === 0;
    elements.exportXlsx.disabled = results.length === 0;
  }

  // Apply manual mapping
  elements.applyMapping?.addEventListener('click', () => {
    if (!currentPrepared) return;
    
    const overrides = {
      companyName: elements.mapCompany.value || null,
      website: elements.mapWebsite.value || null,
      description: elements.mapDescription.value || null,
      specialties: elements.mapSpecialties.value || null,
      products: elements.mapProducts.value || null,
      industries: elements.mapIndustries.value || null,
      endMarkets: elements.mapEndMarkets.value || null
    };
    
    generateResults(overrides);
  });

  // Export to CSV
  elements.exportCsv?.addEventListener('click', () => {
    if (currentResults.length === 0) return;
    
    const csvData = currentResults.map(row => ({
      'Company Name': row['Company Name'],
      'Website': row['Website'],
      'Summary': row['Summary']
    }));
    
    const csv = Papa.unparse(csvData);
    
    // Add CSV injection protection
    const safeCsv = csv.replace(/^([=+\-@])/gm, "'$1");
    
    downloadFile(safeCsv, 'standardized_companies.csv', 'text/csv');
  });

  // Export to Excel
  elements.exportXlsx?.addEventListener('click', () => {
    if (currentResults.length === 0) return;
    
    const wsData = currentResults.map(row => ({
      'Company Name': row['Company Name'],
      'Website': row['Website'],
      'Summary': row['Summary']
    }));
    
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Standardized Companies');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // Company Name
      { wch: 30 }, // Website
      { wch: 60 }  // Summary
    ];
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    
    downloadFile(blob, 'standardized_companies.xlsx');
  });

  // Utility: Download file
  function downloadFile(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Reset UI
  function resetUI() {
    elements.tbody.innerHTML = '';
    elements.autoMapping.innerHTML = 'Processing...';
    elements.mappingSection.style.display = 'none';
    elements.resultsSection.style.display = 'none';
    elements.exportCsv.disabled = true;
    elements.exportXlsx.disabled = true;
    currentPrepared = null;
    currentResults = [];
  }

  // Initialize
  console.log('Standardization handler loaded successfully');
  
})();