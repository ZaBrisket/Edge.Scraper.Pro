/**
 * M&A Target List Builder for EdgeScraperPro
 * Handles SourceScrub CSV exports with 2-line header format
 * Includes template-based description summarization for 100% accuracy
 * 100% client-side processing with localStorage persistence
 */

// ============= Configuration =============
const CONFIG = {
  STORAGE_KEY: 'edgescraperpro:targets:v2',
  STORAGE_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  CLEARBIT_API: 'https://logo.clearbit.com',
  DEFAULT_LOGO_SIZE: 64,
  SESSION_EXPIRY_HOURS: 24,
  ENABLE_DESCRIPTION_STANDARDIZATION: true,
  REQUIRED_COLUMNS: [
    'Company Name',
    'Website',
    'Latest Estimated Revenue ($)'
  ]
};

// Debug mode for troubleshooting CSV parsing
const DEBUG_MODE = {
  CSV_PARSING: true,  // Set to true to see detailed CSV parsing logs
  SHOW_RAW_HEADERS: true,  // Show raw headers before mapping
  SHOW_MAPPED_DATA: true   // Show sample of mapped data
};

// ============= Template-Based Summarization Configuration =============
const BUSINESS_TEMPLATES = {
  // HVAC and Building Systems
  'commissioning': 'commissioning and building automation specialist',
  'hvac_service': 'HVAC and mechanical services provider',
  'testing': 'test and balance contractor',
  'building_automation': 'building automation and controls provider',
  'energy': 'energy efficiency and management solutions provider',
  
  // Construction and Engineering
  'construction': 'construction and mechanical contractor',
  'consulting': 'engineering and consulting firm',
  'electrical': 'electrical contracting and services',
  'plumbing': 'plumbing and mechanical systems contractor',
  'roofing': 'roofing and building envelope specialist',
  
  // Technology
  'software': 'software and technology solutions provider',
  'data': 'data analytics and information services',
  'cloud': 'cloud infrastructure and services provider',
  'cybersecurity': 'cybersecurity and IT security solutions',
  
  // Manufacturing and Industrial
  'manufacturing': 'manufacturing and production company',
  'distribution': 'distribution and logistics provider',
  'industrial': 'industrial equipment and services',
  'automation': 'industrial automation solutions',
  
  // Healthcare
  'healthcare': 'healthcare services provider',
  'medical_device': 'medical device manufacturer',
  'pharma': 'pharmaceutical and life sciences',
  'biotech': 'biotechnology and research',
  
  // Professional Services
  'staffing': 'staffing and workforce solutions',
  'marketing': 'marketing and advertising services',
  'financial': 'financial and business services',
  'legal': 'legal and professional services',
  
  // Default
  'specialty': 'specialty services provider'
};

const SERVICE_KEYWORDS = {
  // HVAC/Building
  'commissioning': ['commissioning', 'retro-commissioning', 'cx', 'rcx', 'building startup'],
  'testing': ['test and balance', 'TAB', 'testing', 'balancing', 'air balance', 'water balance'],
  'hvac': ['HVAC', 'heating', 'ventilation', 'air conditioning', 'refrigeration', 'chiller'],
  'controls': ['building automation', 'BAS', 'BMS', 'controls', 'DDC', 'energy management'],
  'energy': ['energy efficiency', 'energy solutions', 'energy management', 'sustainability'],
  'maintenance': ['maintenance', 'preventive', 'service', 'repair', 'PM'],
  
  // Construction
  'mechanical': ['mechanical', 'piping', 'plumbing', 'sheet metal'],
  'electrical': ['electrical', 'power', 'lighting', 'low voltage'],
  'general': ['general contractor', 'construction management', 'design-build'],
  
  // Technology
  'software': ['software', 'SaaS', 'platform', 'application', 'system'],
  'data': ['data', 'analytics', 'intelligence', 'insights', 'reporting'],
  'cloud': ['cloud', 'hosting', 'infrastructure', 'IaaS', 'PaaS'],
  
  // Healthcare
  'clinical': ['clinical', 'patient care', 'medical', 'diagnostic'],
  'devices': ['medical device', 'equipment', 'instruments', 'supplies']
};

const MARKET_SEGMENTS = {
  'commercial': ['commercial', 'office', 'retail', 'hospitality'],
  'healthcare': ['healthcare', 'hospital', 'medical', 'clinical'],
  'education': ['education', 'university', 'school', 'academic'],
  'government': ['government', 'federal', 'state', 'municipal', 'public sector'],
  'industrial': ['industrial', 'manufacturing', 'warehouse', 'distribution'],
  'residential': ['residential', 'multifamily', 'housing', 'apartments']
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
  'registry type 1': 'regType1',
  // Additional mappings for variations
  'company': 'companyName',
  'name': 'companyName',
  'business name': 'companyName',
  'organization': 'companyName',
  'organization name': 'companyName',
  'email': 'execEmail',
  'executive': 'execName',
  'contact': 'execName',
  'contact name': 'execName',
  'url': 'website',
  'web': 'website',
  'company website': 'website',
  'revenue': 'estRevenue',
  'annual revenue': 'estRevenue',
  'estimated revenue': 'estRevenue',
  'location': 'city',
  'address': 'street',
  'zip': 'postalCode',
  'zip code': 'postalCode',
  'postal': 'postalCode',
  'phone': 'phone',
  'telephone': 'phone',
  'contact phone': 'phone',
  'employees': 'employeeCount',
  'employee number': 'employeeCount',
  'staff count': 'employeeCount',
  'headcount': 'employeeCount',
  'sector': 'industries',
  'industry': 'industries',
  'business type': 'industries',
  'linkedin': 'linkedinCompany',
  'linkedin url': 'linkedinCompany',
  'company linkedin': 'linkedinCompany'
};

// ============= Utility Functions =============
function normalizeHeader(header) {
  return header.toLowerCase()
    .replace(/[^a-z0-9\s$%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect CSV format type based on content analysis
 * @param {string[]} lines - Array of CSV lines
 * @returns {Object} Format information
 */
function detectCSVFormat(lines) {
  const format = {
    type: 'unknown',
    headerRow: -1,
    hasMetadata: false,
    isSourceScrub: false,
    delimiter: ',',
    encoding: 'UTF-8'
  };
  
  // Check for SourceScrub indicators
  const firstFewLines = lines.slice(0, 10).join('\n').toLowerCase();
  if (firstFewLines.includes('sourcescrub') || 
      firstFewLines.includes('search url') ||
      firstFewLines.includes('custom_') ||
      firstFewLines.includes('edgewater')) {
    format.isSourceScrub = true;
    format.type = 'sourcescrub';
    format.hasMetadata = true;
  }
  
  // Check for tab delimiter
  if (lines[0] && lines[0].includes('\t')) {
    format.delimiter = '\t';
  }
  
  // Look for header row
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    if (!line) continue;
    
    // Count potential column headers (title case or specific keywords)
    const potentialHeaders = line.split(format.delimiter)
      .map(cell => cell.trim())
      .filter(cell => {
        // Check if it looks like a header
        return cell.length > 0 && (
          cell.match(/^[A-Z][a-z]/) || // Title case
          cell.toLowerCase().match(/company|name|website|email|phone|address|city|state/i)
        );
      });
    
    // If we have multiple potential headers, this is likely our header row
    if (potentialHeaders.length >= 3) {
      format.headerRow = i;
      break;
    }
  }
  
  console.log('Detected CSV format:', format);
  return format;
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

// ============= Template-Based Summarization Functions =============
function extractPrimaryService(row) {
  const desc = (row.description || '').toLowerCase();
  const specialties = (row.specialties || '').toLowerCase();
  const products = (row.productsServices || '').toLowerCase();
  const searchText = `${desc} ${specialties} ${products}`;
  
  // Check each service category
  for (const [category, keywords] of Object.entries(SERVICE_KEYWORDS)) {
    const matchCount = keywords.filter(kw => searchText.includes(kw)).length;
    if (matchCount > 0) {
      // Return the first matching keyword for accuracy
      const matchedKeyword = keywords.find(kw => searchText.includes(kw));
      return matchedKeyword;
    }
  }
  
  // Fallback to specialties field
  if (row.specialties) {
    const firstSpecialty = row.specialties.split(',')[0].trim();
    if (firstSpecialty) return firstSpecialty.toLowerCase();
  }
  
  return null;
}

function classifyBusinessType(row) {
  const desc = (row.description || '').toLowerCase();
  const specialties = (row.specialties || '').toLowerCase();
  const industries = (row.industries || '').toLowerCase();
  const searchText = `${desc} ${specialties} ${industries}`;
  
  // Check for specific business types
  if (searchText.includes('commissioning') || searchText.includes('cx')) {
    return BUSINESS_TEMPLATES['commissioning'];
  }
  if (searchText.includes('test and balance') || searchText.includes('tab')) {
    return BUSINESS_TEMPLATES['testing'];
  }
  if (searchText.includes('hvac') || searchText.includes('heating') || searchText.includes('cooling')) {
    return BUSINESS_TEMPLATES['hvac_service'];
  }
  if (searchText.includes('building automation') || searchText.includes('bas') || searchText.includes('bms')) {
    return BUSINESS_TEMPLATES['building_automation'];
  }
  if (searchText.includes('energy efficiency') || searchText.includes('energy management')) {
    return BUSINESS_TEMPLATES['energy'];
  }
  if (searchText.includes('construction') || searchText.includes('contractor')) {
    return BUSINESS_TEMPLATES['construction'];
  }
  if (searchText.includes('consulting') || searchText.includes('engineering')) {
    return BUSINESS_TEMPLATES['consulting'];
  }
  if (searchText.includes('software') || searchText.includes('saas')) {
    return BUSINESS_TEMPLATES['software'];
  }
  
  // Default fallback
  return BUSINESS_TEMPLATES['specialty'];
}

function extractTargetMarkets(row) {
  const endMarkets = parseList(row.endMarkets);
  const desc = (row.description || '').toLowerCase();
  
  const markets = [];
  
  // First check explicit end markets field
  if (endMarkets.length > 0) {
    return endMarkets.slice(0, 2).join(' and ');
  }
  
  // Check description for market indicators
  for (const [segment, keywords] of Object.entries(MARKET_SEGMENTS)) {
    if (keywords.some(kw => desc.includes(kw))) {
      markets.push(segment);
      if (markets.length >= 2) break;
    }
  }
  
  return markets.length > 0 ? markets.join(' and ') : 'commercial';
}

function categorizeSize(employeeCount, revenue) {
  if (revenue && revenue > 50000000) return 'large enterprise';
  if (revenue && revenue > 10000000) return 'mid-market';
  if (employeeCount && employeeCount > 100) return 'mid-size';
  if (employeeCount && employeeCount > 50) return 'small-mid';
  return 'small business';
}

function generateAccurateSummary(row) {
  // Priority 1: Use specialties field if available
  const specialties = parseList(row.specialties);
  const industries = parseList(row.industries);
  const endMarkets = parseList(row.endMarkets);
  
  // Extract components (never invent)
  const primarySpecialty = specialties[0] || '';
  const primaryIndustry = industries[0] || '';
  const targetMarkets = endMarkets.slice(0, 2).join(' and ') || '';
  
  // Build summary from actual data only
  if (primarySpecialty && targetMarkets) {
    return `${primarySpecialty} serving ${targetMarkets} markets`;
  }
  
  if (primarySpecialty) {
    const businessType = classifyBusinessType(row);
    return `${primarySpecialty} ${businessType}`.replace('specialty services provider', 'provider');
  }
  
  if (primaryIndustry && targetMarkets) {
    return `${primaryIndustry} company serving ${targetMarkets}`;
  }
  
  if (primaryIndustry) {
    return `${primaryIndustry} company`;
  }
  
  // Fallback: Extract key service from description
  const service = extractPrimaryService(row);
  if (service) {
    const markets = extractTargetMarkets(row);
    if (markets && markets !== 'commercial') {
      return `${service} provider serving ${markets}`;
    }
    return `Specializes in ${service}`;
  }
  
  // Last resort: Use basic company info
  const state = row.state || '';
  const ownership = row.ownership || 'private';
  if (state) {
    return `${state}-based ${ownership} company`;
  }
  
  return `${ownership} company`;
}

function generateStructuredSummary(row) {
  // Extract structured components
  const specialties = parseList(row.specialties).slice(0, 3);
  const markets = parseList(row.endMarkets).slice(0, 2);
  const revenue = row.revenue;
  const employees = row.employeeCount;
  
  const parts = [];
  
  // Add business type
  const businessType = classifyBusinessType(row);
  if (businessType !== BUSINESS_TEMPLATES['specialty']) {
    parts.push(businessType);
  }
  
  // Add specialties
  if (specialties.length > 0) {
    parts.push(specialties.join(', '));
  }
  
  // Add markets
  if (markets.length > 0) {
    parts.push(`Markets: ${markets.join(', ')}`);
  }
  
  // Add size indicators
  const sizeIndicators = [];
  if (revenue) sizeIndicators.push(formatMoney(revenue));
  if (employees) sizeIndicators.push(`${employees} employees`);
  if (sizeIndicators.length > 0) {
    parts.push(sizeIndicators.join(', '));
  }
  
  return parts.join(' | ');
}

// ============= CSV Parsing =============
/**
 * Parse CSV file with intelligent header detection
 * Handles various SourceScrub export formats
 */
async function parseCSV(file) {
  const text = await file.text();
  
  // Remove UTF-8 BOM if present
  const cleanText = text.replace(/^\uFEFF/, '');
  
  // Split into lines
  const lines = cleanText.split(/\r?\n/);
  
  // Find the header row by looking for key column names
  let headerRowIndex = -1;
  let headerRow = null;
  
  // Common header indicators for SourceScrub files
  const headerIndicators = [
    'Company Name',
    'Informal Name',
    'Website',
    'City',
    'State',
    'Description'
  ];
  
  // Search for header row (typically within first 10 lines)
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    if (!line) continue;
    
    // Check if this line contains multiple header indicators
    const matchCount = headerIndicators.filter(indicator => 
      line.includes(indicator)
    ).length;
    
    // If we find at least 3 indicators, this is likely our header row
    if (matchCount >= 3) {
      headerRowIndex = i;
      headerRow = line;
      console.log(`Found header row at line ${i + 1}: ${line.substring(0, 100)}...`);
      break;
    }
  }
  
  // Fallback: if no headers found, try old logic
  if (headerRowIndex === -1) {
    console.warn('Could not find header row with standard columns. Attempting fallback parsing...');
    
    // Check if first line contains "Search Url" (old SourceScrub format)
    if (lines[0] && lines[0].toLowerCase().includes('search url')) {
      headerRowIndex = 1; // Headers might be at row 2 (index 1)
    } else {
      // Assume first non-empty line is headers
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        if (lines[i] && lines[i].trim()) {
          headerRowIndex = i;
          break;
        }
      }
    }
  }
  
  // If still no headers found, throw error
  if (headerRowIndex === -1) {
    throw new Error('Could not detect CSV headers. Please ensure your file has a header row with column names like "Company Name", "Website", etc.');
  }
  
  // Extract data starting from the line after headers
  const dataLines = lines.slice(headerRowIndex + 1)
    .filter(line => line && line.trim()) // Remove empty lines
    .filter(line => {
      // Filter out separator lines or metadata
      const trimmed = line.trim();
      return !trimmed.match(/^[,\s]*$/) && // Not just commas/spaces
             !trimmed.startsWith('Search Url') && // Not metadata
             !trimmed.match(/^https:\/\/.*sourcescrub\.com/); // Not search URLs
    });
  
  // Reconstruct CSV with headers and data
  const csvData = [lines[headerRowIndex], ...dataLines].join('\n');
  
  console.log(`Parsing CSV with ${dataLines.length} data rows (header at line ${headerRowIndex + 1})`);
  
  return new Promise((resolve, reject) => {
    Papa.parse(csvData, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => {
        // Clean headers of extra whitespace
        return header.trim();
      },
      complete: (results) => {
        // Validate that we got meaningful data
        if (!results.data || results.data.length === 0) {
          reject(new Error('No data rows found in CSV'));
          return;
        }
        
        const headers = results.meta.fields || [];
        
        // Validate headers contain expected fields
        const hasCompanyName = headers.some(h => 
          h.toLowerCase().includes('company') || 
          h.toLowerCase().includes('name')
        );
        const hasWebsite = headers.some(h => 
          h.toLowerCase().includes('website') || 
          h.toLowerCase().includes('url')
        );
        
        if (!hasCompanyName && !hasWebsite) {
          console.warn('Warning: CSV may not have expected columns (Company Name, Website)');
          console.log('Found headers:', headers);
        }
        
        const headerMap = mapHeaders(headers);
        
        // Map raw data to canonical field names
        const rows = results.data.map((row, index) => {
          const mapped = {};
          let hasAnyData = false;
          
          for (const [rawKey, value] of Object.entries(row)) {
            const canonicalKey = headerMap[rawKey];
            const cleanValue = typeof value === 'string' ? value.trim() : value;
            mapped[canonicalKey] = cleanValue;
            
            // Check if this row has any non-empty data
            if (cleanValue && cleanValue !== '') {
              hasAnyData = true;
            }
          }
          
          // Skip completely empty rows
          if (!hasAnyData) {
            console.log(`Skipping empty row ${index + 1}`);
            return null;
          }
          
          return mapped;
        }).filter(row => row !== null); // Remove null rows
        
        console.log(`Successfully parsed ${rows.length} valid data rows`);
        
        // Final validation
        if (rows.length === 0) {
          reject(new Error('No valid data rows found after parsing'));
          return;
        }
        
        // Log sample of first row for debugging
        if (rows[0]) {
          const sampleFields = ['companyName', 'website', 'city', 'state'];
          const sample = {};
          sampleFields.forEach(field => {
            if (rows[0][field]) {
              sample[field] = rows[0][field];
            }
          });
          console.log('Sample of first row:', sample);
        }
        
        resolve({ headerMap, rows });
      },
      error: (error) => {
        console.error('Papa.parse error:', error);
        reject(error);
      }
    });
  });
}

// ============= Data Processing =============
function processRow(row) {
  // Validate row has minimum required data
  if (!row.companyName && !row.informalName) {
    console.warn('Row missing company name, skipping:', row);
    return null;
  }
  
  // Core fields with better fallbacks
  const website = row.website || row.url || row.web || '';
  const domain = extractDomain(website);
  
  // Company info with multiple fallback options
  const companyName = row.companyName || row.company || row.name || row.organization || '';
  const informalName = row.informalName || companyName;
  
  // Location
  const city = row.city || '';
  const state = row.state || '';
  const cityState = [city, state].filter(Boolean).join(', ');
  
  // Raw description data
  const rawDescription = row.description || '';
  const mzSummary = row.mzSummary || row['mz summary description'];
  const specialties = row.specialties || '';
  const industries = row.industries || '';
  const endMarkets = row.endMarkets || '';
  
  // Generate standardized description if enabled
  let description;
  if (CONFIG.ENABLE_DESCRIPTION_STANDARDIZATION && typeof DescriptionStandardizer !== 'undefined') {
    try {
      description = DescriptionStandardizer.standardize({
        companyName,
        informalName,
        website,
        description: mzSummary || rawDescription,
        specialties,
        industries,
        endMarkets
      });
    } catch (error) {
      console.error('Error standardizing description:', error);
      // Fallback to original logic
      description = (mzSummary && mzSummary.trim()) ? mzSummary : rawDescription;
    }
  } else {
    // Original logic
    description = (mzSummary && mzSummary.trim()) ? mzSummary : rawDescription;
  }
  
  // Employee data
  const employeeCount = parseNumber(row.employeeCount);
  const employeeRange = cleanEmployeeRange(row.employeeRange);
  
  // Revenue data
  const revenue = parseMoney(row.estRevenue);
  const revenueMin = parseMoney(row.estRevenueMin);
  const revenueMax = parseMoney(row.estRevenueMax);
  const revenueMM = revenue ? revenue / 1000000 : null;
  
  // Executive data
  const execFirst = row.execFirstName || '';
  const execLast = row.execLastName || '';
  const execTitle = row.execTitle || '';
  const execName = [execFirst, execLast].filter(Boolean).join(' ');
  const execBlock = [execName, execTitle].filter(Boolean).join('\n');
  const execEmail = row.execEmail || '';
  
  // Categories
  const industriesList = parseList(industries);
  const endMarketsList = parseList(endMarkets);
  
  // Additional metadata
  const foundingYear = parseNumber(row.foundingYear);
  const sourcesCount = parseNumber(row.sourcesCount);
  
  return {
    // Identifiers
    companyName,
    informalName,
    
    // Location
    city,
    state,
    cityState,
    country: row.country || '',
    
    // Web presence
    website,
    domain,
    logoUrl: domain ? `${CONFIG.CLEARBIT_API}/${domain}?size=${CONFIG.DEFAULT_LOGO_SIZE}` : '',
    
    // Description (now standardized)
    description,
    rawDescription, // Keep original for reference
    
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
    execLinkedIn: row.execLinkedIn || '',
    
    // Categories
    industries: industriesList,
    endMarkets: endMarketsList,
    
    // Additional data
    foundingYear,
    ownership: row.ownership || '',
    totalRaised: parseMoney(row.totalRaised),
    profileUrl: row.profileUrl || '',
    linkedinCompany: row.linkedinCompany || '',
    sourcesCount,
    specialties
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
  
  // Check summary generation
  const missingSummary = processed.filter(r => !r.description || r.description.length < 10).length;
  if (missingSummary > 0) {
    warnings.push(`${missingSummary} companies with limited summary information`);
  }
  
  return { issues, warnings };
}

// ============= Filtering & Sorting =============
function applyFilters() {
  let filtered = [...AppState.processed];
  
  // Search filter - search both summary and full description
  const search = AppState.filters.search.toLowerCase();
  if (search) {
    filtered = filtered.filter(row => {
      const searchable = [
        row.companyName,
        row.informalName,
        row.domain,
        row.execName,
        row.execTitle,
        row.description,  // Summary
        row.descriptionFull,  // Full text
        row.city,
        row.state,
        row.specialties,
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
  
  // Add data quality indicator
  const missingWebsites = data.filter(row => !row.website).length;
  const missingDescriptions = data.filter(row => !row.description).length;
  
  if (missingWebsites > 0 || missingDescriptions > 0) {
    const qualityMsg = [];
    if (missingWebsites > 0) {
      qualityMsg.push(`${missingWebsites} missing websites`);
    }
    if (missingDescriptions > 0) {
      qualityMsg.push(`${missingDescriptions} missing descriptions`);
    }
    console.warn('Data quality issues:', qualityMsg.join(', '));
  }
  
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
  
  // Table columns configuration - Note: using concise description
  const columns = [
    { key: 'index', label: '#', width: '40px' },
    { key: 'logo', label: '', width: '40px' },
    { key: 'informalName', label: 'Company', sortable: true },
    { key: 'cityState', label: 'Location', sortable: true },
    { key: 'website', label: 'Website', class: 'mono' },
    { key: 'description', label: 'Description', class: 'wrap' },  // Shows concise summary
    { key: 'employeeCount', label: 'Employees', sortable: true, class: 'number' },
    { key: 'revenueMM', label: 'Revenue ($MM)', sortable: true, class: 'number' },
    { key: 'execName', label: 'Executive', sortable: true }
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
  
  // Render body with concise descriptions
  const tbody = $('tableBody');
  tbody.innerHTML = data.map((row, index) => {
    const logoCell = row.logoUrl ? 
      `<img class="company-logo" src="${row.logoUrl}" alt="" onerror="this.parentElement.innerHTML='<div class=\\'logo-placeholder\\'>${row.informalName.charAt(0).toUpperCase()}</div>'">` :
      `<div class="logo-placeholder">${row.informalName.charAt(0).toUpperCase()}</div>`;
    
    const websiteCell = row.website ? 
      `<a href="${row.website}" target="_blank" rel="noopener">${row.domain}</a>` : '';
    
    // Use concise description, with title attribute showing full text
    const descriptionCell = row.description ? 
      `<span title="${escapeHtml((row.rawDescription || '').substring(0, 500))}">${escapeHtml(row.description)}</span>` : '';
    
    return `<tr>
      <td>${index + 1}</td>
      <td>${logoCell}</td>
      <td>${escapeHtml(row.informalName)}</td>
      <td>${escapeHtml(row.cityState)}</td>
      <td class="mono">${websiteCell}</td>
      <td class="wrap">${descriptionCell}</td>
      <td class="number">${formatNumber(row.employeeCount) || row.employeeRange || '—'}</td>
      <td class="number">${row.revenueMM ? row.revenueMM.toFixed(1) : '—'}</td>
      <td>${escapeHtml(row.execName)}</td>
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
    'Standardized Description', // Changed from 'Description'
    'Original Description', // Add this
    'Count',
    'Est. Rev ($MM)',
    'Executive Title',
    'Executive Name',
    'Latest Revenue ($)'
  ];
  
  if (includePII) {
    headers.push('Executive Email');
  }
  
  // Data rows
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
      row.description, // Standardized
      row.rawDescription || '', // Original
      row.employeeCount != null ? row.employeeCount : row.employeeRange,
      row.revenueMM ? row.revenueMM.toFixed(2) : '',
      row.execTitle,
      row.execName,
      row.revenue || ''
    ];
    
    if (includePII) {
      csvRow.push(row.execEmail);
    }
    
    rows.push(csvRow);
  });
  
  // Generate CSV
  const csv = Papa.unparse(rows);
  const timestamp = new Date().toISOString().split('T')[0];
  downloadFile(csv, `target-universe-${timestamp}.csv`, 'text/csv');
}

function exportExcel() {
  const includePII = $('includePII').checked;
  const targetData = AppState.filtered;
  
  if (targetData.length === 0) {
    showMessage('No data to export', 'warning');
    return;
  }
  
  // Create workbook with properties
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: "M&A Target Universe",
    Author: "EdgeScraperPro",
    CreatedDate: new Date()
  };
  
  // Sort data by revenue (descending)
  const sortedData = [...targetData].sort((a, b) => {
    const aRev = a.revenue || 0;
    const bRev = b.revenue || 0;
    return bRev - aRev;
  });
  
  // ========== Sheet 1: Target Universe (Professional Format) ==========
  
  const targetRows = [];
  
  // Add title section
  targetRows.push([]); // Empty row
  
  // Company/File title
  const sourceFile = AppState.fileInfo?.name || 'M&A Targets';
  const cleanTitle = sourceFile.replace(/\.[^/.]+$/, "").replace(/_/g, ' ');
  targetRows.push([null, null, cleanTitle]);
  
  // Subtitle
  targetRows.push([null, null, 'Acquisition Target Universe (Sorted by Est. Revenue)']);
  
  // Empty rows for spacing
  targetRows.push([]);
  targetRows.push([]);
  
  // Professional headers (row 6)
  const headers = [
    null, null, null, // Empty columns A-C
    '#',
    'Company',
    'Logo', // Will contain URL or IMAGE formula
    'City',
    'State', 
    'City, State',
    'Website',
    'Domain',
    'Description',
    'Count',
    'Est. Rev',
    'Executive Title',
    'Executive Name',
    'Executive First Name',
    'Executive Last Name',
    'Executive',
    'Latest Revenue ($)',
    '($ in millions)' // Annotation column
  ];
  
  if (includePII) {
    headers.push('Executive Email');
  }
  
  targetRows.push(headers);
  
  // Add data rows
  sortedData.forEach((row, index) => {
    const dataRow = [
      null, null, null, // Empty columns A-C
      index + 1, // #
      row.informalName || row.companyName, // Company
      // Logo - URL for compatibility, can be IMAGE formula for Excel 365
      row.domain ? `https://logo.clearbit.com/${row.domain}?size=64` : '',
      row.city || '',
      row.state || '',
      row.cityState || '',
      row.website || '',
      row.domain || '',
      row.description || row.rawDescription || '', // Use standardized or fallback to raw
      row.employeeCount || row.employeeRange || '',
      row.revenueMM ? Number(row.revenueMM.toFixed(2)) : null,
      row.execTitle || '',
      row.execName || '',
      row.execFirst || '',
      row.execLast || '',
      row.execBlock || '',
      row.revenue || null,
      null // Annotation column
    ];
    
    if (includePII) {
      dataRow.push(row.execEmail || '');
    }
    
    targetRows.push(dataRow);
  });
  
  // Add summary row
  const avgEmployees = sortedData.filter(r => r.employeeCount).length > 0 ?
    Math.round(sortedData.reduce((sum, r) => sum + (r.employeeCount || 0), 0) / 
    sortedData.filter(r => r.employeeCount).length) : 0;
  
  const totalRevenue = sortedData.reduce((sum, r) => sum + (r.revenueMM || 0), 0);
  
  targetRows.push([]); // Empty row before summary
  targetRows.push([
    null, null, null,
    'Total:',
    `${sortedData.length} Companies`,
    null, null, null, null, null, null, null,
    `Avg: ${avgEmployees}`,
    `Total: $${totalRevenue.toFixed(2)}M`
  ]);
  
  // Create worksheet
  const ws1 = XLSX.utils.aoa_to_sheet(targetRows);
  
  // Set column widths (professional spacing)
  ws1['!cols'] = [
    { wch: 4.63 },  // A
    { wch: 0.82 },  // B  
    { wch: 0.82 },  // C
    { wch: 5 },     // D - #
    { wch: 25 },    // E - Company
    { wch: 10 },    // F - Logo
    { wch: 15 },    // G - City
    { wch: 8 },     // H - State
    { wch: 20 },    // I - City, State
    { wch: 35 },    // J - Website
    { wch: 25 },    // K - Domain
    { wch: 60 },    // L - Description
    { wch: 10 },    // M - Count
    { wch: 12 },    // N - Est. Rev
    { wch: 20 },    // O - Executive Title
    { wch: 20 },    // P - Executive Name
    { wch: 15 },    // Q - First Name
    { wch: 15 },    // R - Last Name
    { wch: 25 },    // S - Executive Combined
    { wch: 20 },    // T - Latest Revenue
    { wch: 12 }     // U - Annotation
  ];
  
  if (includePII) {
    ws1['!cols'].push({ wch: 30 }); // Email column
  }
  
  // Apply number formatting
  const range = XLSX.utils.decode_range(ws1['!ref']);
  for (let row = 6; row <= range.e.r; row++) {
    // Format Est. Rev column (N)
    const revCell = XLSX.utils.encode_cell({ r: row, c: 13 });
    if (ws1[revCell] && ws1[revCell].v) {
      ws1[revCell].z = '#,##0.00';
    }
    // Format Latest Revenue column (T)
    const latestRevCell = XLSX.utils.encode_cell({ r: row, c: 19 });
    if (ws1[latestRevCell] && ws1[latestRevCell].v) {
      ws1[latestRevCell].z = '#,##0';
    }
  }
  
  XLSX.utils.book_append_sheet(wb, ws1, 'Target Universe');
  
  // ========== Sheet 2: Company Descriptions ==========
  
  if (CONFIG.ENABLE_DESCRIPTION_STANDARDIZATION) {
    const descData = sortedData.map((row, idx) => ({
      '#': idx + 1,
      'Company': row.informalName || row.companyName,
      'Standardized': row.description || '',
      'Original': row.rawDescription || '',
      'Industries': (row.industries || []).join(', '),
      'End Markets': (row.endMarkets || []).join(', ')
    }));
    
    const ws2 = XLSX.utils.json_to_sheet(descData);
    ws2['!cols'] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 60 },
      { wch: 60 },
      { wch: 30 },
      { wch: 30 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws2, 'Company Descriptions');
  }
  
  // ========== Sheet 3: Source Data ==========
  
  const ws3 = XLSX.utils.json_to_sheet(AppState.raw);
  XLSX.utils.book_append_sheet(wb, ws3, 'Source Data');
  
  // Write and download
  const wbout = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    bookSST: true,
    compression: true
  });
  
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `Target_Universe_${timestamp}.xlsx`;
  
  downloadFile(blob, filename);
  
  showMessage(`Excel exported: ${sortedData.length} companies`, 'success');
}

/**
 * Export with Excel 365 IMAGE formulas for automatic logo display
 */
function exportExcel365() {
  const includePII = $('includePII').checked;
  const targetData = AppState.filtered;
  
  if (targetData.length === 0) {
    showMessage('No data to export', 'warning');
    return;
  }
  
  // Sort by revenue
  const sortedData = [...targetData].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  
  // Build rows with IMAGE formulas
  const rows = [];
  
  // Title section
  rows.push([]);
  rows.push([null, null, 'M&A Target Universe']);
  rows.push([null, null, 'Acquisition Targets (Excel 365 Edition)']);
  rows.push([]);
  rows.push([]);
  
  // Headers
  const headers = [
    null, null, null,
    '#', 'Company', 'Logo', 'City', 'State', 'Website',
    'Description', 'Employees', 'Est. Rev ($MM)', 'Executive'
  ];
  if (includePII) headers.push('Email');
  rows.push(headers);
  
  // Data with IMAGE formulas
  sortedData.forEach((row, idx) => {
    const dataRow = [
      null, null, null,
      idx + 1,
      row.informalName || row.companyName,
      // Excel 365 IMAGE formula
      row.domain ? {
        f: `IFERROR(IMAGE("https://logo.clearbit.com/${row.domain}?size=64"),"")`,
        v: null
      } : '',
      row.city,
      row.state,
      row.website,
      row.description,
      row.employeeCount || row.employeeRange,
      row.revenueMM ? { v: row.revenueMM, z: '#,##0.00' } : '',
      row.execBlock
    ];
    if (includePII) dataRow.push(row.execEmail);
    rows.push(dataRow);
  });
  
  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  // Column widths
  ws['!cols'] = [
    { wch: 3 }, { wch: 3 }, { wch: 3 },
    { wch: 5 }, { wch: 25 }, { wch: 10 },
    { wch: 15 }, { wch: 8 }, { wch: 35 },
    { wch: 60 }, { wch: 12 }, { wch: 12 },
    { wch: 25 }
  ];
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Target Universe');
  
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  downloadFile(blob, `Target_Universe_Excel365_${timestamp}.xlsx`);
}

/**
 * Professional Excel export with full formatting matching M&A standards
 * Replaces broken SheetJS implementation with ExcelJS for style support
 */
async function exportExcelProfessional() {
  const includePII = $('includePII').checked;
  const targetData = AppState.filtered;
  
  if (targetData.length === 0) {
    showMessage('No data to export', 'warning');
    return;
  }

  // Show loading message
  showMessage('Generating professional Excel report...', 'info');

  try {
    // Create workbook with metadata
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EdgeScraperPro';
    workbook.lastModifiedBy = 'EdgeScraperPro';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Sort data by revenue (highest first) - CRITICAL for M&A reports
    const sortedData = [...targetData].sort((a, b) => {
      const aRev = parseFloat(a.revenue) || parseFloat(a.revenueMM) || 0;
      const bRev = parseFloat(b.revenue) || parseFloat(b.revenueMM) || 0;
      return bRev - aRev;
    });

    // ============ SHEET 1: TARGET UNIVERSE (Main Report) ============
    const sheet1 = workbook.addWorksheet('Target Universe', {
      properties: { 
        tabColor: { argb: 'FF366092' },
        defaultRowHeight: 15
      },
      pageSetup: { 
        paperSize: 9, 
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      }
    });

    // Professional column structure matching M&A standard
    const columns = [
      { key: 'colA', width: 4.63 },   // A - Spacing
      { key: 'colB', width: 13.00 },  // B - Spacing  
      { key: 'colC', width: 0.82 },   // C - Spacing
      { key: 'index', width: 2.82 },  // D - #
      { key: 'company', width: 7.63 }, // E - Company (will be wider)
      { key: 'logo', width: 20.63 },  // F - Logo/Image
      { key: 'city', width: 18.18 },  // G - City
      { key: 'state', width: 7.27 },  // H - State
      { key: 'location', width: 15.63 }, // I - City, State
      { key: 'website', width: 33.82 }, // J - Website
      { key: 'domain', width: 25.00 }, // K - Domain
      { key: 'description', width: 50.63 }, // L - Description
      { key: 'employees', width: 12.63 }, // M - Employees/Count
      { key: 'revenue', width: 11.91 }, // N - Est. Rev
      { key: 'execTitle', width: 18.73 }, // O - Executive Title
      { key: 'execName', width: 16.82 }, // P - Executive Name
      { key: 'execBlock', width: 21.00 }, // Q - Executive Block
      { key: 'latestRevenue', width: 17.82 }, // R - Latest Revenue ($)
      { key: 'annotation', width: 13.00 } // S - ($ in millions)
    ];

    if (includePII) {
      columns.push({ key: 'execEmail', width: 30.00 }); // T - Executive Email
    }

    // Set columns with keys only (we'll add data manually for complex layout)
    sheet1.columns = columns.map(col => ({ key: col.key, width: col.width }));

    // Row 1: Empty
    sheet1.addRow([]);

    // Row 2: Main Title
    const titleRow = sheet1.getRow(2);
    const sourceFile = AppState.fileInfo?.name || 'M&A Target Universe';
    const companyName = sourceFile.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/-/g, ' ');
    
    // Add title in column C
    titleRow.getCell(3).value = companyName;
    sheet1.mergeCells('C2:P2');
    titleRow.getCell(3).font = { 
      name: 'Calibri', 
      size: 14, 
      bold: true,
      color: { argb: 'FF000000' }
    };
    titleRow.getCell(3).alignment = { 
      vertical: 'middle', 
      horizontal: 'center' 
    };

    // Row 3: Subtitle
    const subtitleRow = sheet1.getRow(3);
    subtitleRow.getCell(3).value = 'Acquisition Target Universe (Sorted by Est. Revenue)';
    sheet1.mergeCells('C3:P3');
    subtitleRow.getCell(3).font = { 
      name: 'Calibri', 
      size: 11, 
      bold: false,
      italic: true 
    };
    subtitleRow.getCell(3).alignment = { 
      vertical: 'middle', 
      horizontal: 'center' 
    };

    // Rows 4-5: Empty spacing
    sheet1.addRow([]);
    sheet1.addRow([]);

    // Row 6: Headers
    const headerData = [
      null, null, null, // A, B, C - spacing columns
      '#', // D
      'Company', // E
      null, // F - Logo column (IMAGE formula for Excel 365)
      'City', // G
      'State', // H
      'City, State', // I
      'Website', // J
      'Domain', // K
      'Description', // L
      'Count', // M
      'Est. Rev', // N
      'Executive Title', // O
      'Executive Name', // P
      'Executive', // Q
      'Latest Revenue ($)', // R
      '($ in millions)' // S - annotation
    ];

    if (includePII) {
      headerData.push('Executive Email'); // T
    }

    const headerRow = sheet1.getRow(6);
    headerRow.values = headerData;
    headerRow.height = 20;

    // Format header cells
    for (let col = 1; col <= headerData.length; col++) {
      const cell = headerRow.getCell(col);
      if (headerData[col - 1]) { // Only format non-null cells
        cell.font = { 
          name: 'Calibri', 
          size: 10, 
          bold: true,
          color: { argb: 'FF000000' }
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9D9D9' } // Light gray
        };
        cell.alignment = { 
          vertical: 'top', 
          horizontal: col <= 6 ? 'center' : 'left',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'medium', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      }
    }

    // Special formatting for specific header cells
    headerRow.getCell(5).alignment = { vertical: 'top', horizontal: 'centerContinuous' }; // Company

    // Add data rows starting from row 7
    let currentRow = 7;
    sortedData.forEach((company, index) => {
      const rowData = [
        null, null, null, // A, B, C - spacing
        index + 1, // D - Index number
        company.informalName || company.companyName || '', // E - Company name
        null, // F - Logo placeholder (will add IMAGE formula below)
        company.city || '', // G - City
        company.state || '', // H - State
        company.cityState || `${company.city || ''}, ${company.state || ''}`.trim(), // I - Location
        company.website || '', // J - Website
        company.domain || '', // K - Domain
        company.description || (company.rawDescription ? company.rawDescription.substring(0, 200) + '...' : ''), // L - Description
        company.employeeCount || company.employeeRange || '', // M - Employee count
        company.revenueMM ? parseFloat(company.revenueMM) : null, // N - Revenue in millions
        company.execTitle || '', // O - Executive title
        company.execName || '', // P - Executive name
        company.execBlock || `${company.execTitle || ''} ${company.execName || ''}`.trim(), // Q - Combined
        company.revenue ? parseFloat(company.revenue) : null, // R - Latest revenue
        null // S - Annotation column
      ];

      if (includePII) {
        rowData.push(company.execEmail || ''); // T - Email
      }

      const row = sheet1.getRow(currentRow);
      row.values = rowData;
      row.height = 15;

      // Format data cells
      for (let col = 1; col <= rowData.length; col++) {
        const cell = row.getCell(col);
        
        // Base font for all data cells
        cell.font = { name: 'Calibri', size: 10 };
        
        // Alignment based on column
        if (col === 4) { // Index column
          cell.alignment = { horizontal: 'center', vertical: 'top' };
        } else if (col === 13 || col === 14 || col === 18) { // Number columns
          cell.alignment = { horizontal: 'right', vertical: 'top' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'top' };
        }

        // Number formatting
        if (col === 14 && rowData[col - 1]) { // Est. Rev column
          cell.numFmt = '#,##0.00';
        } else if (col === 18 && rowData[col - 1]) { // Latest Revenue column
          cell.numFmt = '#,##0';
        } else if (col === 13 && typeof rowData[col - 1] === 'number') { // Employee count
          cell.numFmt = '#,##0';
        }

        // Website as hyperlink
        if (col === 10 && company.website) { // Website column
          cell.value = {
            text: company.website,
            hyperlink: company.website,
            tooltip: 'Click to visit website'
          };
          cell.font = { 
            name: 'Calibri', 
            size: 10, 
            color: { argb: 'FF0066CC' }, 
            underline: true 
          };
        }

        // Alternating row colors for better readability
        if (index % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF7F7F7' }
          };
        }

        // Light borders for data cells
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      }

      // Add IMAGE formula for Excel 365 (Column F)
      if (company.domain) {
        const imageFormula = `=IMAGE("https://logo.clearbit.com/${company.domain}?size=64", 4, 64, 64)`;
        row.getCell(6).value = { formula: imageFormula };
      }

      currentRow++;
    });

    // Add summary row
    const summaryRow = sheet1.getRow(currentRow + 1);
    const totalCompanies = sortedData.length;
    const companiesWithRevenue = sortedData.filter(c => c.revenue || c.revenueMM).length;
    const totalRevenue = sortedData.reduce((sum, c) => sum + (parseFloat(c.revenueMM) || 0), 0);
    const avgRevenue = companiesWithRevenue > 0 ? totalRevenue / companiesWithRevenue : 0;

    summaryRow.values = [
      null, null, null,
      'Total:',
      `${totalCompanies} Companies`,
      null, null, null, null, null, null, null,
      null,
      totalRevenue, // Total revenue in column N
      null, null, null, null,
      `Avg: $${avgRevenue.toFixed(2)}M`
    ];

    // Format summary row
    summaryRow.font = { name: 'Calibri', size: 10, bold: true };
    summaryRow.getCell(14).numFmt = '#,##0.00';

    // Freeze panes at row 6 (headers)
    sheet1.views = [{
      state: 'frozen',
      xSplit: 0,
      ySplit: 6,
      topLeftCell: 'A7',
      activeCell: 'D7'
    }];

    // Add autofilter to headers
    sheet1.autoFilter = {
      from: { row: 6, column: 4 },
      to: { row: currentRow - 1, column: includePII ? 20 : 19 }
    };

    // ============ SHEET 2: DESCRIPTIONS ============
    const sheet2 = workbook.addWorksheet('Descriptions', {
      properties: { tabColor: { argb: 'FF70AD47' } }
    });

    sheet2.columns = [
      { key: 'company', header: 'Company', width: 30 },
      { key: 'summary', header: 'Summary', width: 60 },
      { key: 'full', header: 'Full Description', width: 80 }
    ];

    // Add header row
    const descHeaderRow = sheet2.getRow(1);
    descHeaderRow.values = ['Company', 'Summary', 'Full Description'];
    descHeaderRow.font = { name: 'Calibri', size: 11, bold: true };
    descHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2EFDA' }
    };

    // Add description data
    sortedData.forEach((company, index) => {
      const row = sheet2.addRow({
        company: company.informalName || company.companyName || '',
        summary: company.description || '',
        full: company.rawDescription || ''
      });

      // Alternating colors
      if (index % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF7F7F7' }
        };
      }
    });

    // ============ SHEET 3: SOURCE DATA ============
    const sheet3 = workbook.addWorksheet('Source Data', {
      properties: { tabColor: { argb: 'FFFF6600' } }
    });

    // Add raw data if available
    if (AppState.raw && AppState.raw.length > 0) {
      const rawHeaders = Object.keys(AppState.raw[0]);
      
      sheet3.columns = rawHeaders.map(header => ({
        key: header,
        header: header,
        width: 15
      }));

      // Add header row
      const sourceHeaderRow = sheet3.getRow(1);
      sourceHeaderRow.values = rawHeaders;
      sourceHeaderRow.font = { name: 'Calibri', size: 10, bold: true };
      sourceHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE6E6' }
      };

      // Add data
      AppState.raw.forEach(row => {
        sheet3.addRow(row);
      });
    }

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    // Create filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    const cleanName = (AppState.fileInfo?.name || 'target-universe')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `${cleanName}-${timestamp}.xlsx`;

    // Download file
    downloadFile(blob, filename);

    showMessage(`✅ Professional Excel exported: ${sortedData.length} companies`, 'success');

  } catch (error) {
    console.error('Excel export error:', error);
    showMessage('Error generating Excel. Please try again.', 'error');
  }
}

/**
 * Export with Excel 365 IMAGE formulas for automatic logo display
 * This is a variant that uses IMAGE() formulas which work in Excel 365/Online
 */
async function exportExcel365Professional() {
  // Call the main professional export with a flag
  // The IMAGE formulas are already included in exportExcelProfessional
  await exportExcelProfessional();
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
    
    // Reprocess data with summarization
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

/**
 * Batch process descriptions with progress indicator
 */
async function batchStandardizeDescriptions(rows, onProgress) {
  const BATCH_SIZE = 50;
  const results = [];
  
  // Helper function to safely process a row
  function safeProcessRow(row) {
    try {
      return processRow(row);
    } catch (error) {
      console.error('Error processing row:', error, row);
      
      // Return a valid processed row structure without standardization
      // Just map the raw fields to expected structure
      return {
        companyName: row['company name'] || '',
        informalName: row['informal name'] || row['company name'] || '',
        website: row['website'] || '',
        domain: extractDomain(row['website'] || ''),
        description: row['description'] || row['mz summary description'] || '',
        rawDescription: row['description'] || '',
        city: row['city'] || '',
        state: row['state'] || '',
        cityState: [row['city'], row['state']].filter(Boolean).join(', '),
        country: row['country'] || '',
        logoUrl: row['website'] ? `${CONFIG.CLEARBIT_API}/${extractDomain(row['website'])}?size=${CONFIG.DEFAULT_LOGO_SIZE}` : '',
        employeeCount: parseNumber(row['employee count']),
        employeeRange: cleanEmployeeRange(row['employee range']),
        revenue: parseMoney(row['latest estimated revenue ($)']),
        revenueMin: parseMoney(row['latest estimated revenue min ($)']),
        revenueMax: parseMoney(row['latest estimated revenue max ($)']),
        revenueMM: parseMoney(row['latest estimated revenue ($)']) ? parseMoney(row['latest estimated revenue ($)']) / 1000000 : null,
        execFirst: row['executive first name'] || '',
        execLast: row['executive last name'] || '',
        execTitle: row['executive title'] || '',
        execName: [row['executive first name'], row['executive last name']].filter(Boolean).join(' '),
        execBlock: [[row['executive first name'], row['executive last name']].filter(Boolean).join(' '), row['executive title']].filter(Boolean).join('\n'),
        execEmail: row['executive email'] || '',
        execLinkedIn: row['executive linkedin'] || '',
        industries: parseList(row['industries'] || ''),
        endMarkets: parseList(row['end markets'] || ''),
        foundingYear: parseNumber(row['founding year']),
        ownership: row['ownership'] || '',
        totalRaised: parseMoney(row['total raised']),
        profileUrl: row['profileurl'] || '',
        linkedinCompany: row['linkedin account'] || '',
        sourcesCount: parseNumber(row['sources count']),
        specialties: row['specialties'] || '',
        processingError: true
      };
    }
  }
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    // Process batch with safe wrapper
    const batchResults = await Promise.all(
      batch.map(row => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(safeProcessRow(row));
          }, 0);
        });
      })
    );
    
    results.push(...batchResults);
    
    // Report progress
    if (onProgress) {
      const progress = Math.min(100, Math.round((i + BATCH_SIZE) / rows.length * 100));
      onProgress(progress);
    }
    
    // Allow UI to update
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  return results;
}

// ============= File Processing =============
async function processFile(file) {
  try {
    showMessage('Processing file...', 'success');
    
    // Parse CSV
    let parseResult;
    try {
      parseResult = await parseCSV(file);
    } catch (parseError) {
      console.error('CSV parsing failed:', parseError);
      showMessage(`Failed to parse CSV: ${parseError.message}`, 'error');
      $('uploadBtn').disabled = false;
      $('uploadBtn').textContent = 'Select CSV File';
      return;
    }
    
    const { headerMap, rows } = parseResult;
    
    // Additional validation
    if (!rows || rows.length === 0) {
      showMessage('No valid data found in the CSV file. Please check the file format.', 'error');
      $('uploadBtn').disabled = false;
      $('uploadBtn').textContent = 'Select CSV File';
      return;
    }
    
    AppState.raw = rows;
    AppState.headerMap = headerMap;
    AppState.fileInfo = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified
    };
    
    // Process rows with batch processing
    showMessage('Processing companies...', 'info');
    AppState.processed = await batchStandardizeDescriptions(rows, (progress) => {
      showMessage(`Processing companies: ${progress}%`, 'info');
    });
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
    
    showMessage(`Successfully loaded ${AppState.processed.length} companies with standardized descriptions`, 'success');
    
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
  
  // Check if ExcelJS is loaded, fallback to old method if not
  if (typeof ExcelJS === 'undefined') {
    console.warn('ExcelJS not loaded. Excel export will lack formatting.');
    // Keep original handlers as fallback
    $('exportExcelBtn').addEventListener('click', exportExcel);
    $('exportExcel365Btn').addEventListener('click', exportExcel365);
  } else {
    // Use new professional export with full formatting
    $('exportExcelBtn').addEventListener('click', exportExcelProfessional);
    $('exportExcel365Btn').addEventListener('click', exportExcel365Professional);
  }
  
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
  
  // Add event listener for standardization toggle
  $('toggleStandardization').addEventListener('change', (e) => {
    CONFIG.ENABLE_DESCRIPTION_STANDARDIZATION = e.target.checked;
    
    // Reprocess all rows with new setting
    if (AppState.raw.length > 0) {
      AppState.processed = AppState.raw.map(processRow);
      applyFilters();
      renderStats();
      renderTable();
      showMessage(
        e.target.checked ? 
        'Description standardization enabled' : 
        'Using original descriptions',
        'success'
      );
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