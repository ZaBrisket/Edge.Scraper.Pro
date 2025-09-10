/**
 * Node.js test script for bulk upload functionality
 * This script tests the file parsing logic without browser APIs
 */

// Test data
const testFiles = {
    txt: `https://www.pro-football-reference.com/players/M/MahoPa00.htm
https://www.pro-football-reference.com/players/B/BradTo00.htm
https://www.pro-football-reference.com/players/R/RiceJe00.htm
https://example.com/page1
https://example.com/page2`,

    jsonArray: `[
  "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
  "https://www.pro-football-reference.com/players/B/BradTo00.htm",
  "https://www.pro-football-reference.com/players/R/RiceJe00.htm"
]`,

    jsonObject: `{
  "urls": [
    "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "https://www.pro-football-reference.com/players/B/BradTo00.htm",
    "https://www.pro-football-reference.com/players/R/RiceJe00.htm"
  ],
  "metadata": {
    "source": "Test",
    "date": "2024-01-01"
  }
}`,

    jsonObjects: `[
  {
    "url": "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "title": "Patrick Mahomes"
  },
  {
    "url": "https://www.pro-football-reference.com/players/B/BradTo00.htm",
    "title": "Tom Brady"
  }
]`,

    invalidJson: `{
  "urls": [
    "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "https://www.pro-football-reference.com/players/B/BradTo00.htm",
    "https://www.pro-football-reference.com/players/R/RiceJe00.htm"
  ],
  "metadata": {
    "source": "Test",
    "date": "2024-01-01"
  }`,

    emptyFile: ``,

    noValidUrls: `not a url
also not a url
still not a url`,

    tooManyUrls: Array(1501).fill('https://example.com/page').map((url, i) => `${url}${i}`).join('\n')
};

// Test cases
const testCases = [
    {
        name: 'TXT file with valid URLs',
        content: testFiles.txt,
        filename: 'test.txt',
        expectedUrls: 5,
        shouldPass: true
    },
    {
        name: 'JSON array format',
        content: testFiles.jsonArray,
        filename: 'test.json',
        expectedUrls: 3,
        shouldPass: true
    },
    {
        name: 'JSON object with URLs property',
        content: testFiles.jsonObject,
        filename: 'test.json',
        expectedUrls: 3,
        shouldPass: true
    },
    {
        name: 'JSON array of objects with URL property',
        content: testFiles.jsonObjects,
        filename: 'test.json',
        expectedUrls: 2,
        shouldPass: true
    },
    {
        name: 'Invalid JSON format',
        content: testFiles.invalidJson,
        filename: 'test.json',
        expectedUrls: 0,
        shouldPass: false
    },
    {
        name: 'Empty file',
        content: testFiles.emptyFile,
        filename: 'test.txt',
        expectedUrls: 0,
        shouldPass: false
    },
    {
        name: 'File with no valid URLs',
        content: testFiles.noValidUrls,
        filename: 'test.txt',
        expectedUrls: 0,
        shouldPass: false
    },
    {
        name: 'File with too many URLs',
        content: testFiles.tooManyUrls,
        filename: 'test.txt',
        expectedUrls: 1501,
        shouldPass: false
    }
];

// File parsing logic (Node.js compatible)
class FileParser {
    constructor() {
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.maxUrls = 1500;
        this.supportedExtensions = ['.txt', '.json'];
    }

    validateFile(filename, size) {
        if (size > this.maxFileSize) {
            return {
                valid: false,
                error: `File too large. Maximum size is ${this.maxFileSize / 1024 / 1024}MB`
            };
        }

        const extension = '.' + filename.split('.').pop().toLowerCase();
        if (!this.supportedExtensions.includes(extension)) {
            return {
                valid: false,
                error: 'Unsupported file type. Please upload a TXT or JSON file.'
            };
        }

        return { valid: true };
    }

    extractUrls(content, filename) {
        const extension = '.' + filename.split('.').pop().toLowerCase();
        
        if (extension === '.txt') {
            return this.extractUrlsFromTxt(content);
        } else if (extension === '.json') {
            return this.extractUrlsFromJson(content);
        }
        
        return [];
    }

    extractUrlsFromTxt(content) {
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => this.isValidUrl(line));
    }

    extractUrlsFromJson(content) {
        try {
            const data = JSON.parse(content);
            let urls = [];

            if (Array.isArray(data)) {
                // Handle mixed arrays by extracting URLs from both strings and objects
                const stringUrls = data.filter(item => typeof item === 'string' && this.isValidUrl(item));
                const objectUrls = data
                    .filter(item => item && typeof item === 'object' && item.url)
                    .map(item => item.url)
                    .filter(url => typeof url === 'string' && this.isValidUrl(url));
                
                urls = [...stringUrls, ...objectUrls];
            } else if (data.urls && Array.isArray(data.urls)) {
                urls = data.urls.filter(url => typeof url === 'string' && this.isValidUrl(url));
            }

            return urls;
        } catch (error) {
            throw new Error('Invalid JSON format');
        }
    }

    isValidUrl(string) {
        try {
            const url = new URL(string);
            return ['http:', 'https:'].includes(url.protocol);
        } catch {
            return false;
        }
    }

    parseFile(content, filename) {
        try {
            const urls = this.extractUrls(content, filename);
            
            if (urls.length === 0) {
                throw new Error('No valid URLs found in file');
            }

            if (urls.length > this.maxUrls) {
                throw new Error(`Too many URLs. Maximum ${this.maxUrls} allowed. Found ${urls.length}.`);
            }

            return { success: true, urls };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Run tests
async function runTests() {
    console.log('🧪 Starting bulk upload tests...\n');
    
    const fileParser = new FileParser();
    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        console.log(`Testing: ${testCase.name}`);
        
        try {
            // Validate file
            const validation = fileParser.validateFile(testCase.filename, testCase.content.length);
            if (!validation.valid) {
                if (testCase.shouldPass) {
                    console.log(`❌ FAILED: File validation failed - ${validation.error}`);
                    failed++;
                } else {
                    console.log(`✅ PASSED: File validation correctly rejected`);
                    passed++;
                }
                continue;
            }

            // Parse file
            const result = fileParser.parseFile(testCase.content, testCase.filename);
            
            if (testCase.shouldPass) {
                if (result.success && result.urls.length === testCase.expectedUrls) {
                    console.log(`✅ PASSED: Found ${result.urls.length} URLs as expected`);
                    passed++;
                } else {
                    console.log(`❌ FAILED: Expected ${testCase.expectedUrls} URLs, got ${result.success ? result.urls.length : 'error'}`);
                    if (!result.success) {
                        console.log(`   Error: ${result.error}`);
                    }
                    failed++;
                }
            } else {
                if (!result.success) {
                    console.log(`✅ PASSED: Correctly rejected - ${result.error}`);
                    passed++;
                } else {
                    console.log(`❌ FAILED: Should have been rejected but passed`);
                    failed++;
                }
            }
        } catch (error) {
            console.log(`❌ FAILED: Unexpected error - ${error.message}`);
            failed++;
        }
        
        console.log(''); // Empty line for readability
    }

    console.log(`\n📊 Test Results:`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
        console.log('\n🎉 All tests passed! The bulk upload feature is working correctly.');
    } else {
        console.log('\n⚠️  Some tests failed. Please review the implementation.');
    }
}

// Run tests
runTests().catch(console.error);