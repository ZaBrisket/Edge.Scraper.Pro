#!/usr/bin/env node

/**
 * Complete solution: Fix malformed URLs and scrape them
 * 
 * This script addresses the "Job failed: Failed to start job" error by:
 * 1. Cleaning malformed URLs (fixing "http://hwww" patterns)
 * 2. Validating the cleaned URLs
 * 3. Scraping them successfully
 */

const fs = require('fs');
const URLCleanupTool = require('./url-cleanup-tool');

// Simple scraper class
class SimpleScraper {
    constructor(options = {}) {
        this.concurrency = options.concurrency || 2;
        this.delayMs = options.delayMs || 1000;
        this.timeout = options.timeout || 30000;
        this.results = [];
        this.errors = [];
    }

    async scrapeURL(url) {
        try {
            console.log(`Scraping: ${url}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const content = await response.text();
                const result = {
                    url,
                    success: true,
                    status: response.status,
                    contentLength: content.length,
                    timestamp: new Date().toISOString(),
                    content: content.substring(0, 1000) + '...' // First 1000 chars for preview
                };
                
                this.results.push(result);
                console.log(`✅ Success: ${response.status} (${content.length} chars)`);
                return result;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            const errorResult = {
                url,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            
            this.errors.push(errorResult);
            console.log(`❌ Failed: ${error.message}`);
            return errorResult;
        }
    }

    async scrapeBatch(urls) {
        console.log(`\n🚀 Starting batch scraping of ${urls.length} URLs...`);
        console.log(`Settings: concurrency=${this.concurrency}, delay=${this.delayMs}ms, timeout=${this.timeout}ms\n`);
        
        const startTime = Date.now();
        
        // Process URLs in batches
        for (let i = 0; i < urls.length; i += this.concurrency) {
            const batch = urls.slice(i, i + this.concurrency);
            console.log(`\n📦 Processing batch ${Math.floor(i / this.concurrency) + 1}/${Math.ceil(urls.length / this.concurrency)}`);
            
            // Process batch concurrently
            await Promise.all(batch.map(url => this.scrapeURL(url)));
            
            // Delay between batches
            if (i + this.concurrency < urls.length && this.delayMs > 0) {
                console.log(`⏳ Waiting ${this.delayMs}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, this.delayMs));
            }
        }
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Generate summary
        const summary = {
            totalUrls: urls.length,
            successful: this.results.length,
            failed: this.errors.length,
            successRate: ((this.results.length / urls.length) * 100).toFixed(1),
            duration: `${(duration / 1000).toFixed(1)}s`,
            averageTimePerUrl: `${(duration / urls.length).toFixed(0)}ms`
        };
        
        console.log('\n📊 SCRAPING SUMMARY');
        console.log('==================');
        console.log(`Total URLs: ${summary.totalUrls}`);
        console.log(`Successful: ${summary.successful} (${summary.successRate}%)`);
        console.log(`Failed: ${summary.failed}`);
        console.log(`Duration: ${summary.duration}`);
        console.log(`Avg time per URL: ${summary.averageTimePerUrl}`);
        
        if (this.errors.length > 0) {
            console.log('\n❌ FAILED URLS:');
            this.errors.forEach(error => {
                console.log(`   ${error.url}: ${error.error}`);
            });
        }
        
        return {
            results: this.results,
            errors: this.errors,
            summary
        };
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Fix and Scrape Tool

This tool fixes malformed URLs and scrapes them successfully.

Usage:
  node fix-and-scrape.js <input-file> [options]

Examples:
  node fix-and-scrape.js urls.txt
  node fix-and-scrape.js urls.txt --concurrency 1 --delay 2000
  node fix-and-scrape.js --demo

Options:
  --concurrency N    Number of concurrent requests (default: 2)
  --delay N          Delay between batches in ms (default: 1000)
  --timeout N        Request timeout in ms (default: 30000)
  --demo             Run with demo URLs
  --output FILE      Save results to file (default: results.json)
        `);
        process.exit(1);
    }

    // Parse arguments
    const inputFile = args[0];
    const options = {
        concurrency: 2,
        delayMs: 1000,
        timeout: 30000,
        output: 'results.json'
    };
    
    for (let i = 1; i < args.length; i += 2) {
        const flag = args[i];
        const value = args[i + 1];
        
        switch (flag) {
            case '--concurrency':
                options.concurrency = parseInt(value);
                break;
            case '--delay':
                options.delayMs = parseInt(value);
                break;
            case '--timeout':
                options.timeout = parseInt(value);
                break;
            case '--output':
                options.output = value;
                break;
        }
    }

    try {
        let urls;
        
        if (inputFile === '--demo') {
            // Demo with sample URLs
            console.log('🎯 Running demo with sample URLs...\n');
            urls = [
                'http://hwww.pro-football-reference.com/players/M/MahoPa00.htm',
                'http://hwww.http://hwww.pro-football-reference.com/players/A/AlleJo00.htm',
                'https://www.www.pro-football-reference.com/players/K/KelcTr00.htm',
                'https://www.pro-football-reference.com/players/S/SmitEm00.htm',
                'invalid-url',
                'https://www.thomasnet.com/suppliers/12345'
            ];
        } else {
            // Load URLs from file
            console.log(`📁 Loading URLs from: ${inputFile}`);
            const content = fs.readFileSync(inputFile, 'utf8');
            urls = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        }
        
        console.log(`Found ${urls.length} URLs to process\n`);
        
        // Step 1: Clean URLs
        console.log('🧹 Step 1: Cleaning malformed URLs...');
        const cleanupTool = new URLCleanupTool();
        const cleanupResults = cleanupTool.processURLs(urls);
        
        console.log(`✅ Cleaned: ${cleanupResults.summary.successfullyCleaned}`);
        console.log(`❌ Invalid: ${cleanupResults.summary.stillInvalid}`);
        console.log(`🔄 Duplicates: ${cleanupResults.summary.duplicatesFound}\n`);
        
        if (cleanupResults.summary.stillInvalid > 0) {
            console.log('⚠️  URLs that couldn\'t be fixed:');
            cleanupResults.invalid.forEach(item => {
                console.log(`   ${item.original}: ${item.error}`);
            });
            console.log('');
        }
        
        // Step 2: Scrape cleaned URLs
        const validUrls = cleanupResults.cleaned.map(item => item.cleaned);
        
        if (validUrls.length === 0) {
            console.log('❌ No valid URLs to scrape!');
            process.exit(1);
        }
        
        console.log(`🚀 Step 2: Scraping ${validUrls.length} cleaned URLs...`);
        const scraper = new SimpleScraper(options);
        const results = await scraper.scrapeBatch(validUrls);
        
        // Step 3: Save results
        console.log(`\n💾 Saving results to: ${options.output}`);
        fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
        
        console.log('\n✅ Scraping completed successfully!');
        console.log(`📊 Success rate: ${results.summary.successRate}%`);
        console.log(`📁 Results saved to: ${options.output}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { SimpleScraper };