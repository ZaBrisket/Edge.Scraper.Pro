/**
 * Test script for bulk upload functionality
 * This script tests the file upload feature with various file formats and edge cases
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

// FileUploadHandler class for testing
class FileUploadHandler {
    constructor() {
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.maxUrls = 1500;
        this.supportedExtensions = ['.txt', '.json'];
    }

    validateFile(file) {
        if (file.size > this.maxFileSize) {
            return {
                valid: false,
                error: `File too large. Maximum size is ${this.maxFileSize / 1024 / 1024}MB`
            };
        }

        const extension = '.' + file.name.split('.').pop().toLowerCase();
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
                urls = data.filter(item => typeof item === 'string' && this.isValidUrl(item));
            } else if (data.urls && Array.isArray(data.urls)) {
                urls = data.urls.filter(url => typeof url === 'string' && this.isValidUrl(url));
            } else if (Array.isArray(data) && data.every(item => typeof item === 'object' && item.url)) {
                urls = data
                    .map(item => item.url)
                    .filter(url => typeof url === 'string' && this.isValidUrl(url));
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

    async parseFile(file) {
        try {
            const content = await this.readFileContent(file);
            const urls = this.extractUrls(content, file.name);
            
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

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    resolve(content);
                } catch (error) {
                    reject(new Error('Failed to process file content'));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.onabort = () => {
                reject(new Error('File reading was aborted'));
            };
            
            reader.readAsText(file, 'UTF-8');
        });
    }
}

// Run tests
async function runTests() {
    console.log('🧪 Starting bulk upload tests...\n');
    
    const fileUploadHandler = new FileUploadHandler();
    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        console.log(`Testing: ${testCase.name}`);
        
        try {
            // Create a mock file object
            const file = new File([testCase.content], testCase.filename, {
                type: testCase.filename.endsWith('.json') ? 'application/json' : 'text/plain'
            });

            // Validate file
            const validation = fileUploadHandler.validateFile(file);
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
            const result = await fileUploadHandler.parseFile(file);
            
            if (testCase.shouldPass) {
                if (result.success && result.urls.length === testCase.expectedUrls) {
                    console.log(`✅ PASSED: Found ${result.urls.length} URLs as expected`);
                    passed++;
                } else {
                    console.log(`❌ FAILED: Expected ${testCase.expectedUrls} URLs, got ${result.success ? result.urls.length : 'error'}`);
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

// Run tests if this script is executed directly
if (typeof window === 'undefined') {
    // Node.js environment
    runTests().catch(console.error);
} else {
    // Browser environment
    window.runBulkUploadTests = runTests;
    console.log('Bulk upload tests loaded. Run window.runBulkUploadTests() to execute tests.');
}