#!/usr/bin/env node

const { rateLimiter } = require('../src/lib/http/rate-limiter');
const { httpMetrics } = require('../src/lib/http/metrics');
const { getCircuitStats } = require('../src/lib/http/client');

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function displayRateLimitStats() {
  console.log('🚦 Rate Limiting Statistics\n');
  
  const rateLimitStats = rateLimiter.getAllStats();
  
  if (Object.keys(rateLimitStats).length === 0) {
    console.log('No rate limiting activity recorded.\n');
    return;
  }
  
  for (const [host, stats] of Object.entries(rateLimitStats)) {
    if (!stats) continue;
    
    console.log(`📡 ${host}`);
    console.log(`  Rate Limit: ${stats.limiter.rps} RPS, Burst: ${stats.limiter.burst}`);
    console.log(`  Available Tokens: ${stats.limiter.tokens.toFixed(1)}/${stats.limiter.burst}`);
    console.log(`  Pending Reservations: ${stats.limiter.pendingReservations}`);
    console.log(`  Metrics (last hour):`);
    console.log(`    Hits: ${stats.metrics.hits}`);
    console.log(`    Avg Wait: ${formatDuration(stats.metrics.averageWait)}`);
    console.log(`    Errors: ${stats.metrics.errors}`);
    console.log();
  }
}

function displayHttpMetrics() {
  console.log('📊 HTTP Request Metrics\n');
  
  const allMetrics = httpMetrics.getAllMetrics();
  
  if (Object.keys(allMetrics.hosts).length === 0) {
    console.log('No HTTP activity recorded.\n');
    return;
  }
  
  for (const [host, metrics] of Object.entries(allMetrics.hosts)) {
    console.log(`🌐 ${host}`);
    
    // Request counts by status class
    if (Object.keys(metrics.requests).length > 0) {
      console.log('  Requests:');
      for (const [statusClass, counts] of Object.entries(metrics.requests)) {
        console.log(`    ${statusClass}: ${formatNumber(counts.total)} total, ${formatNumber(counts.last5min)} last 5min`);
      }
    }
    
    // Rate limiting events
    if (Object.keys(metrics.rateLimits).length > 0) {
      console.log('  Rate Limits:');
      for (const [eventType, count] of Object.entries(metrics.rateLimits)) {
        console.log(`    ${eventType}: ${formatNumber(count)}`);
      }
    }
    
    // Retry events
    if (Object.keys(metrics.retries).length > 0) {
      console.log('  Retries:');
      for (const [reason, count] of Object.entries(metrics.retries)) {
        console.log(`    ${reason}: ${formatNumber(count)}`);
      }
    }
    
    // Circuit breaker events
    if (Object.keys(metrics.circuitBreaker).length > 0) {
      console.log('  Circuit Breaker:');
      for (const [state, count] of Object.entries(metrics.circuitBreaker)) {
        console.log(`    ${state}: ${formatNumber(count)}`);
      }
    }
    
    // Response time stats
    if (metrics.responseTime.count > 0) {
      console.log('  Response Times:');
      console.log(`    Count: ${formatNumber(metrics.responseTime.count)}`);
      console.log(`    Avg: ${formatDuration(metrics.responseTime.avg)}`);
      console.log(`    P50: ${formatDuration(metrics.responseTime.p50)}`);
      console.log(`    P95: ${formatDuration(metrics.responseTime.p95)}`);
      console.log(`    P99: ${formatDuration(metrics.responseTime.p99)}`);
    }
    
    // Error counts
    if (Object.keys(metrics.errors).length > 0) {
      console.log('  Errors:');
      for (const [errorType, count] of Object.entries(metrics.errors)) {
        console.log(`    ${errorType}: ${formatNumber(count)}`);
      }
    }
    
    console.log();
  }
}

function displayCircuitStats() {
  console.log('⚡ Circuit Breaker Status\n');
  
  const circuitStats = getCircuitStats();
  
  if (Object.keys(circuitStats).length === 0) {
    console.log('No circuit breakers active.\n');
    return;
  }
  
  for (const [host, stats] of Object.entries(circuitStats)) {
    const stateEmoji = {
      'closed': '🟢',
      'half-open': '🟡', 
      'open': '🔴'
    }[stats.state] || '❓';
    
    console.log(`${stateEmoji} ${host}: ${stats.state.toUpperCase()}`);
    console.log(`  Failures: ${stats.failures}`);
    console.log(`  Successes: ${stats.successes}`);
    
    if (stats.state === 'open' && stats.openedAt > 0) {
      const openDuration = Date.now() - stats.openedAt;
      console.log(`  Open Since: ${formatDuration(openDuration)} ago`);
    }
    
    if (stats.state === 'half-open') {
      console.log(`  Half-Open Calls: ${stats.halfOpenCalls}`);
    }
    
    console.log();
  }
}

function displayRateLimitDashboard() {
  console.log('📈 Rate Limiting Dashboard\n');
  
  const dashboard = httpMetrics.getRateLimitDashboard();
  
  if (Object.keys(dashboard.hosts).length === 0) {
    console.log('No rate limiting events recorded.\n');
    return;
  }
  
  console.log(`Last Updated: ${new Date(dashboard.timestamp).toLocaleString()}\n`);
  
  for (const [host, events] of Object.entries(dashboard.hosts)) {
    console.log(`🌐 ${host}`);
    
    const totalEvents = Object.values(events).reduce((sum, count) => sum + count, 0);
    console.log(`  Total Events: ${formatNumber(totalEvents)}`);
    
    for (const [eventType, count] of Object.entries(events)) {
      const percentage = totalEvents > 0 ? ((count / totalEvents) * 100).toFixed(1) : '0.0';
      console.log(`    ${eventType}: ${formatNumber(count)} (${percentage}%)`);
    }
    
    console.log();
  }
}

function displayHelp() {
  console.log('HTTP Statistics Tool\n');
  console.log('Usage: node http-stats.js [command]\n');
  console.log('Commands:');
  console.log('  rate-limits    Show rate limiting statistics');
  console.log('  metrics        Show HTTP request metrics');
  console.log('  circuits       Show circuit breaker status');
  console.log('  dashboard      Show rate limiting dashboard');
  console.log('  all            Show all statistics (default)');
  console.log('  help           Show this help message');
}

// Main execution
const command = process.argv[2] || 'all';

console.log(`\n=== HTTP Statistics (${new Date().toLocaleString()}) ===\n`);

switch (command) {
  case 'rate-limits':
    displayRateLimitStats();
    break;
  case 'metrics':
    displayHttpMetrics();
    break;
  case 'circuits':
    displayCircuitStats();
    break;
  case 'dashboard':
    displayRateLimitDashboard();
    break;
  case 'all':
    displayRateLimitStats();
    displayHttpMetrics();
    displayCircuitStats();
    displayRateLimitDashboard();
    break;
  case 'help':
    displayHelp();
    break;
  default:
    console.log(`Unknown command: ${command}\n`);
    displayHelp();
    process.exit(1);
}