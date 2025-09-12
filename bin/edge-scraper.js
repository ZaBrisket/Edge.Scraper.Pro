#!/usr/bin/env node

// CommonJS CLI wrapper that uses compiled JS outputs
const path = require('path');
const fs = require('fs');
const { Command } = require('commander');

// Prefer compiled modules from dist
const { createLogger } = require('../dist/lib/logger');
const { BatchProcessor } = require('../dist/lib/batch-processor');
let SupplierDirectoryExtractor;
try {
  // our supplier-directory-extractor is authored in JS in src and copied to dist during build
  SupplierDirectoryExtractor = require('../dist/lib/supplier-directory-extractor').SupplierDirectoryExtractor;
} catch {
  // fallback to runtime path if build not run yet
  SupplierDirectoryExtractor = require('../src/lib/supplier-directory-extractor').SupplierDirectoryExtractor;
}
const { SupplierDataExporter } = require('../src/lib/supplier-export');
const { exportTriviaDataset } = require('../dist/exporters/trivia_v1');

const program = new Command();
const logger = createLogger('cli');

program
  .name('edge-scraper')
  .description('Edge.Scraper.Pro CLI tools')
  .version('2.0.0');

program
  .command('export')
  .description('Export data in various formats')
  .option('--mode <mode>', 'export mode', 'trivia_v1')
  .option('--input <path>', 'input file path', 'fixtures/raw/sports_structured_data.json')
  .option('--out <path>', 'output file path', 'build/dataset.trivia_v1.json')
  .option('--season-min <year>', 'minimum season year', '1997')
  .option('--season-max <year>', 'maximum season year', '2024')
  .option('--positions <positions>', 'comma-separated list of positions', 'QB,RB,WR,TE')
  .option('--require-G-min <games>', 'minimum games played', '1')
  .option('--drop-summary-rows', 'drop summary/aggregate rows', false)
  .option('--pretty', 'pretty print JSON output', false)
  .option('--strict', 'strict mode (fail on any error)', false)
  .option('--verbose', 'verbose output', false)
  .option('--no-validate', 'skip validation', false)
  .action(async (options) => {
    try {
      if (options.mode !== 'trivia_v1') {
        logger.error(`Unsupported export mode: ${options.mode}`);
        process.exit(1);
      }

      const exportOptions = {
        seasonMin: parseInt(options.seasonMin),
        seasonMax: parseInt(options.seasonMax),
        positions: String(options.positions).split(',').map(p => p.trim()),
        requireGMin: parseInt(options.requireGMin),
        dropSummaryRows: !!options.dropSummaryRows,
        pretty: !!options.pretty,
        strict: !!options.strict,
        verbose: !!options.verbose,
        validate: !options.noValidate,
      };

      const inputPath = path.resolve(options.input);
      const outputPath = path.resolve(options.out);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      await exportTriviaDataset(inputPath, outputPath, exportOptions);
      logger.info(`Successfully exported ${options.mode} dataset to ${outputPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Export failed', { error: errorMessage });
      if (options.verbose && error instanceof Error) {
        logger.error('Stack trace', { stack: error.stack });
      }
      process.exit(1);
    }
  });

program
  .command('scrape')
  .description('Scrape websites and extract data')
  .option('--urls <file>', 'file containing URLs to scrape (one per line)', 'urls.txt')
  .option('--mode <mode>', 'extraction mode', 'supplier-directory')
  .option('--output <file>', 'output file path', 'scraped-data.json')
  .option('--concurrency <number>', 'number of concurrent requests', '3')
  .option('--delay <ms>', 'delay between requests in milliseconds', '1000')
  .option('--timeout <ms>', 'request timeout in milliseconds', '30000')
  .option('--verbose', 'verbose output', false)
  .action(async (options) => {
    try {
      logger.info('🚀 Starting web scraping...');
      const urlsPath = path.resolve(options.urls);
      if (!fs.existsSync(urlsPath)) {
        logger.error(`URLs file not found: ${urlsPath}`);
        process.exit(1);
      }
      const urls = fs.readFileSync(urlsPath, 'utf8').split('\n').map(u => u.trim()).filter(Boolean);
      if (urls.length === 0) {
        logger.error('No URLs found in file');
        process.exit(1);
      }

      const processor = new BatchProcessor({
        concurrency: parseInt(options.concurrency),
        delayMs: parseInt(options.delay),
        timeout: parseInt(options.timeout),
        extractionMode: options.mode,
        onProgress: (progress) => {
          if (options.verbose) {
            logger.info(`Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`, {
              completed: progress.completed,
              total: progress.total,
              percentage: progress.percentage,
              errors: progress.errors,
            });
          }
        },
      });

      const startTime = Date.now();
      const result = await processor.processBatch(urls);
      const duration = Date.now() - startTime;

      const outputPath = path.resolve(options.output);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const exporter = new SupplierDataExporter();
      const ext = path.extname(outputPath).toLowerCase();
      if (ext === '.csv') {
        exporter.exportBatchResults(result, outputPath, { pretty: false });
      } else {
        exporter.exportBatchResults(result, outputPath, { pretty: true });
      }

      const summaryPath = outputPath.replace(/\.[^.]+$/, '-summary.json');
      exporter.createSummaryReport(result, summaryPath);

      logger.info('📊 Scraping Complete!', {
        totalUrls: result.stats.totalUrls,
        processedUrls: result.stats.processedUrls,
        successfulUrls: result.stats.successfulUrls,
        failedUrls: result.stats.failedUrls,
        duration: Math.round(duration / 1000),
        resultsPath: outputPath,
        summaryPath: summaryPath,
      });
      if (result.stats.failedUrls > 0) {
        logger.warn(`⚠️  ${result.stats.failedUrls} URLs failed. Check the summary report for details.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Scraping failed', { error: errorMessage });
      if (options.verbose && error instanceof Error) {
        logger.error('Stack trace', { stack: error.stack });
      }
      process.exit(1);
    }
  });

program.parse();

