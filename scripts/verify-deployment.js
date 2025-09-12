#!/usr/bin/env node

/**
 * Deployment Verification Script
 * 
 * Verifies that the deployment is working correctly
 * and all components are properly configured
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.NETLIFY_URL || 'https://your-app.netlify.app';

const tests = [
  {
    name: 'Health Check',
    url: `${BASE_URL}/api/health`,
    method: 'GET',
    expectedStatus: 200,
  },
  {
    name: 'CORS Headers',
    url: `${BASE_URL}/api/health`,
    method: 'OPTIONS',
    expectedStatus: 200,
    checkHeaders: ['access-control-allow-origin', 'access-control-allow-methods'],
  },
  {
    name: 'Security Headers',
    url: `${BASE_URL}/`,
    method: 'GET',
    expectedStatus: 200,
    checkHeaders: ['x-frame-options', 'x-content-type-options', 'x-xss-protection'],
  },
  {
    name: 'Static Assets',
    url: `${BASE_URL}/_next/static/`,
    method: 'GET',
    expectedStatus: 200,
    checkHeaders: ['cache-control'],
  },
];

async function makeRequest(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'User-Agent': 'Deployment-Verifier/1.0',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runTest(test) {
  try {
    console.log(`🔍 Testing ${test.name}...`);
    
    const response = await makeRequest(test.url, test.method);
    
    // Check status code
    if (response.statusCode !== test.expectedStatus) {
      console.log(`❌ ${test.name}: Expected status ${test.expectedStatus}, got ${response.statusCode}`);
      return false;
    }

    // Check headers
    if (test.checkHeaders) {
      for (const header of test.checkHeaders) {
        if (!response.headers[header]) {
          console.log(`❌ ${test.name}: Missing header ${header}`);
          return false;
        }
      }
    }

    console.log(`✅ ${test.name}: Passed`);
    return true;

  } catch (error) {
    console.log(`❌ ${test.name}: ${error.message}`);
    return false;
  }
}

async function verifyDeployment() {
  console.log('🚀 Starting deployment verification...\n');
  console.log(`📍 Testing against: ${BASE_URL}\n`);

  const results = [];
  
  for (const test of tests) {
    const passed = await runTest(test);
    results.push({ ...test, passed });
  }

  console.log('\n📊 Verification Summary:');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`   Total tests: ${total}`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${total - passed}`);
  console.log(`   Success rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (passed === total) {
    console.log('\n✅ All tests passed! Deployment is working correctly.');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please check the deployment.');
    process.exit(1);
  }
}

// Run verification
verifyDeployment().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});