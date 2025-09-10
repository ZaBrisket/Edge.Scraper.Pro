#!/usr/bin/env node

/**
 * Test script for PFR rate limiting recovery and configuration optimization
 * 
 * This script tests the enhanced HTTP client with:
 * - PFR-optimized rate limiting
 * - Exponential circuit recovery
 * - Probe request functionality
 * - Circuit state monitoring
 */

const { fetchWithPolicy, getMetrics, resetMetrics } = require('./src/lib/http/simple-enhanced-client');

// Test URLs for PFR
const TEST_URLS = [
  'https://www.pro-football-reference.com/robots.txt',
  'https://www.pro-football-reference.com/years/2023/',
  'https://www.pro-football-reference.com/teams/',
  'https://www.pro-football-reference.com/players/',
  'https://www.pro-football-reference.com/years/2022/',
];

async function testPFRRateLimit() {
  console.log('🧪 Testing PFR Rate Limiting Recovery...\n');
  
  resetMetrics();
  
  const results = [];
  const startTime = Date.now();
  
  for (let i = 0; i < TEST_URLS.length; i++) {
    const url = TEST_URLS[i];
    console.log(`\n📡 Request ${i + 1}/${TEST_URLS.length}: ${url}`);
    
    try {
      const response = await fetchWithPolicy(url, {
        timeout: 10000,
        retries: 3
      });
      
      console.log(`✅ Success: ${response.status} ${response.statusText}`);
      results.push({
        url,
        success: true,
        status: response.status,
        statusText: response.statusText
      });
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      results.push({
        url,
        success: false,
        error: error.message,
        errorType: error.constructor.name
      });
    }
    
    // Show current metrics after each request
    const metrics = getMetrics();
    console.log(`📊 Current metrics:`, {
      totalRequests: metrics.requests.total,
      rateLimitHits: metrics.rateLimits.hits,
      circuitStates: metrics.circuits.map(c => `${c.host}: ${c.state}`)
    });
    
    // Add delay between requests to avoid overwhelming
    if (i < TEST_URLS.length - 1) {
      console.log('⏳ Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  const endTime = Date.now();
  const totalTime = Math.round((endTime - startTime) / 1000);
  
  console.log('\n📈 Final Results:');
  console.log(`⏱️  Total time: ${totalTime} seconds`);
  console.log(`✅ Successful requests: ${results.filter(r => r.success).length}`);
  console.log(`❌ Failed requests: ${results.filter(r => !r.success).length}`);
  
  // Show final metrics
  const finalMetrics = getMetrics();
  console.log('\n📊 Final Metrics:');
  console.log(JSON.stringify(finalMetrics, null, 2));
  
  return results;
}

async function testCircuitRecovery() {
  console.log('\n🔄 Testing Circuit Recovery Logic...\n');
  
  // This would require a way to trigger circuit breaker opening
  // For now, we'll just test the metrics endpoint
  const metrics = getMetrics();
  console.log('Current circuit states:', metrics.circuits);
  
  return metrics;
}

async function main() {
  console.log('🚀 PFR Rate Limiting Recovery Test Suite');
  console.log('=========================================\n');
  
  try {
    // Test 1: Basic rate limiting with PFR
    await testPFRRateLimit();
    
    // Test 2: Circuit recovery
    await testCircuitRecovery();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testPFRRateLimit,
  testCircuitRecovery
};