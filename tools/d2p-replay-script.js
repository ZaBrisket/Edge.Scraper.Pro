#!/usr/bin/env node
/**
 * D2P Buyers Guide Replay Script
 * 
 * One-click replay script for testing the original failing URL list
 * with the new URL normalization and pagination discovery features.
 */

const { BatchProcessor } = require('../src/lib/batch-processor');
const { EnhancedFetchClient } = require('../src/lib/http/enhanced-fetch-client');
const fs = require('fs').promises;
const path = require('path');

// Original failing URLs from the task description
const ORIGINAL_FAILING_URLS = Array.from({ length: 50 }, (_, i) => 
  `http://www.d2pbuyersguide.com/filter/all/page/${i + 1}`
);

// Additional test URLs for comprehensive coverage
const LETTER_INDEXED_URLS = ['a', 'b', 'o', 'x', 'p', 'i'].map(letter => 
  `http://www.d2pbuyersguide.com/filter/${letter}/page/1`
);

class D2PReplayScript {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './d2p-replay-results',
      concurrency: options.concurrency || 2,
      timeout: options.timeout || 15000,
      enableNormalization: options.enableNormalization !== false,
      enablePaginationDiscovery: options.enablePaginationDiscovery !== false,
      enableStructuredLogging: options.enableStructuredLogging !== false,
      rateLimitRPS: options.rateLimitRPS || 1,
      maxUrls: options.maxUrls || 50,
      ...options
    };

    this.results = {
      startTime: Date.now(),
      endTime: null,
      originalUrls: [],
      discoveredUrls: [],
      summary: {
        total_processed: 0,
        successful: 0,
        failed: 0,
        canonicalized: 0,
        robots_blocked: 0,
        pagination_discovered: 0,
        error_categories: {}
      },
      detailed_results: []
    };
  }

  /**
   * Initialize output directory and logging
   */
  async initialize() {
    try {
      await fs.mkdir(this.options.outputDir, { recursive: true });
      console.log(`📁 Output directory: ${this.options.outputDir}`);
    } catch (error) {
      console.error('Failed to create output directory:', error.message);
      throw error;
    }
  }

  /**
   * Generate test URLs based on options
   */
  generateTestUrls() {
    let urls = [];

    // Add original failing URLs
    const rangeCount = Math.min(this.options.maxUrls, ORIGINAL_FAILING_URLS.length);
    urls = urls.concat(ORIGINAL_FAILING_URLS.slice(0, rangeCount));

    // Add letter-indexed URLs if we have room
    if (urls.length < this.options.maxUrls) {
      const remainingSlots = this.options.maxUrls - urls.length;
      urls = urls.concat(LETTER_INDEXED_URLS.slice(0, remainingSlots));
    }

    this.results.originalUrls = urls;
    return urls;
  }

  /**
   * Run the replay test
   */
  async run() {
    console.log('🚀 Starting D2P Buyers Guide Replay Script');
    console.log('=' .repeat(60));
    
    await this.initialize();
    
    const testUrls = this.generateTestUrls();
    console.log(`📋 Testing ${testUrls.length} URLs`);
    console.log(`⚙️  Configuration:`);
    console.log(`   - Concurrency: ${this.options.concurrency}`);
    console.log(`   - Timeout: ${this.options.timeout}ms`);
    console.log(`   - URL Normalization: ${this.options.enableNormalization ? '✅' : '❌'}`);
    console.log(`   - Pagination Discovery: ${this.options.enablePaginationDiscovery ? '✅' : '❌'}`);
    console.log(`   - Structured Logging: ${this.options.enableStructuredLogging ? '✅' : '❌'}`);
    console.log(`   - Rate Limit: ${this.options.rateLimitRPS} RPS`);
    console.log('');

    // Create enhanced fetch client
    const fetchClient = new EnhancedFetchClient({
      timeout: this.options.timeout,
      enableCanonicalization: this.options.enableNormalization,
      enablePaginationDiscovery: this.options.enablePaginationDiscovery,
      rateLimitPerSecond: this.options.rateLimitRPS,
      respectRobots: true,
      consecutiveErrorThreshold: 5
    });

    // Create batch processor
    const processor = new BatchProcessor({
      concurrency: this.options.concurrency,
      timeout: this.options.timeout,
      enableUrlNormalization: this.options.enableNormalization,
      enablePaginationDiscovery: this.options.enablePaginationDiscovery,
      enableStructuredLogging: this.options.enableStructuredLogging,
      onProgress: (progress) => this.handleProgress(progress),
      onError: (error) => this.handleError(error)
    });

    try {
      console.log('🔄 Processing URLs...');
      const batchResults = await processor.processBatch(testUrls, async (url) => {
        return await fetchClient.enhancedFetch(url);
      });

      // Process results
      await this.processResults(batchResults, fetchClient);
      
      // Generate reports
      await this.generateReports();
      
      console.log('✅ Replay script completed successfully');
      return this.results;

    } catch (error) {
      console.error('❌ Replay script failed:', error.message);
      await this.generateErrorReport(error);
      throw error;
    } finally {
      fetchClient.clearCaches();
    }
  }

  /**
   * Handle progress updates
   */
  handleProgress(progress) {
    if (progress.phase === 'processing') {
      const percent = Math.round((progress.completed / progress.total) * 100);
      console.log(`📊 Progress: ${progress.completed}/${progress.total} (${percent}%)`);
    }
  }

  /**
   * Handle errors during processing
   */
  handleError(error) {
    console.error('⚠️  Processing error:', error.message);
  }

  /**
   * Process batch results and extract insights
   */
  async processResults(batchResults, fetchClient) {
    this.results.endTime = Date.now();
    this.results.detailed_results = batchResults.results;

    // Calculate summary statistics
    for (const result of batchResults.results) {
      this.results.summary.total_processed++;

      if (result.success) {
        this.results.summary.successful++;
        
        // Check if URL was canonicalized
        if (result.result?.canonicalizationResult?.success) {
          this.results.summary.canonicalized++;
        }
        
        // Check if pagination was discovered
        if (result.result?.paginationDiscovered) {
          this.results.summary.pagination_discovered++;
        }
      } else {
        this.results.summary.failed++;
        
        // Count error categories
        const category = result.errorCategory || 'unknown';
        this.results.summary.error_categories[category] = 
          (this.results.summary.error_categories[category] || 0) + 1;

        // Check if robots blocked
        if (category === 'blocked_by_robots') {
          this.results.summary.robots_blocked++;
        }
      }
    }

    // Get discovered URLs from pagination discovery
    const fetchStats = fetchClient.getStats();
    if (fetchStats.paginationDiscovery) {
      // This would contain discovered URLs if pagination discovery worked
      console.log('📈 Pagination discovery stats:', fetchStats.paginationDiscovery);
    }

    // Log summary
    console.log('');
    console.log('📊 Processing Summary:');
    console.log(`   Total URLs: ${this.results.summary.total_processed}`);
    console.log(`   Successful: ${this.results.summary.successful} (${Math.round(this.results.summary.successful / this.results.summary.total_processed * 100)}%)`);
    console.log(`   Failed: ${this.results.summary.failed} (${Math.round(this.results.summary.failed / this.results.summary.total_processed * 100)}%)`);
    console.log(`   Canonicalized: ${this.results.summary.canonicalized}`);
    console.log(`   Robots Blocked: ${this.results.summary.robots_blocked}`);
    console.log(`   Pagination Discovered: ${this.results.summary.pagination_discovered}`);
    console.log('');

    // Show error breakdown
    if (Object.keys(this.results.summary.error_categories).length > 0) {
      console.log('🔍 Error Categories:');
      for (const [category, count] of Object.entries(this.results.summary.error_categories)) {
        console.log(`   ${category}: ${count}`);
      }
      console.log('');
    }

    // Highlight key improvements
    const unknownErrors = this.results.summary.error_categories['unknown'] || 0;
    if (unknownErrors === 0) {
      console.log('✅ SUCCESS: Zero "unknown" errors - all failures properly categorized!');
    } else {
      console.log(`⚠️  Still have ${unknownErrors} unknown errors`);
    }

    if (this.results.summary.canonicalized > 0) {
      console.log(`✅ SUCCESS: ${this.results.summary.canonicalized} URLs successfully canonicalized!`);
    }
  }

  /**
   * Generate comprehensive reports
   */
  async generateReports() {
    const reportData = {
      metadata: {
        script_version: '1.0.0',
        timestamp: new Date().toISOString(),
        duration_ms: this.results.endTime - this.results.startTime,
        configuration: this.options
      },
      summary: this.results.summary,
      original_urls: this.results.originalUrls,
      discovered_urls: this.results.discoveredUrls,
      sample_results: this.results.detailed_results.slice(0, 10), // First 10 for brevity
      error_analysis: this.analyzeErrors()
    };

    // Write JSON report
    const jsonReportPath = path.join(this.options.outputDir, 'd2p-replay-report.json');
    await fs.writeFile(jsonReportPath, JSON.stringify(reportData, null, 2));
    console.log(`📄 JSON report: ${jsonReportPath}`);

    // Write CSV report for easy analysis
    await this.generateCSVReport();

    // Write markdown summary
    await this.generateMarkdownSummary(reportData);
  }

  /**
   * Analyze error patterns
   */
  analyzeErrors() {
    const analysis = {
      most_common_error: null,
      canonicalization_success_rate: 0,
      url_patterns: {}
    };

    // Find most common error
    const errorCounts = this.results.summary.error_categories;
    if (Object.keys(errorCounts).length > 0) {
      analysis.most_common_error = Object.entries(errorCounts)
        .sort(([,a], [,b]) => b - a)[0];
    }

    // Calculate canonicalization success rate
    const canonicalizedAttempts = this.results.detailed_results.filter(r => 
      r.errorDetails?.canonicalizationResult?.attempts?.length > 0
    ).length;
    
    if (canonicalizedAttempts > 0) {
      analysis.canonicalization_success_rate = 
        this.results.summary.canonicalized / canonicalizedAttempts;
    }

    // Analyze URL patterns
    for (const result of this.results.detailed_results) {
      const url = new URL(result.url);
      const pattern = url.pathname.replace(/\/page\/\d+/, '/page/*');
      
      if (!analysis.url_patterns[pattern]) {
        analysis.url_patterns[pattern] = { total: 0, successful: 0, failed: 0 };
      }
      
      analysis.url_patterns[pattern].total++;
      if (result.success) {
        analysis.url_patterns[pattern].successful++;
      } else {
        analysis.url_patterns[pattern].failed++;
      }
    }

    return analysis;
  }

  /**
   * Generate CSV report for spreadsheet analysis
   */
  async generateCSVReport() {
    const csvLines = ['url,success,status_code,error_category,canonicalized,resolved_url,response_time_ms'];
    
    for (const result of this.results.detailed_results) {
      const line = [
        result.url,
        result.success,
        result.result?.response?.status || result.errorDetails?.status || '',
        result.errorCategory || '',
        !!(result.result?.canonicalizationResult?.success || result.errorDetails?.canonicalizationResult?.success),
        result.errorDetails?.resolvedUrl || result.url,
        result.processingTime || ''
      ].join(',');
      
      csvLines.push(line);
    }

    const csvPath = path.join(this.options.outputDir, 'd2p-replay-results.csv');
    await fs.writeFile(csvPath, csvLines.join('\n'));
    console.log(`📊 CSV report: ${csvPath}`);
  }

  /**
   * Generate markdown summary
   */
  async generateMarkdownSummary(reportData) {
    const md = `# D2P Buyers Guide Replay Script Results

## Summary

- **Total URLs Processed**: ${reportData.summary.total_processed}
- **Successful**: ${reportData.summary.successful} (${Math.round(reportData.summary.successful / reportData.summary.total_processed * 100)}%)
- **Failed**: ${reportData.summary.failed} (${Math.round(reportData.summary.failed / reportData.summary.total_processed * 100)}%)
- **Canonicalized**: ${reportData.summary.canonicalized}
- **Robots Blocked**: ${reportData.summary.robots_blocked}
- **Duration**: ${Math.round(reportData.metadata.duration_ms / 1000)}s

## Key Achievements

${reportData.summary.error_categories.unknown === 0 ? 
  '✅ **ZERO UNKNOWN ERRORS** - All failures properly categorized!' : 
  `⚠️ Still have ${reportData.summary.error_categories.unknown} unknown errors`}

${reportData.summary.canonicalized > 0 ? 
  `✅ **URL CANONICALIZATION WORKING** - ${reportData.summary.canonicalized} URLs successfully normalized!` : 
  '❌ No successful URL canonicalizations'}

## Error Categories

${Object.entries(reportData.summary.error_categories)
  .map(([category, count]) => `- **${category}**: ${count}`)
  .join('\n')}

## URL Pattern Analysis

${Object.entries(reportData.error_analysis.url_patterns)
  .map(([pattern, stats]) => 
    `- **${pattern}**: ${stats.successful}/${stats.total} successful (${Math.round(stats.successful/stats.total*100)}%)`
  ).join('\n')}

## Configuration

- Concurrency: ${reportData.metadata.configuration.concurrency}
- Timeout: ${reportData.metadata.configuration.timeout}ms
- URL Normalization: ${reportData.metadata.configuration.enableNormalization ? 'Enabled' : 'Disabled'}
- Pagination Discovery: ${reportData.metadata.configuration.enablePaginationDiscovery ? 'Enabled' : 'Disabled'}
- Rate Limit: ${reportData.metadata.configuration.rateLimitRPS} RPS

Generated on ${reportData.metadata.timestamp}
`;

    const mdPath = path.join(this.options.outputDir, 'README.md');
    await fs.writeFile(mdPath, md);
    console.log(`📝 Markdown summary: ${mdPath}`);
  }

  /**
   * Generate error report
   */
  async generateErrorReport(error) {
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      configuration: this.options,
      partial_results: this.results
    };

    const errorPath = path.join(this.options.outputDir, 'error-report.json');
    await fs.writeFile(errorPath, JSON.stringify(errorReport, null, 2));
    console.log(`💥 Error report: ${errorPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    
    if (key && value !== undefined) {
      // Convert string values to appropriate types
      if (value === 'true') options[key] = true;
      else if (value === 'false') options[key] = false;
      else if (!isNaN(value)) options[key] = Number(value);
      else options[key] = value;
    }
  }

  try {
    const script = new D2PReplayScript(options);
    await script.run();
    
    console.log('');
    console.log('🎉 Replay completed successfully!');
    console.log(`📂 Check results in: ${script.options.outputDir}`);
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Replay failed:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = { D2PReplayScript };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}