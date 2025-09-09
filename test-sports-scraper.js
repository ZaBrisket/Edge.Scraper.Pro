#!/usr/bin/env node

/**
 * Sports Scraper Test Runner
 * Run comprehensive tests on the enhanced sports statistics scraper
 */

const { SportsScraperTestSuite } = require('./src/lib/sports-test-suite');

async function runTests() {
    console.log('🏈 Initializing Sports Scraper Test Suite...\n');
    
    const testSuite = new SportsScraperTestSuite();
    
    try {
        const results = await testSuite.runFullTestSuite();
        
        // Write results to file
        const fs = require('fs');
        const resultsFile = `test-results-${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        console.log(`📁 Detailed results saved to: ${resultsFile}`);
        
        // Exit with appropriate code
        const passRate = (results.passed / results.totalTests) * 100;
        process.exit(passRate >= 80 ? 0 : 1);
        
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    }
}

// Add CLI argument parsing
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');

if (helpFlag) {
    console.log(`
🏈 Sports Scraper Test Suite

Usage: node test-sports-scraper.js [options]

Options:
  --help, -h    Show this help message
  
This test suite validates:
  ✅ Content extraction accuracy
  ✅ Structured data quality  
  ✅ Sports-specific validation
  ✅ Export functionality
  ✅ Performance benchmarks
  ✅ Edge case handling

Results are saved to test-results-[date].json
Exit code 0 = tests passed (≥80%), 1 = tests failed
`);
    process.exit(0);
}

runTests();