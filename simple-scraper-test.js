#!/usr/bin/env node

/**
 * Simple scraper test using basic fetch
 */

const URLCleanupTool = require('./url-cleanup-tool');

// Test URLs - mix of valid and corrupted
const testURLs = [
    // Valid URLs
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    'https://www.pro-football-reference.com/players/A/AlleJo00.htm',
    
    // Corrupted URLs (like in your image)
    'http://hwww.pro-football-reference.com/players/K/KelcTr00.htm',
    'http://hwww.http://hwww.pro-football-reference.com/players/D/DaviTe00.htm',
    'https://www.www.pro-football-reference.com/players/S/SmitEm00.htm',
    
    // Invalid URLs
    'invalid-url',
    'https://www.espn.com/nfl/player/123', // Wrong domain
];

async function testSimpleScraping() {
    console.log('🔧 Simple Scraper Test with URL Cleanup\n');
    
    // Step 1: Clean the URLs
    console.log('Step 1: Cleaning URLs...');
    const cleanupTool = new URLCleanupTool();
    const cleanupResults = cleanupTool.processURLs(testURLs);
    
    console.log(`✅ Cleaned ${cleanupResults.summary.successfullyCleaned} URLs`);
    console.log(`❌ ${cleanupResults.summary.stillInvalid} URLs still invalid\n`);
    
    // Step 2: Test scraping with cleaned URLs
    console.log('Step 2: Testing scraping with cleaned URLs...');
    
    const validUrls = cleanupResults.cleaned.map(item => item.cleaned);
    
    for (let i = 0; i < Math.min(3, validUrls.length); i++) {
        const url = validUrls[i];
        console.log(`\nTesting URL ${i + 1}: ${url}`);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000
            });
            
            if (response.ok) {
                const content = await response.text();
                console.log(`✅ Success! Status: ${response.status}, Content length: ${content.length} chars`);
                
                // Check if it looks like a valid page
                if (content.includes('pro-football-reference') || content.includes('player')) {
                    console.log('✅ Content looks valid');
                } else {
                    console.log('⚠️  Content might not be what we expected');
                }
            } else {
                console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.log(`❌ Request failed: ${error.message}`);
        }
    }
    
    // Step 3: Show summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total URLs processed: ${testURLs.length}`);
    console.log(`Successfully cleaned: ${cleanupResults.summary.successfullyCleaned}`);
    console.log(`Ready for scraping: ${validUrls.length}`);
    
    if (cleanupResults.summary.stillInvalid > 0) {
        console.log('\n⚠️  URLs that couldn\'t be fixed:');
        cleanupResults.invalid.forEach(item => {
            console.log(`   - ${item.original}: ${item.error}`);
        });
    }
    
    console.log('\n✅ Your URLs are now ready for scraping!');
    console.log('\nTo use with your scraper:');
    console.log('1. Save the cleaned URLs to a file');
    console.log('2. Use them with your BatchProcessor');
    console.log('3. Start with a small batch to test');
    
    return validUrls;
}

// Run the test
if (require.main === module) {
    testSimpleScraping().catch(console.error);
}

module.exports = { testSimpleScraping };