#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * 
 * Runs all tests and generates detailed reports
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testSuites = [
  'unified-http-client.test.js',
  'url-normalizer.test.js',
  'extractors.test.js',
  'integration.test.js',
];

const testFixtures = [
  'test-urls.json',
];

async function runTests() {
  console.log('🧪 Starting comprehensive test suite...\n');

  const results = {
    startTime: new Date().toISOString(),
    suites: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    },
  };

  // Check if fixtures exist
  console.log('📁 Checking test fixtures...');
  for (const fixture of testFixtures) {
    const fixturePath = path.join(__dirname, '..', 'fixtures', fixture);
    if (!fs.existsSync(fixturePath)) {
      console.error(`❌ Missing fixture: ${fixture}`);
      process.exit(1);
    }
    console.log(`✅ Found fixture: ${fixture}`);
  }

  // Run each test suite
  for (const suite of testSuites) {
    console.log(`\n🔍 Running ${suite}...`);
    
    try {
      const startTime = Date.now();
      const output = execSync(`npm test -- ${suite}`, { 
        encoding: 'utf8',
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
      });
      const endTime = Date.now();
      
      const suiteResult = {
        name: suite,
        status: 'passed',
        duration: endTime - startTime,
        output: output,
        timestamp: new Date().toISOString(),
      };

      results.suites.push(suiteResult);
      results.summary.total++;
      results.summary.passed++;
      
      console.log(`✅ ${suite} passed (${suiteResult.duration}ms)`);
      
    } catch (error) {
      const suiteResult = {
        name: suite,
        status: 'failed',
        duration: 0,
        output: error.stdout || error.message,
        error: error.stderr || error.message,
        timestamp: new Date().toISOString(),
      };

      results.suites.push(suiteResult);
      results.summary.total++;
      results.summary.failed++;
      
      console.log(`❌ ${suite} failed`);
      console.log(`   Error: ${error.message}`);
    }
  }

  // Generate test report
  results.endTime = new Date().toISOString();
  results.duration = new Date(results.endTime) - new Date(results.startTime);

  console.log('\n📊 Test Summary:');
  console.log(`   Total: ${results.summary.total}`);
  console.log(`   Passed: ${results.summary.passed}`);
  console.log(`   Failed: ${results.summary.failed}`);
  console.log(`   Duration: ${results.duration}ms`);

  // Save detailed report
  const reportPath = path.join(__dirname, '..', 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  // Generate HTML report
  generateHtmlReport(results);

  // Exit with appropriate code
  if (results.summary.failed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

function generateHtmlReport(results) {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Report - ${new Date().toLocaleDateString()}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e8f4f8; padding: 15px; border-radius: 5px; text-align: center; }
        .metric.passed { background: #d4edda; }
        .metric.failed { background: #f8d7da; }
        .suite { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .suite.passed { border-left: 5px solid #28a745; }
        .suite.failed { border-left: 5px solid #dc3545; }
        .output { background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; white-space: pre-wrap; }
        .error { background: #f8d7da; padding: 10px; border-radius: 3px; font-family: monospace; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Report</h1>
        <p>Generated: ${results.startTime}</p>
        <p>Duration: ${results.duration}ms</p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <h3>Total</h3>
            <p>${results.summary.total}</p>
        </div>
        <div class="metric passed">
            <h3>Passed</h3>
            <p>${results.summary.passed}</p>
        </div>
        <div class="metric failed">
            <h3>Failed</h3>
            <p>${results.summary.failed}</p>
        </div>
    </div>
    
    ${results.suites.map(suite => `
        <div class="suite ${suite.status}">
            <h3>${suite.name}</h3>
            <p>Status: ${suite.status.toUpperCase()}</p>
            <p>Duration: ${suite.duration}ms</p>
            ${suite.output ? `<div class="output">${suite.output}</div>` : ''}
            ${suite.error ? `<div class="error">${suite.error}</div>` : ''}
        </div>
    `).join('')}
</body>
</html>`;

  const htmlPath = path.join(__dirname, '..', 'test-report.html');
  fs.writeFileSync(htmlPath, html);
  console.log(`📄 HTML report saved to: ${htmlPath}`);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});