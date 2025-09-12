#!/usr/bin/env node

/**
 * Test timeout functionality
 */

const URLCleanupTool = require('./url-cleanup-tool');

// Test with a very short timeout to trigger timeout errors
const testURLs = [
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    'https://httpbin.org/delay/5' // This will take 5 seconds, should timeout
];

async function testTimeout() {
    console.log('🧪 Testing timeout functionality...\n');
    
    // Clean URLs
    const cleanupTool = new URLCleanupTool();
    const cleanupResults = cleanupTool.processURLs(testURLs);
    const validUrls = cleanupResults.cleaned.map(item => item.cleaned);
    
    console.log(`Testing ${validUrls.length} URLs with 2-second timeout...\n`);
    
    // Test with 2-second timeout
    const timeout = 2000;
    
    for (const url of validUrls) {
        console.log(`Testing: ${url}`);
        
        try {
            // Create a promise that rejects after timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout);
            });
            
            // Create the fetch promise
            const fetchPromise = fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            // Race between fetch and timeout
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (response.ok) {
                const content = await response.text();
                console.log(`✅ Success: ${response.status} (${content.length} chars)`);
            } else {
                console.log(`❌ HTTP Error: ${response.status}`);
            }
        } catch (error) {
            if (error.message.includes('timeout')) {
                console.log(`⏰ Timeout: ${error.message}`);
            } else {
                console.log(`❌ Error: ${error.message}`);
            }
        }
        
        console.log('');
    }
}

if (require.main === module) {
    testTimeout().catch(console.error);
}