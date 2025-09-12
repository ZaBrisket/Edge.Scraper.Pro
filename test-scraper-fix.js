#!/usr/bin/env node

/**
 * Test script to verify scraper works with properly formatted URLs
 */

const { PFRValidator } = require('./src/lib/pfr-validator');
const URLCleanupTool = require('./url-cleanup-tool');

// Test URLs - mix of valid and corrupted
const testURLs = [
    // Valid URLs
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    'https://www.pro-football-reference.com/players/A/AlleJo00.htm',
    'https://www.thomasnet.com/suppliers/12345',
    
    // Corrupted URLs (like in your image)
    'http://hwww.pro-football-reference.com/players/K/KelcTr00.htm',
    'http://hwww.http://hwww.pro-football-reference.com/players/D/DaviTe00.htm',
    'https://www.www.pro-football-reference.com/players/S/SmitEm00.htm',
    
    // Invalid URLs
    'invalid-url',
    'https://www.espn.com/nfl/player/123', // Wrong domain
    'https://www.pro-football-reference.com/teams/kan/2023.htm' // Non-player page
];

async function testScraperFix() {
    console.log('🔧 Testing Scraper Fix with URL Cleanup\n');
    
    // Step 1: Clean the URLs
    console.log('Step 1: Cleaning URLs...');
    const cleanupTool = new URLCleanupTool();
    const cleanupResults = cleanupTool.processURLs(testURLs);
    
    console.log(`✅ Cleaned ${cleanupResults.summary.successfullyCleaned} URLs`);
    console.log(`❌ ${cleanupResults.summary.stillInvalid} URLs still invalid`);
    console.log(`🔄 ${cleanupResults.summary.duplicatesFound} duplicates found\n`);
    
    // Step 2: Validate the cleaned URLs
    console.log('Step 2: Validating cleaned URLs...');
    const validator = new PFRValidator();
    const validUrls = cleanupResults.cleaned.map(item => item.cleaned);
    const validationResults = validator.validateBatch(validUrls);
    
    console.log(`✅ ${validationResults.summary.validCount} valid URLs`);
    console.log(`❌ ${validationResults.summary.invalidCount} invalid URLs`);
    console.log(`🔄 ${validationResults.summary.duplicateCount} duplicates\n`);
    
    // Step 3: Show the final clean URLs ready for scraping
    console.log('Step 3: URLs ready for scraping:');
    validationResults.valid.forEach((item, index) => {
        console.log(`${index + 1}. ${item.normalized}`);
    });
    
    // Step 4: Test a single URL with the actual scraper
    if (validationResults.valid.length > 0) {
        console.log('\nStep 4: Testing actual scraping...');
        const testUrl = validationResults.valid[0].normalized;
        
        try {
            // Import the fetch client
            const { fetchWithPolicy } = require('./src/lib/http/simple-enhanced-client');
            
            console.log(`Testing: ${testUrl}`);
            const response = await fetchWithPolicy(testUrl, { timeout: 10000 });
            
            if (response.ok) {
                const content = await response.text();
                console.log(`✅ Success! Got ${content.length} characters`);
                console.log(`📊 Status: ${response.status}`);
                console.log(`🌐 Content-Type: ${response.headers.get('content-type')}`);
            } else {
                console.log(`❌ HTTP Error: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ Scraping failed: ${error.message}`);
        }
    }
    
    // Step 5: Generate recommendations
    console.log('\nStep 5: Recommendations:');
    
    if (cleanupResults.summary.stillInvalid > 0) {
        console.log('⚠️  Some URLs couldn\'t be fixed:');
        cleanupResults.invalid.forEach(item => {
            console.log(`   - ${item.original}: ${item.error}`);
        });
    }
    
    if (validationResults.summary.duplicateCount > 0) {
        console.log('⚠️  Remove duplicate URLs before scraping');
    }
    
    console.log('\n✅ Your scraper should now work with the cleaned URLs!');
    console.log('\nNext steps:');
    console.log('1. Save the cleaned URLs to a file');
    console.log('2. Use them with your BatchProcessor');
    console.log('3. Monitor the scraping progress');
    
    return {
        cleanupResults,
        validationResults,
        readyForScraping: validationResults.valid.map(item => item.normalized)
    };
}

// Run the test
if (require.main === module) {
    testScraperFix().catch(console.error);
}

module.exports = { testScraperFix };