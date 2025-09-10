/**
 * Test script for PFR URL Validator
 * Tests validation logic, duplicate detection, and reporting
 */

const { PFRValidator, VALIDATION_CATEGORIES } = require('./src/lib/pfr-validator');

console.log('=== PFR URL Validator Test Suite ===\n');

// Initialize validator
const validator = new PFRValidator();

// Test cases
const testUrls = [
  // Valid PFR URLs
  'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
  'https://www.pro-football-reference.com/players/B/BradTo00.htm',
  'https://pro-football-reference.com/players/A/AlleJo02.htm',
  
  // Duplicate (with tracking params)
  'https://www.pro-football-reference.com/players/M/MahoPa00.htm?utm_source=test',
  
  // Invalid slug format
  'https://www.pro-football-reference.com/players/M/Invalid00.htm',
  'https://www.pro-football-reference.com/players/M/Maho00.htm',
  
  // Non-player pages
  'https://www.pro-football-reference.com/teams/kan/2023.htm',
  'https://www.pro-football-reference.com/years/2023/',
  'https://www.pro-football-reference.com/coaches/ReidAn0.htm',
  
  // Wrong domain
  'https://www.espn.com/nfl/player/_/id/3139477/patrick-mahomes',
  'https://www.nfl.com/players/patrick-mahomes/',
  
  // Malformed URLs
  'not-a-url',
  'ftp://pro-football-reference.com/players/M/MahoPa00.htm',
  'https://pro-football-reference.com/players/M/MahoPa00',
  
  // Other sports reference sites
  'https://www.basketball-reference.com/players/j/jamesle01.html',
  'https://www.baseball-reference.com/players/t/troutmi01.shtml',
];

// Test individual URL validation
console.log('1. Individual URL Validation Tests:\n');

testUrls.forEach(url => {
  const result = validator.validateURL(url);
  console.log(`URL: ${url}`);
  console.log(`  Valid: ${result.isValid}`);
  console.log(`  Category: ${result.category}`);
  if (result.error) console.log(`  Error: ${result.error}`);
  if (result.normalized) console.log(`  Normalized: ${result.normalized}`);
  console.log('');
});

// Test batch validation
console.log('\n2. Batch Validation Test:\n');

const batchResult = validator.validateBatch(testUrls);
console.log(`Total URLs: ${batchResult.total}`);
console.log(`Valid: ${batchResult.summary.validCount}`);
console.log(`Invalid: ${batchResult.summary.invalidCount}`);
console.log(`Duplicates: ${batchResult.summary.duplicateCount}`);

// Test report generation
console.log('\n3. Validation Report:\n');
console.log(validator.generateReport(batchResult));

// Test edge cases
console.log('\n4. Edge Case Tests:\n');

const edgeCases = [
  '',  // Empty string
  'https://www.pro-football-reference.com/',  // Homepage
  'https://www.pro-football-reference.com/players/',  // Players index
  'https://www.pro-football-reference.com/players/M/',  // Player letter index
  'https://www.pro-football-reference.com/players/m/mahopa00.htm',  // Lowercase letter
  'HTTPS://WWW.PRO-FOOTBALL-REFERENCE.COM/PLAYERS/M/MAHOPA00.HTM',  // Uppercase
];

edgeCases.forEach(url => {
  const result = validator.validateURL(url);
  console.log(`Edge case: "${url}"`);
  console.log(`  Category: ${result.category}`);
  console.log('');
});

// Performance test
console.log('\n5. Performance Test:\n');

const startTime = Date.now();
const largeTestSet = [];

// Generate 1000 URLs (mix of valid and invalid)
for (let i = 0; i < 100; i++) {
  largeTestSet.push(`https://www.pro-football-reference.com/players/M/MahoPa${String(i).padStart(2, '0')}.htm`);
  largeTestSet.push(`https://www.espn.com/player/${i}`);
  largeTestSet.push(`https://www.pro-football-reference.com/teams/test${i}.htm`);
}

// Add duplicates
for (let i = 0; i < 50; i++) {
  largeTestSet.push('https://www.pro-football-reference.com/players/M/MahoPa00.htm');
}

const largeBatchResult = validator.validateBatch(largeTestSet);
const endTime = Date.now();

console.log(`Validated ${largeTestSet.length} URLs in ${endTime - startTime}ms`);
console.log(`Valid: ${largeBatchResult.summary.validCount}`);
console.log(`Invalid: ${largeBatchResult.summary.invalidCount}`);
console.log(`Duplicates: ${largeBatchResult.summary.duplicateCount}`);

console.log('\n=== Test Suite Complete ===');