#!/usr/bin/env node

/**
 * URL Cleanup and Validation Tool
 * 
 * This tool helps fix malformed URLs that are causing scraping failures.
 * It can detect and fix common URL corruption patterns like "http://hwww" repetitions.
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class URLCleanupTool {
    constructor() {
        this.validDomains = [
            'pro-football-reference.com',
            'basketball-reference.com', 
            'baseball-reference.com',
            'hockey-reference.com',
            'sports-reference.com',
            'thomasnet.com',
            'globalspec.com',
            'd2pbuyersguide.com'
        ];
        
        this.corrections = {
            'hwww': 'www',
            'http://http://': 'http://',
            'https://https://': 'https://',
            'www.www.': 'www.',
            'com.com': 'com'
        };
    }

    /**
     * Clean a single URL by fixing common corruption patterns
     */
    cleanURL(url) {
        if (!url || typeof url !== 'string') {
            return { original: url, cleaned: null, error: 'Invalid input' };
        }

        let cleaned = url.trim();
        const original = cleaned;

        // Fix common corruption patterns
        for (const [corrupted, fixed] of Object.entries(this.corrections)) {
            while (cleaned.includes(corrupted)) {
                cleaned = cleaned.replace(corrupted, fixed);
            }
        }

        // Remove duplicate protocol
        cleaned = cleaned.replace(/^(https?:\/\/)+/, 'https://');
        
        // Remove duplicate www
        cleaned = cleaned.replace(/www\.www\./g, 'www.');
        
        // Remove trailing slashes and normalize
        cleaned = cleaned.replace(/\/+$/, '');
        
        // Ensure protocol
        if (!cleaned.match(/^https?:\/\//)) {
            cleaned = 'https://' + cleaned;
        }

        return {
            original,
            cleaned,
            error: null
        };
    }

    /**
     * Validate if a URL is properly formatted
     */
    validateURL(url) {
        try {
            const urlObj = new URL(url);
            
            // Check protocol
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return { valid: false, error: 'Invalid protocol' };
            }

            // Check domain
            const hostname = urlObj.hostname.toLowerCase().replace('www.', '');
            if (!this.validDomains.some(domain => hostname.includes(domain))) {
                return { valid: false, error: 'Unsupported domain' };
            }

            return { valid: true, error: null };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Process a list of URLs and return cleaned versions
     */
    processURLs(urls) {
        const results = {
            total: urls.length,
            cleaned: [],
            invalid: [],
            duplicates: new Set(),
            summary: {
                totalProcessed: 0,
                successfullyCleaned: 0,
                stillInvalid: 0,
                duplicatesFound: 0
            }
        };

        const seen = new Set();

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            results.summary.totalProcessed++;

            // Clean the URL
            const cleaned = this.cleanURL(url);
            
            if (!cleaned.cleaned) {
                results.invalid.push({
                    index: i,
                    original: url,
                    error: cleaned.error
                });
                results.summary.stillInvalid++;
                continue;
            }

            // Validate the cleaned URL
            const validation = this.validateURL(cleaned.cleaned);
            
            if (!validation.valid) {
                results.invalid.push({
                    index: i,
                    original: url,
                    cleaned: cleaned.cleaned,
                    error: validation.error
                });
                results.summary.stillInvalid++;
                continue;
            }

            // Check for duplicates
            if (seen.has(cleaned.cleaned)) {
                results.duplicates.add(cleaned.cleaned);
                results.summary.duplicatesFound++;
            } else {
                seen.add(cleaned.cleaned);
            }

            results.cleaned.push({
                index: i,
                original: url,
                cleaned: cleaned.cleaned,
                wasChanged: url !== cleaned.cleaned
            });
            results.summary.successfullyCleaned++;
        }

        return results;
    }

    /**
     * Load URLs from a file
     */
    loadURLsFromFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const urls = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            return urls;
        } catch (error) {
            throw new Error(`Failed to load URLs from file: ${error.message}`);
        }
    }

    /**
     * Save cleaned URLs to a file
     */
    saveURLsToFile(urls, filePath) {
        try {
            const content = urls.join('\n');
            fs.writeFileSync(filePath, content, 'utf8');
            return true;
        } catch (error) {
            throw new Error(`Failed to save URLs to file: ${error.message}`);
        }
    }

    /**
     * Generate a detailed report
     */
    generateReport(results) {
        const report = [];
        
        report.push('=== URL Cleanup Report ===');
        report.push(`Total URLs processed: ${results.summary.totalProcessed}`);
        report.push(`Successfully cleaned: ${results.summary.successfullyCleaned}`);
        report.push(`Still invalid: ${results.summary.stillInvalid}`);
        report.push(`Duplicates found: ${results.summary.duplicatesFound}`);
        report.push('');

        if (results.cleaned.length > 0) {
            report.push('=== CLEANED URLS ===');
            results.cleaned.forEach(item => {
                if (item.wasChanged) {
                    report.push(`${item.index + 1}. CHANGED:`);
                    report.push(`   Original: ${item.original}`);
                    report.push(`   Cleaned:  ${item.cleaned}`);
                } else {
                    report.push(`${item.index + 1}. OK: ${item.cleaned}`);
                }
            });
            report.push('');
        }

        if (results.invalid.length > 0) {
            report.push('=== INVALID URLS ===');
            results.invalid.forEach(item => {
                report.push(`${item.index + 1}. ${item.original}`);
                if (item.cleaned) {
                    report.push(`   Cleaned: ${item.cleaned}`);
                }
                report.push(`   Error: ${item.error}`);
            });
            report.push('');
        }

        if (results.duplicates.size > 0) {
            report.push('=== DUPLICATE URLS ===');
            Array.from(results.duplicates).forEach(url => {
                report.push(`- ${url}`);
            });
        }

        return report.join('\n');
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
URL Cleanup Tool

Usage:
  node url-cleanup-tool.js <input-file> [output-file]

Examples:
  node url-cleanup-tool.js urls.txt
  node url-cleanup-tool.js urls.txt cleaned-urls.txt
  node url-cleanup-tool.js --test

Options:
  --test    Run with sample corrupted URLs for testing
        `);
        process.exit(1);
    }

    const tool = new URLCleanupTool();

    if (args[0] === '--test') {
        // Test with sample corrupted URLs
        const testURLs = [
            'http://hwww.pro-football-reference.com/players/M/MahoPa00.htm',
            'http://hwww.http://hwww.pro-football-reference.com/players/A/AlleJo00.htm',
            'https://www.www.pro-football-reference.com/players/K/KelcTr00.htm',
            'http://hwww.thomasnet.com/suppliers/12345',
            'invalid-url',
            'https://www.pro-football-reference.com/players/M/MahoPa00.htm', // Valid
            'https://www.pro-football-reference.com/players/M/MahoPa00.htm'  // Duplicate
        ];

        console.log('Testing with sample URLs...\n');
        const results = tool.processURLs(testURLs);
        console.log(tool.generateReport(results));
        
        if (results.cleaned.length > 0) {
            console.log('\nCleaned URLs ready for scraping:');
            results.cleaned.forEach(item => {
                console.log(item.cleaned);
            });
        }
        
        return;
    }

    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace(/\.(txt|json)$/, '-cleaned.txt');

    try {
        console.log(`Loading URLs from: ${inputFile}`);
        const urls = tool.loadURLsFromFile(inputFile);
        
        console.log(`Processing ${urls.length} URLs...`);
        const results = tool.processURLs(urls);
        
        console.log('\n' + tool.generateReport(results));
        
        if (results.cleaned.length > 0) {
            console.log(`\nSaving cleaned URLs to: ${outputFile}`);
            const cleanedURLs = results.cleaned.map(item => item.cleaned);
            tool.saveURLsToFile(cleanedURLs, outputFile);
            console.log('✅ Cleaned URLs saved successfully!');
        } else {
            console.log('❌ No valid URLs found to save.');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = URLCleanupTool;