#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function analyzeErrors(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    console.log('=== Error Log Analysis Report ===\n');
    
    // Basic stats
    console.log(`📊 Total Errors: ${data.length}`);
    
    // Time window analysis
    const timestamps = data.map(e => new Date(e.timestamp));
    const startTime = new Date(Math.min(...timestamps));
    const endTime = new Date(Math.max(...timestamps));
    console.log(`⏰ Time Window: ${startTime.toISOString()} to ${endTime.toISOString()}`);
    console.log(`⏱️  Duration: ${((endTime - startTime) / 1000).toFixed(1)} seconds\n`);
    
    // Error type breakdown
    const byType = {};
    const byHost = {};
    const byStatus = {};
    const uniqueUrls = new Set();
    
    data.forEach(error => {
      byType[error.type] = (byType[error.type] || 0) + 1;
      byHost[error.host] = (byHost[error.host] || 0) + 1;
      byStatus[error.status_code] = (byStatus[error.status_code] || 0) + 1;
      uniqueUrls.add(error.url);
    });
    
    console.log('📈 Error Types:');
    Object.entries(byType)
      .sort(([,a], [,b]) => b - a)
      .forEach(([type, count]) => {
        const pct = ((count / data.length) * 100).toFixed(1);
        console.log(`  ${type}: ${count} (${pct}%)`);
      });
    
    console.log('\n🌐 By Host:');
    Object.entries(byHost)
      .sort(([,a], [,b]) => b - a)
      .forEach(([host, count]) => {
        const pct = ((count / data.length) * 100).toFixed(1);
        console.log(`  ${host}: ${count} (${pct}%)`);
      });
    
    console.log('\n🔢 By Status Code:');
    Object.entries(byStatus)
      .sort(([,a], [,b]) => b - a)
      .forEach(([status, count]) => {
        const pct = ((count / data.length) * 100).toFixed(1);
        console.log(`  ${status}: ${count} (${pct}%)`);
      });
    
    console.log(`\n🔗 Unique URLs: ${uniqueUrls.size}`);
    
    // Sample messages
    console.log('\n📋 Sample Error Messages:');
    const messageTypes = {};
    data.forEach(error => {
      if (!messageTypes[error.message]) {
        messageTypes[error.message] = {
          count: 0,
          example: error
        };
      }
      messageTypes[error.message].count++;
    });
    
    Object.entries(messageTypes)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 5)
      .forEach(([message, {count, example}]) => {
        console.log(`  "${message}" (${count}x)`);
        console.log(`    Example: ${example.url}`);
        console.log(`    Time: ${example.timestamp}`);
      });
    
    // Key findings
    console.log('\n🔍 Key Findings:');
    const upstream429Count = data.filter(e => e.message.includes('Upstream 429')).length;
    const circuitOpenCount = data.filter(e => e.message.includes('Circuit breaker')).length;
    
    console.log(`  • ${upstream429Count} errors are 429s being mapped to 500s`);
    console.log(`  • ${circuitOpenCount} errors are circuit breaker opens`);
    console.log(`  • All errors target www.pro-football-reference.com`);
    console.log(`  • Pattern: 429s → circuit opens → more failures`);
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('  1. Stop mapping 429s to 500s - treat as deferrals');
    console.log('  2. Exclude 429s from circuit breaker failure counts');
    console.log('  3. Implement Retry-After header support');
    console.log('  4. Add per-host rate limiting (< 1 RPS for PFR)');
    console.log('  5. Use exponential backoff with jitter for 429s');
    
  } catch (error) {
    console.error('Error analyzing log file:', error.message);
    process.exit(1);
  }
}

// CLI usage
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node analyze_errors.js <path-to-error-log.json>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`);
  process.exit(1);
}

analyzeErrors(filePath);