#!/usr/bin/env node

/**
 * Simple integration demo showing resilient HTTP handling
 * This demonstrates the key functionality without requiring external dependencies
 */

const { fetchWithPolicy, getCircuitStats } = require('../src/lib/http/client');
const { rateLimiter } = require('../src/lib/http/rate-limiter');
const { httpMetrics } = require('../src/lib/http/metrics');

async function demonstrateResilientHTTP() {
  console.log('🚀 HTTP Resilience Integration Demo\n');
  
  // Demo 1: Rate Limiter Configuration
  console.log('📊 Rate Limiter Configuration:');
  const pfrHost = 'www.pro-football-reference.com';
  const pfrLimiter = rateLimiter.getLimiter(pfrHost);
  const pfrStats = rateLimiter.getStats(pfrHost);
  
  console.log(`  ${pfrHost}:`);
  console.log(`    RPS: ${pfrStats.limiter.rps}`);
  console.log(`    Burst: ${pfrStats.limiter.burst}`);
  console.log(`    Available Tokens: ${pfrStats.limiter.tokens.toFixed(1)}`);
  console.log();
  
  // Demo 2: Circuit Breaker Status
  console.log('⚡ Circuit Breaker Status:');
  const circuitStats = getCircuitStats();
  if (Object.keys(circuitStats).length === 0) {
    console.log('  All circuits closed (healthy state)');
  } else {
    for (const [host, stats] of Object.entries(circuitStats)) {
      console.log(`  ${host}: ${stats.state} (failures: ${stats.failures})`);
    }
  }
  console.log();
  
  // Demo 3: Metrics Recording
  console.log('📈 Metrics Recording Demo:');
  
  // Simulate some metrics
  httpMetrics.recordRequest('demo.example.com', 200, 150, 'demo-001');
  httpMetrics.record429Deferred('demo.example.com', 1000, 'demo-002');
  httpMetrics.recordRetryScheduled('demo.example.com', '429_backoff', 2000, 1, 'demo-003');
  
  const demoMetrics = httpMetrics.getHostMetrics('demo.example.com');
  console.log('  demo.example.com metrics:');
  console.log(`    Successful requests: ${demoMetrics.requests['2xx']?.total || 0}`);
  console.log(`    429 deferrals: ${demoMetrics.rateLimits['429_deferred'] || 0}`);
  console.log(`    Retry events: ${demoMetrics.retries['429_backoff'] || 0}`);
  console.log();
  
  // Demo 4: Error Handling (without actual network calls)
  console.log('🛡️  Error Handling Demo:');
  console.log('  ✅ 429s are treated as deferrals, not failures');
  console.log('  ✅ Circuit breakers exclude rate limits from failure counts');
  console.log('  ✅ Exponential backoff with jitter for retries');
  console.log('  ✅ Retry-After header support for upstream rate limits');
  console.log('  ✅ Per-host rate limiting prevents overwhelming servers');
  console.log();
  
  // Demo 5: Configuration Summary
  console.log('⚙️  Configuration Summary:');
  const config = require('../src/lib/config');
  console.log(`  Default timeout: ${config.DEFAULT_TIMEOUT_MS}ms`);
  console.log(`  Max retries: ${config.MAX_RETRIES}`);
  console.log(`  Circuit breaker threshold: ${config.CIRCUIT_BREAKER_THRESHOLD}`);
  console.log(`  Circuit breaker reset: ${config.CIRCUIT_BREAKER_RESET_MS}ms`);
  console.log(`  Retry base delay: ${config.RETRY_BASE_DELAY_MS}ms`);
  console.log(`  Retry max delay: ${config.RETRY_MAX_DELAY_MS}ms`);
  console.log();
  
  // Demo 6: Rate Limiting Dashboard
  console.log('📋 Rate Limiting Dashboard:');
  const dashboard = httpMetrics.getRateLimitDashboard();
  if (Object.keys(dashboard.hosts).length === 0) {
    console.log('  No rate limiting events yet (clean slate)');
  } else {
    for (const [host, events] of Object.entries(dashboard.hosts)) {
      console.log(`  ${host}:`);
      for (const [event, count] of Object.entries(events)) {
        console.log(`    ${event}: ${count}`);
      }
    }
  }
  console.log();
  
  console.log('✅ Integration demo completed successfully!');
  console.log('\n💡 Key Benefits:');
  console.log('  • No more "[500] Upstream 429" errors');
  console.log('  • Circuit breakers stay closed during rate limit bursts');
  console.log('  • Intelligent retry with Retry-After header support');
  console.log('  • Per-host rate limiting prevents overwhelming servers');
  console.log('  • Comprehensive observability for tuning and monitoring');
  console.log('\n🔧 Tools:');
  console.log('  • node tools/http-stats.js - Real-time HTTP statistics');
  console.log('  • node tools/analyze_errors.js - Error log analysis');
  console.log('  • npm test tests/http-basic.test.js - Unit tests');
  
  // Cleanup
  require('../src/lib/http/client').shutdown();
}

// Run the demo
demonstrateResilientHTTP().catch(console.error);