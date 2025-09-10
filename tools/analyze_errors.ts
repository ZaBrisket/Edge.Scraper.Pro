#!/usr/bin/env node

/**
 * Error Log Analyzer
 * Analyzes error logs to identify patterns in 429 rate limiting issues
 */

interface ErrorEvent {
  timestamp: string;
  level: string;
  message: string;
  host?: string;
  url?: string;
  correlationId?: string;
  status?: number;
}

interface AnalysisResult {
  totalErrors: number;
  byHost: Record<string, number>;
  byStatus: Record<string, number>;
  byMessage: Record<string, number>;
  timeWindow: {
    start: string;
    end: string;
  };
  sampleUrls: string[];
  sampleMessages: string[];
}

function analyzeErrorLog(events: ErrorEvent[]): AnalysisResult {
  const byHost: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byMessage: Record<string, number> = {};
  const urls = new Set<string>();
  const timestamps: string[] = [];

  for (const event of events) {
    // Count by host
    const host = event.host || 'unknown';
    byHost[host] = (byHost[host] || 0) + 1;

    // Count by status (extract from message)
    const statusMatch = event.message.match(/\[(\d+)\]/);
    if (statusMatch) {
      const status = statusMatch[1];
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    // Count by message type
    byMessage[event.message] = (byMessage[event.message] || 0) + 1;

    // Collect URLs
    if (event.url) {
      urls.add(event.url);
    }

    // Collect timestamps
    if (event.timestamp) {
      timestamps.push(event.timestamp);
    }
  }

  // Calculate time window
  const sortedTimestamps = timestamps.sort();
  const timeWindow = {
    start: sortedTimestamps[0] || 'unknown',
    end: sortedTimestamps[sortedTimestamps.length - 1] || 'unknown'
  };

  return {
    totalErrors: events.length,
    byHost,
    byStatus,
    byMessage,
    timeWindow,
    sampleUrls: Array.from(urls).slice(0, 5),
    sampleMessages: Object.keys(byMessage).slice(0, 5)
  };
}

function printAnalysis(result: AnalysisResult): void {
  console.log('=== Error Log Analysis ===\n');
  
  console.log(`Total Errors: ${result.totalErrors}\n`);
  
  console.log('By Host:');
  Object.entries(result.byHost)
    .sort(([,a], [,b]) => b - a)
    .forEach(([host, count]) => {
      console.log(`  ${host}: ${count} (${Math.round(count/result.totalErrors*100)}%)`);
    });
  
  console.log('\nBy Status Code:');
  Object.entries(result.byStatus)
    .sort(([,a], [,b]) => b - a)
    .forEach(([status, count]) => {
      console.log(`  [${status}]: ${count} (${Math.round(count/result.totalErrors*100)}%)`);
    });
  
  console.log('\nBy Message Type:');
  Object.entries(result.byMessage)
    .sort(([,a], [,b]) => b - a)
    .forEach(([message, count]) => {
      console.log(`  "${message}": ${count} (${Math.round(count/result.totalErrors*100)}%)`);
    });
  
  console.log(`\nTime Window: ${result.timeWindow.start} to ${result.timeWindow.end}`);
  
  console.log('\nSample URLs:');
  result.sampleUrls.forEach(url => console.log(`  ${url}`));
  
  console.log('\nSample Messages:');
  result.sampleMessages.forEach(msg => console.log(`  "${msg}"`));
}

// Mock data for demonstration (since actual log file is not available)
const mockErrorEvents: ErrorEvent[] = [
  {
    timestamp: '2025-09-10T18:27:15.123Z',
    level: 'error',
    message: '[500] Upstream 429',
    host: 'www.pro-football-reference.com',
    url: 'https://www.pro-football-reference.com/players/A/AllenJo00.htm',
    correlationId: 'req-abc123'
  },
  {
    timestamp: '2025-09-10T18:27:16.456Z',
    level: 'error',
    message: '[500] Upstream 429',
    host: 'www.pro-football-reference.com',
    url: 'https://www.pro-football-reference.com/players/B/BradyTo00.htm',
    correlationId: 'req-def456'
  },
  {
    timestamp: '2025-09-10T18:27:30.789Z',
    level: 'error',
    message: '[500] Circuit www.pro-football-reference.com is open',
    host: 'www.pro-football-reference.com',
    url: 'https://www.pro-football-reference.com/players/M/MahomesPa00.htm',
    correlationId: 'req-ghi789'
  },
  // Add more mock events to reach 35 total
  ...Array.from({ length: 32 }, (_, i) => ({
    timestamp: `2025-09-10T18:27:${15 + Math.floor(i/2)}.${String(123 + i*100).padStart(3, '0')}Z`,
    level: 'error',
    message: i < 25 ? '[500] Upstream 429' : '[500] Circuit www.pro-football-reference.com is open',
    host: 'www.pro-football-reference.com',
    url: `https://www.pro-football-reference.com/players/${String.fromCharCode(65 + (i % 26))}/Player${String(i).padStart(2, '0')}.htm`,
    correlationId: `req-${String(i).padStart(6, '0')}`
  }))
];

// Run analysis
const result = analyzeErrorLog(mockErrorEvents);
printAnalysis(result);

// Export for use in other scripts
export { analyzeErrorLog, ErrorEvent, AnalysisResult };