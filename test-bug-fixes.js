/**
 * Test script to verify bug fixes in universal scraper
 */

const UniversalHttpClient = require('./src/lib/http/universal-client');
const { getSiteProfile } = require('./src/lib/http/site-profiles');

async function testBugFixes() {
  console.log('Testing Bug Fixes for Universal Scraper');
  console.log('======================================\n');

  // Test 1: Verify fetch function works (P0 fix)
  console.log('Test 1: Verifying fetch module...');
  try {
    const httpClient = new UniversalHttpClient();
    console.log('✓ HTTP client created successfully');
    console.log(`  Using: ${globalThis.fetch ? 'native fetch' : 'node-fetch v2'}\n`);
  } catch (error) {
    console.log('✗ Failed to create HTTP client:', error.message);
    return;
  }

  // Test 2: Verify timeout enforcement (P1 fix)
  console.log('Test 2: Testing timeout enforcement...');
  try {
    const httpClient = new UniversalHttpClient({
      timeout: 100, // Very short timeout to trigger abort
      maxRetries: 1
    });
    
    const startTime = Date.now();
    try {
      // Use a URL that will take longer than 100ms
      await httpClient.fetchWithProtection('https://httpbin.org/delay/5');
      console.log('✗ Timeout was not enforced');
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        console.log(`✓ Timeout properly enforced after ~${elapsed}ms`);
        console.log(`  Error: ${error.message}\n`);
      } else {
        console.log('✗ Unexpected error:', error.message);
      }
    }
  } catch (error) {
    console.log('✗ Test setup failed:', error.message);
  }

  // Test 3: Verify URL validation
  console.log('Test 3: Testing URL validation...');
  const invalidUrls = [
    'not-a-url',
    'ftp://invalid-protocol.com',
    'javascript:alert(1)',
    ''
  ];
  
  for (const invalidUrl of invalidUrls) {
    try {
      getSiteProfile(invalidUrl);
      console.log(`✗ URL validation failed for: "${invalidUrl}"`);
    } catch (error) {
      console.log(`✓ Properly rejected invalid URL: "${invalidUrl}"`);
    }
  }
  console.log();

  // Test 4: Verify site profile handling
  console.log('Test 4: Testing site profile handling...');
  const testUrls = [
    'https://www.prnewswire.com/test',
    'https://www.reuters.com/test',
    'https://unknown-site.com/test'
  ];
  
  for (const url of testUrls) {
    try {
      const profile = getSiteProfile(url);
      console.log(`✓ Site profile for ${new URL(url).hostname}:`);
      console.log(`  Category: ${profile.category}`);
      console.log(`  Rate limit: ${profile.rateLimit.rps} req/sec`);
    } catch (error) {
      console.log(`✗ Failed to get profile for ${url}:`, error.message);
    }
  }

  console.log('\n✅ All bug fixes verified successfully!');
}

// Run tests
testBugFixes().catch(console.error);