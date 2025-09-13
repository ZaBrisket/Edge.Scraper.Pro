const MAExtractor = require('../src/lib/extractors/ma-extractor');
const MAUrlFinder = require('../src/lib/discovery/ma-url-finder');

console.log('Running M&A Scraping Tests...\n');

const extractor = new MAExtractor();
const urlFinder = new MAUrlFinder();

// Test 1: Deal Value Extraction
console.log('Test 1: Deal Value Extraction');
const testTexts = [
  'Microsoft to acquire Activision Blizzard for $68.7 billion',
  'The deal is valued at approximately $3.5 million',
  'Purchase price of USD 500 million'
];

testTexts.forEach(text => {
  const value = extractor.extractDealValue(text);
  console.log(`  Input: "${text}"`);
  console.log(`  Result:`, value);
});

// Test 2: Company Extraction
console.log('\nTest 2: Company Extraction');
const companyText = 'Microsoft Corporation announced today that it will acquire Activision Blizzard Inc. in an all-cash transaction.';
const companies = extractor.extractCompanies(companyText);
console.log('  Found companies:', companies);

// Test 3: Transaction Type
console.log('\nTest 3: Transaction Type Detection');
const transactionTexts = [
  'Company A merges with Company B',
  'XYZ Corp acquires ABC Ltd',
  'Firm divests non-core assets',
  'Strategic joint venture announced'
];

transactionTexts.forEach(text => {
  const type = extractor.extractTransactionType(text);
  console.log(`  "${text}" -> ${type}`);
});

// Test 4: Date Extraction
console.log('\nTest 4: Date Extraction');
const dateText = 'The transaction was announced on January 15, 2024 and is expected to close by 12/31/2024.';
const dates = extractor.extractDates(dateText);
console.log('  Found dates:', dates);

// Test 5: URL Discovery
console.log('\nTest 5: URL Discovery (checking configuration)');
console.log('  RSS feeds configured for:', Object.keys(urlFinder.rssFeedUrls));
console.log('  M&A keywords:', urlFinder.maKeywords.slice(0, 5).join(', '), '...');

console.log('\n✅ All tests completed!');