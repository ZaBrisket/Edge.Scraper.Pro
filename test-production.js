// Production testing script for EdgeScraperPro
// Run this in browser console at https://edgescraperpro.com

async function testProduction() {
    console.log('Testing EdgeScraperPro Production...');
    
    // Test 1: API endpoint
    try {
        const testUrl = 'https://example.com';
        const response = await fetch(`/.netlify/functions/fetch-url?url=${encodeURIComponent(testUrl)}`, {
            headers: {
                'X-API-Key': 'public-2024'
            }
        });
        const data = await response.json();
        console.log('API Test:', data.ok ? '✅ PASS' : '❌ FAIL');
        if (!data.ok) console.log('API Error:', data.error);
    } catch (error) {
        console.log('API Test: ❌ FAIL -', error.message);
    }
    
    // Test 2: Content extraction
    try {
        const html = '<div id="content"><h1>Test Player</h1><p>Test content here</p></div>';
        if (typeof SportsExtractor !== 'undefined') {
            const extractor = new SportsExtractor();
            const result = extractor.extractContent(html, 'https://example.com');
            console.log('Extraction Test:', result.contentLength > 0 ? '✅ PASS' : '❌ FAIL');
            console.log('Content length:', result.contentLength);
        } else {
            console.log('Extraction Test: ❌ FAIL - SportsExtractor not found');
        }
    } catch (error) {
        console.log('Extraction Test: ❌ FAIL -', error.message);
    }
    
    // Test 3: URL validation
    try {
        if (typeof EnhancedUrlValidator !== 'undefined') {
            const validator = new EnhancedUrlValidator();
            const pfrUrl = 'https://www.pro-football-reference.com/players/M/MahoPa00.htm';
            const isValid = validator.validate(pfrUrl);
            console.log('Validation Test:', isValid ? '✅ PASS' : '❌ FAIL');
        } else {
            console.log('Validation Test: ❌ FAIL - EnhancedUrlValidator not found');
        }
    } catch (error) {
        console.log('Validation Test: ❌ FAIL -', error.message);
    }
    
    // Test 4: Sports mode functionality
    try {
        const sportsModeCheckbox = document.getElementById('sportsMode');
        if (sportsModeCheckbox) {
            sportsModeCheckbox.checked = true;
            console.log('Sports Mode Test: ✅ PASS - Checkbox found and enabled');
        } else {
            console.log('Sports Mode Test: ❌ FAIL - Checkbox not found');
        }
    } catch (error) {
        console.log('Sports Mode Test: ❌ FAIL -', error.message);
    }
    
    console.log('Testing complete!');
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
    testProduction();
} else {
    console.log('Run testProduction() in browser console');
}