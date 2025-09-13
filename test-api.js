// Quick test to verify the API endpoints work

async function testAPI() {
    console.log('Testing EdgeScraperPro API...\n');
    
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    try {
        const healthResponse = await fetch('http://localhost:8888/.netlify/functions/health');
        const healthData = await healthResponse.json();
        console.log('✅ Health check:', healthData);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
    }
    
    // Test 2: Fetch URL
    console.log('\n2. Testing fetch-url endpoint...');
    const testUrl = 'https://example.com';
    try {
        const response = await fetch(`http://localhost:8888/.netlify/functions/fetch-url?url=${encodeURIComponent(testUrl)}`, {
            headers: {
                'X-API-Key': 'public-2024'
            }
        });
        const data = await response.json();
        if (data.ok) {
            console.log('✅ Fetch URL successful');
            console.log(`   - URL: ${data.data.url}`);
            console.log(`   - Content length: ${data.contentLength} bytes`);
        } else {
            console.log('❌ Fetch URL failed:', data.error);
        }
    } catch (error) {
        console.log('❌ Fetch URL error:', error.message);
    }
    
    console.log('\n✅ API test complete!');
}

// Run if this is the main module
if (require.main === module) {
    testAPI().catch(console.error);
}

module.exports = { testAPI };