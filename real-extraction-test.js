#!/usr/bin/env node

/**
 * Real Content Extraction Test
 * Tests actual scraping and extraction with live URLs
 */

const { SportsContentExtractor } = require('./src/lib/sports-extractor');
const { fetchWithPolicy } = require('./src/lib/http/simple-enhanced-client');
const { JSDOM } = require('jsdom');

async function testRealExtraction() {
    console.log('🧪 REAL CONTENT EXTRACTION TEST');
    console.log('=' .repeat(50));
    
    const extractor = new SportsContentExtractor();
    const testUrls = [
        'https://www.pro-football-reference.com/players/T/TomlLa00.htm', // LaDainian Tomlinson
        'https://www.pro-football-reference.com/players/S/SmitEm00.htm',  // Emmitt Smith
        'https://www.pro-football-reference.com/players/R/RiceJe00.htm'   // Jerry Rice
    ];
    
    const results = [];
    
    for (const url of testUrls) {
        console.log(`\nTesting: ${url.split('/').pop()}`);
        console.log('-'.repeat(30));
        
        try {
            // Fetch the page
            const startFetch = Date.now();
            const response = await fetchWithPolicy(url, { timeout: 15000 });
            const fetchTime = Date.now() - startFetch;
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const html = await response.text();
            console.log(`✅ Fetched: ${html.length} chars in ${fetchTime}ms`);
            
            // Parse and extract
            const startExtract = Date.now();
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            
            const extractionResult = extractor.extractSportsContent(doc, url);
            const extractTime = Date.now() - startExtract;
            
            console.log(`✅ Extracted: ${extractionResult.content.length} chars in ${extractTime}ms`);
            console.log(`   Method: ${extractionResult.method}`);
            console.log(`   Score: ${extractionResult.score}`);
            console.log(`   Sports Valid: ${extractionResult.sportsValidation.isValid} (${extractionResult.sportsValidation.score}/6)`);
            
            // Analyze structured data
            const player = extractionResult.structuredData.player;
            const stats = extractionResult.structuredData.statistics;
            
            console.log(`   Player Name: ${player.name || 'Not found'}`);
            console.log(`   Position: ${player.position || 'Not found'}`);
            console.log(`   College: ${player.college || 'Not found'}`);
            console.log(`   Career Stats: ${Object.keys(stats.career || {}).length} fields`);
            console.log(`   Season Stats: ${(stats.seasons || []).length} seasons`);
            console.log(`   Achievements: ${(extractionResult.structuredData.achievements || []).length} found`);
            
            results.push({
                url,
                success: true,
                fetchTime,
                extractTime,
                contentLength: extractionResult.content.length,
                score: extractionResult.score,
                sportsValidation: extractionResult.sportsValidation,
                playerData: {
                    name: player.name,
                    position: player.position,
                    college: player.college,
                    careerStatsFields: Object.keys(stats.career || {}).length,
                    seasonCount: (stats.seasons || []).length,
                    achievementCount: (extractionResult.structuredData.achievements || []).length
                }
            });
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            results.push({
                url,
                success: false,
                error: error.message
            });
        }
    }
    
    // Summary
    console.log('\n📊 EXTRACTION TEST SUMMARY');
    console.log('=' .repeat(50));
    
    const successful = results.filter(r => r.success);
    const successRate = (successful.length / results.length) * 100;
    
    console.log(`Success Rate: ${successRate.toFixed(1)}% (${successful.length}/${results.length})`);
    
    if (successful.length > 0) {
        const avgFetchTime = successful.reduce((sum, r) => sum + r.fetchTime, 0) / successful.length;
        const avgExtractTime = successful.reduce((sum, r) => sum + r.extractTime, 0) / successful.length;
        const avgContentLength = successful.reduce((sum, r) => sum + r.contentLength, 0) / successful.length;
        const avgScore = successful.reduce((sum, r) => sum + r.score, 0) / successful.length;
        const sportsValidCount = successful.filter(r => r.sportsValidation.isValid).length;
        
        console.log(`Average Fetch Time: ${avgFetchTime.toFixed(0)}ms`);
        console.log(`Average Extract Time: ${avgExtractTime.toFixed(0)}ms`);
        console.log(`Average Content Length: ${avgContentLength.toFixed(0)} chars`);
        console.log(`Average Extraction Score: ${avgScore.toFixed(1)}`);
        console.log(`Sports Validation Rate: ${((sportsValidCount / successful.length) * 100).toFixed(1)}%`);
        
        console.log('\nPlayer Data Extraction:');
        successful.forEach((result, index) => {
            const player = result.playerData;
            console.log(`  ${index + 1}. ${player.name || 'Unknown'} (${player.position || 'Unknown'})`);
            console.log(`     College: ${player.college || 'Not found'}`);
            console.log(`     Career Stats: ${player.careerStatsFields} fields`);
            console.log(`     Seasons: ${player.seasonCount}`);
            console.log(`     Achievements: ${player.achievementCount}`);
        });
    }
    
    return results;
}

if (require.main === module) {
    testRealExtraction().catch(console.error);
}

module.exports = { testRealExtraction };