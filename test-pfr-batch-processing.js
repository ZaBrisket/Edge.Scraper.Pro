#!/usr/bin/env node

/**
 * PFR Batch Processing Enhancement Test Suite
 * Tests URL validation, duplicate handling, timeout unification, and batch processing
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

// Import the new modules
const { PFRUrlValidator, VALIDATION_ERROR_TYPES } = require('./src/lib/pfr-validation');
const { PFRBatchProcessor, PROCESSING_STATES } = require('./src/lib/pfr-batch-processor');

// Test configuration
const TEST_CONFIG = {
  performanceThreshold: 5000, // 5 seconds for validation
  memoryThresholdMB: 100, // 100MB memory threshold
  validationAccuracyThreshold: 95, // 95% accuracy threshold
  processingOverheadThreshold: 5 // 5% overhead threshold
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

function logTest(testName, status, message, duration = null, metrics = null) {
  const result = {
    test: testName,
    status,
    message,
    duration: duration ? `${duration.toFixed(2)}ms` : null,
    metrics,
    timestamp: new Date().toISOString()
  };
  
  testResults.details.push(result);
  
  if (status === 'PASS') {
    testResults.passed++;
    console.log(`✅ ${testName}: ${message}${duration ? ` (${duration.toFixed(2)}ms)` : ''}`);
  } else if (status === 'FAIL') {
    testResults.failed++;
    console.log(`❌ ${testName}: ${message}${duration ? ` (${duration.toFixed(2)}ms)` : ''}`);
  } else {
    testResults.warnings++;
    console.log(`⚠️  ${testName}: ${message}${duration ? ` (${duration.toFixed(2)}ms)` : ''}`);
  }
}

// Memory usage monitoring
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024) // MB
  };
}

// Test data
const TEST_URLS = {
  valid: [
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    'https://pro-football-reference.com/players/A/AlleJo02.htm',
    'https://www.pro-football-reference.com/players/H/HenrDe00.htm',
    'https://pro-football-reference.com/players/K/KelcTr00.htm',
    'https://www.pro-football-reference.com/players/B/BradTo00.htm'
  ],
  invalid: [
    'https://www.pro-football-reference.com/teams/kan/2023.htm',
    'https://www.pro-football-reference.com/coaches/ReidAn0.htm',
    'https://www.pro-football-reference.com/leaders/pass_yds_career.htm',
    'https://www.pro-football-reference.com/play-index/',
    'https://www.pro-football-reference.com/years/2023/',
    'https://www.pro-football-reference.com/draft/2023.htm',
    'https://www.pro-football-reference.com/awards/',
    'https://www.pro-football-reference.com/hof/',
    'https://www.pro-football-reference.com/friv/',
    'https://www.pro-football-reference.com/misc/',
    'https://www.pro-football-reference.com/index.htm',
    'https://www.pro-football-reference.com/',
    'https://www.pro-football-reference.com/players/test.jpg',
    'https://example.com/not-pfr',
    'invalid-url',
    '',
    null
  ],
  duplicates: [
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    'https://pro-football-reference.com/players/M/MahoPa00.htm', // Same player, different protocol
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm' // Exact duplicate
  ],
  malformed: [
    'not-a-url',
    'ftp://pro-football-reference.com/players/test.htm',
    'https://pro-football-reference.com/players/',
    'https://pro-football-reference.com/players/ab.htm', // Too short
    'https://pro-football-reference.com/players/verylongslugname.htm' // Too long
  ]
};

// Test 1: URL Validation Accuracy
async function testURLValidationAccuracy() {
  const startTime = performance.now();
  const validator = new PFRUrlValidator();
  
  try {
    let correctValidations = 0;
    let totalValidations = 0;
    
    // Test valid URLs
    for (const url of TEST_URLS.valid) {
      const result = validator.validateUrl(url);
      totalValidations++;
      if (result.isValid) {
        correctValidations++;
      } else {
        console.log(`Valid URL incorrectly rejected: ${url} - ${result.errorMessage}`);
      }
    }
    
    // Test invalid URLs
    for (const url of TEST_URLS.invalid) {
      const result = validator.validateUrl(url);
      totalValidations++;
      if (!result.isValid) {
        correctValidations++;
      } else {
        console.log(`Invalid URL incorrectly accepted: ${url}`);
      }
    }
    
    const accuracy = (correctValidations / totalValidations) * 100;
    const duration = performance.now() - startTime;
    
    if (accuracy >= TEST_CONFIG.validationAccuracyThreshold) {
      logTest('URL Validation Accuracy', 'PASS', 
        `Accuracy: ${accuracy.toFixed(2)}% (${correctValidations}/${totalValidations})`, duration);
    } else {
      logTest('URL Validation Accuracy', 'FAIL', 
        `Accuracy: ${accuracy.toFixed(2)}% below threshold of ${TEST_CONFIG.validationAccuracyThreshold}%`, duration);
    }
    
  } catch (error) {
    logTest('URL Validation Accuracy', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 2: Duplicate Detection
async function testDuplicateDetection() {
  const startTime = performance.now();
  const validator = new PFRUrlValidator();
  
  try {
    const result = validator.validateBatch(TEST_URLS.duplicates, {
      checkDuplicates: true,
      generateReport: true
    });
    
    const duration = performance.now() - startTime;
    
    
    // Should detect 2 duplicates (URLs 2 and 3 are duplicates of URL 1 after normalization)
    const duplicateCount = result.summary.duplicates;
    const expectedDuplicates = 2;
    
    if (duplicateCount === expectedDuplicates) {
      logTest('Duplicate Detection', 'PASS', 
        `Correctly detected ${duplicateCount} duplicates`, duration);
    } else {
      logTest('Duplicate Detection', 'FAIL', 
        `Expected ${expectedDuplicates} duplicates, got ${duplicateCount}`, duration);
    }
    
    // Test that report includes duplicate information
    if (result.report && result.report.duplicateUrls.length === duplicateCount) {
      logTest('Duplicate Reporting', 'PASS', 
        `Report correctly includes ${duplicateCount} duplicate URLs`);
    } else {
      logTest('Duplicate Reporting', 'FAIL', 
        `Report missing or incorrect duplicate information`);
    }
    
  } catch (error) {
    logTest('Duplicate Detection', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 3: Error Categorization
async function testErrorCategorization() {
  const startTime = performance.now();
  const validator = new PFRUrlValidator();
  
  try {
    const testCases = [
      { url: 'https://www.pro-football-reference.com/teams/kan/2023.htm', expectedType: VALIDATION_ERROR_TYPES.NON_PLAYER_PAGE },
      { url: 'https://example.com/not-pfr', expectedType: VALIDATION_ERROR_TYPES.INVALID_DOMAIN },
      { url: 'invalid-url', expectedType: VALIDATION_ERROR_TYPES.MALFORMED_URL },
      { url: 'https://pro-football-reference.com/players/', expectedType: VALIDATION_ERROR_TYPES.INVALID_SLUG }
    ];
    
    let correctCategorizations = 0;
    
    for (const testCase of testCases) {
      const result = validator.validateUrl(testCase.url);
      if (result.errorType === testCase.expectedType) {
        correctCategorizations++;
      } else {
        console.log(`Incorrect categorization for ${testCase.url}: expected ${testCase.expectedType}, got ${result.errorType}`);
      }
    }
    
    const duration = performance.now() - startTime;
    const accuracy = (correctCategorizations / testCases.length) * 100;
    
    if (accuracy === 100) {
      logTest('Error Categorization', 'PASS', 
        `All ${testCases.length} error types correctly categorized`, duration);
    } else {
      logTest('Error Categorization', 'FAIL', 
        `Only ${correctCategorizations}/${testCases.length} error types correctly categorized`, duration);
    }
    
  } catch (error) {
    logTest('Error Categorization', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 4: Order Preservation
async function testOrderPreservation() {
  const startTime = performance.now();
  const validator = new PFRUrlValidator();
  
  try {
    // Create a mixed list with known order
    const mixedUrls = [
      TEST_URLS.valid[0], // Should be at index 0
      TEST_URLS.invalid[0], // Should be at index 1
      TEST_URLS.valid[1], // Should be at index 2
      TEST_URLS.invalid[1], // Should be at index 3
      TEST_URLS.valid[2] // Should be at index 4
    ];
    
    const result = validator.validateBatch(mixedUrls, {
      preserveOrder: true,
      generateReport: true
    });
    
    const duration = performance.now() - startTime;
    
    // Check that original indices are preserved
    let orderPreserved = true;
    for (let i = 0; i < result.results.length; i++) {
      if (result.results[i].originalIndex !== i) {
        orderPreserved = false;
        break;
      }
    }
    
    if (orderPreserved) {
      logTest('Order Preservation', 'PASS', 
        `Original order preserved for ${mixedUrls.length} URLs`, duration);
    } else {
      logTest('Order Preservation', 'FAIL', 
        `Original order not preserved`, duration);
    }
    
  } catch (error) {
    logTest('Order Preservation', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 5: Timeout Configuration
async function testTimeoutConfiguration() {
  const startTime = performance.now();
  
  try {
    // Test that configuration is environment-driven
    const config = require('./src/lib/config');
    
    const requiredConfigs = [
      'PFR_VALIDATION_TIMEOUT_MS',
      'PFR_EXTRACTION_TIMEOUT_MS',
      'PFR_BATCH_DELAY_MS',
      'PFR_REPORT_INTERVAL_MS'
    ];
    
    let allConfigsPresent = true;
    const missingConfigs = [];
    
    for (const configKey of requiredConfigs) {
      if (!(configKey in config)) {
        allConfigsPresent = false;
        missingConfigs.push(configKey);
      }
    }
    
    const duration = performance.now() - startTime;
    
    if (allConfigsPresent) {
      logTest('Timeout Configuration', 'PASS', 
        `All required timeout configurations present`, duration);
    } else {
      logTest('Timeout Configuration', 'FAIL', 
        `Missing configurations: ${missingConfigs.join(', ')}`, duration);
    }
    
    // Test that values are positive numbers
    let validValues = true;
    const invalidValues = [];
    
    for (const configKey of requiredConfigs) {
      const value = config[configKey];
      if (typeof value !== 'number' || value <= 0) {
        validValues = false;
        invalidValues.push(`${configKey}=${value}`);
      }
    }
    
    if (validValues) {
      logTest('Timeout Values', 'PASS', 
        `All timeout values are positive numbers`);
    } else {
      logTest('Timeout Values', 'FAIL', 
        `Invalid timeout values: ${invalidValues.join(', ')}`);
    }
    
  } catch (error) {
    logTest('Timeout Configuration', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 6: Batch Processing Performance
async function testBatchProcessingPerformance() {
  const startTime = performance.now();
  const initialMemory = getMemoryUsage();
  
  try {
    const processor = new PFRBatchProcessor({
      concurrency: 1, // Low concurrency for testing
      delayMs: 0, // No delay for testing
      skipInvalid: true
    });
    
    // Test with a small batch of valid URLs
    const testUrls = TEST_URLS.valid.slice(0, 3);
    
    // Mock the fetchWithPolicy to avoid actual HTTP requests
    const originalFetchWithPolicy = require('./src/lib/http/client').fetchWithPolicy;
    require('./src/lib/http/client').fetchWithPolicy = async (url, options) => {
      // Return a mock response
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <head><title>Test Player</title></head>
            <body>
              <h1 itemprop="name">Test Player</h1>
              <div class="necro-jersey"><strong>QB</strong> #12</div>
              <div class="player-info">
                <p>Height: 6'3"</p>
                <p>Weight: 230 lbs</p>
                <p>Born: January 1, 1990 in Test City, TX</p>
                <p>College: Test University</p>
              </div>
              <table class="stats_table">
                <thead><tr><th>Year</th><th>Games</th><th>Yards</th></tr></thead>
                <tbody><tr><td>2023</td><td>16</td><td>4000</td></tr></tbody>
              </table>
            </body>
          </html>
        `
      };
    };
    
    const result = await processor.processBatch(testUrls);
    
    // Restore original function
    require('./src/lib/http/client').fetchWithPolicy = originalFetchWithPolicy;
    
    const duration = performance.now() - startTime;
    const finalMemory = getMemoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    
    // Check that processing completed successfully
    if (result.summary.successfulExtractions > 0) {
      logTest('Batch Processing Performance', 'PASS', 
        `Successfully processed ${result.summary.successfulExtractions} URLs`, duration, {
          memoryIncrease: `${memoryIncrease}MB`,
          processingTime: `${duration.toFixed(2)}ms`
        });
    } else {
      logTest('Batch Processing Performance', 'FAIL', 
        `No successful extractions`, duration);
    }
    
    // Check memory usage
    if (memoryIncrease < TEST_CONFIG.memoryThresholdMB) {
      logTest('Memory Usage', 'PASS', 
        `Memory increase: ${memoryIncrease}MB (within ${TEST_CONFIG.memoryThresholdMB}MB threshold)`);
    } else {
      logTest('Memory Usage', 'WARN', 
        `Memory increase: ${memoryIncrease}MB (exceeds ${TEST_CONFIG.memoryThresholdMB}MB threshold)`);
    }
    
  } catch (error) {
    logTest('Batch Processing Performance', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 7: Validation Overhead
async function testValidationOverhead() {
  const startTime = performance.now();
  const validator = new PFRUrlValidator();
  
  try {
    // Test validation performance with large batch
    const largeUrlList = [];
    for (let i = 0; i < 1000; i++) {
      largeUrlList.push(`https://www.pro-football-reference.com/players/T/Test${i.toString().padStart(2, '0')}.htm`);
    }
    
    const validationStart = performance.now();
    const result = validator.validateBatch(largeUrlList, {
      checkDuplicates: true,
      generateReport: true
    });
    const validationDuration = performance.now() - validationStart;
    
    const duration = performance.now() - startTime;
    
    // Calculate overhead percentage (validation should be very fast)
    const overheadPercentage = (validationDuration / duration) * 100;
    
    if (overheadPercentage < TEST_CONFIG.processingOverheadThreshold) {
      logTest('Validation Overhead', 'PASS', 
        `Validation overhead: ${overheadPercentage.toFixed(2)}% (under ${TEST_CONFIG.processingOverheadThreshold}% threshold)`, duration, {
          validationTime: `${validationDuration.toFixed(2)}ms`,
          totalTime: `${duration.toFixed(2)}ms`,
          overheadPercentage: `${overheadPercentage.toFixed(2)}%`
        });
    } else {
      logTest('Validation Overhead', 'WARN', 
        `Validation overhead: ${overheadPercentage.toFixed(2)}% (exceeds ${TEST_CONFIG.processingOverheadThreshold}% threshold)`, duration);
    }
    
  } catch (error) {
    logTest('Validation Overhead', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 8: Error Handling
async function testErrorHandling() {
  const startTime = performance.now();
  const processor = new PFRBatchProcessor({
    concurrency: 1,
    delayMs: 0,
    skipInvalid: true
  });
  
  try {
    // Test with mix of valid and invalid URLs
    const mixedUrls = [
      TEST_URLS.valid[0], // Valid
      TEST_URLS.invalid[0], // Invalid - should be skipped
      TEST_URLS.valid[1], // Valid
      'https://nonexistent-domain-12345.com/players/test.htm', // Network error
      TEST_URLS.valid[2] // Valid
    ];
    
    // Mock fetchWithPolicy to simulate network errors
    const originalFetchWithPolicy = require('./src/lib/http/client').fetchWithPolicy;
    require('./src/lib/http/client').fetchWithPolicy = async (url, options) => {
      if (url.includes('nonexistent-domain')) {
        throw new Error('Network error: ENOTFOUND');
      }
      if (url.includes('pro-football-reference.com/players/')) {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <head><title>Test Player</title></head>
              <body>
                <h1 itemprop="name">Test Player</h1>
                <div class="necro-jersey"><strong>QB</strong> #12</div>
                <table class="stats_table">
                  <thead><tr><th>Year</th><th>Games</th></tr></thead>
                  <tbody><tr><td>2023</td><td>16</td></tr></tbody>
                </table>
              </body>
            </html>
          `
        };
      }
      throw new Error('Invalid URL');
    };
    
    const result = await processor.processBatch(mixedUrls);
    
    // Restore original function
    require('./src/lib/http/client').fetchWithPolicy = originalFetchWithPolicy;
    
    const duration = performance.now() - startTime;
    
    // Check that processing handled errors gracefully
    const expectedValid = 3; // 3 valid URLs
    const expectedInvalid = 1; // 1 invalid URL (teams page)
    const expectedFailed = 1; // 1 network error
    
    if (result.summary.validUrls === expectedValid && 
        result.summary.invalidUrls === expectedInvalid &&
        result.summary.failedExtractions === expectedFailed) {
      logTest('Error Handling', 'PASS', 
        `Gracefully handled ${expectedInvalid} invalid and ${expectedFailed} failed URLs`, duration);
    } else {
      logTest('Error Handling', 'FAIL', 
        `Expected ${expectedValid} valid, ${expectedInvalid} invalid, ${expectedFailed} failed. Got ${result.summary.validUrls} valid, ${result.summary.invalidUrls} invalid, ${result.summary.failedExtractions} failed`, duration);
    }
    
  } catch (error) {
    logTest('Error Handling', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 9: Backward Compatibility
async function testBackwardCompatibility() {
  const startTime = performance.now();
  
  try {
    // Test that existing functionality still works
    const { SportsContentExtractor } = require('./src/lib/sports-extractor');
    const { SportsDataExporter } = require('./src/lib/sports-export');
    const { fetchWithPolicy } = require('./src/lib/http/client');
    const config = require('./src/lib/config');
    
    // Test that classes can be instantiated
    const extractor = new SportsContentExtractor();
    const exporter = new SportsDataExporter();
    
    // Test that configuration is accessible
    const hasRequiredConfig = config.DEFAULT_TIMEOUT_MS && config.MAX_RETRIES;
    
    const duration = performance.now() - startTime;
    
    if (extractor && exporter && hasRequiredConfig) {
      logTest('Backward Compatibility', 'PASS', 
        'All existing functionality remains accessible', duration);
    } else {
      logTest('Backward Compatibility', 'FAIL', 
        'Some existing functionality is not accessible', duration);
    }
    
  } catch (error) {
    logTest('Backward Compatibility', 'FAIL', `Error: ${error.message}`);
  }
}

// Test 10: Report Generation
async function testReportGeneration() {
  const startTime = performance.now();
  const validator = new PFRUrlValidator();
  
  try {
    const testUrls = [
      ...TEST_URLS.valid.slice(0, 3),
      ...TEST_URLS.invalid.slice(0, 2),
      TEST_URLS.valid[0] // Duplicate
    ];
    
    const result = validator.validateBatch(testUrls, {
      generateReport: true,
      checkDuplicates: true
    });
    
    const duration = performance.now() - startTime;
    
    // Check that report contains all required sections
    const requiredSections = [
      'overview',
      'errorBreakdown',
      'invalidUrls',
      'duplicateUrls',
      'validUrls',
      'recommendations'
    ];
    
    let allSectionsPresent = true;
    const missingSections = [];
    
    for (const section of requiredSections) {
      if (!(section in result.report)) {
        allSectionsPresent = false;
        missingSections.push(section);
      }
    }
    
    if (allSectionsPresent) {
      logTest('Report Generation', 'PASS', 
        `Report contains all required sections`, duration);
    } else {
      logTest('Report Generation', 'FAIL', 
        `Report missing sections: ${missingSections.join(', ')}`, duration);
    }
    
    // Check that overview contains expected data
    const overview = result.report.overview;
    if (overview.totalUrls === testUrls.length && 
        overview.validUrls >= 0 && 
        overview.invalidUrls >= 0) {
      logTest('Report Data Accuracy', 'PASS', 
        `Report data is accurate: ${overview.totalUrls} total, ${overview.validUrls} valid, ${overview.invalidUrls} invalid`);
    } else {
      logTest('Report Data Accuracy', 'FAIL', 
        `Report data is inaccurate: expected ${testUrls.length} total URLs`);
    }
    
  } catch (error) {
    logTest('Report Generation', 'FAIL', `Error: ${error.message}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log('🏈 Starting PFR Batch Processing Enhancement Tests\n');
  
  const overallStartTime = performance.now();
  
  // Run all tests
  await testURLValidationAccuracy();
  await testDuplicateDetection();
  await testErrorCategorization();
  await testOrderPreservation();
  await testTimeoutConfiguration();
  await testBatchProcessingPerformance();
  await testValidationOverhead();
  await testErrorHandling();
  await testBackwardCompatibility();
  await testReportGeneration();
  
  const overallDuration = performance.now() - overallStartTime;
  
  // Print summary
  console.log('\n📊 Test Summary:');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⚠️  Warnings: ${testResults.warnings}`);
  console.log(`⏱️  Total Duration: ${overallDuration.toFixed(2)}ms`);
  
  // Calculate pass rate
  const totalTests = testResults.passed + testResults.failed + testResults.warnings;
  const passRate = totalTests > 0 ? (testResults.passed / totalTests) * 100 : 0;
  console.log(`📈 Pass Rate: ${passRate.toFixed(1)}%`);
  
  // Save detailed results
  const resultsFile = path.join(__dirname, 'pfr-batch-test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify({
    summary: {
      passed: testResults.passed,
      failed: testResults.failed,
      warnings: testResults.warnings,
      passRate: passRate,
      totalDuration: overallDuration
    },
    details: testResults.details,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log(`\n📄 Detailed results saved to: ${resultsFile}`);
  
  // Exit with appropriate code
  if (testResults.failed > 0) {
    console.log('\n❌ Some tests failed. Please review the results.');
    process.exit(1);
  } else if (testResults.warnings > 0) {
    console.log('\n⚠️  Some tests had warnings. Please review the results.');
    process.exit(0);
  } else {
    console.log('\n🎉 All tests passed! PFR batch processing enhancements are working correctly.');
    process.exit(0);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testResults
};