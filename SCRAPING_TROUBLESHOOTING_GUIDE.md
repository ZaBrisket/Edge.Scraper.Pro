# Edge.Scraper.Pro Troubleshooting Guide

## Common Issues and Solutions

### 1. "Job failed: Failed to start job" Error

This error typically occurs due to malformed URLs or configuration issues. Here's how to fix it:

#### Problem: Malformed URLs
The most common cause is corrupted URLs with patterns like:
- `http://hwww` (repeated characters)
- `http://http://` (duplicate protocols)
- `www.www.` (duplicate www)

#### Solution: Use the URL Cleanup Tool

```bash
# Test the tool with sample data
node url-cleanup-tool.js --test

# Clean your URLs file
node url-cleanup-tool.js your-urls.txt cleaned-urls.txt
```

### 2. URL Validation Issues

#### Check URL Format
Ensure your URLs follow these patterns:

**Pro Football Reference:**
```
https://www.pro-football-reference.com/players/M/MahoPa00.htm
```

**ThomasNet:**
```
https://www.thomasnet.com/suppliers/12345
```

**GlobalSpec:**
```
https://www.globalspec.com/supplier/12345
```

#### Use the Built-in Validator
```javascript
const { PFRValidator } = require('./src/lib/pfr-validator');
const validator = new PFRValidator();

// Validate a single URL
const result = validator.validateURL('https://www.pro-football-reference.com/players/M/MahoPa00.htm');
console.log(result);

// Validate a batch
const results = validator.validateBatch(urls);
console.log(results);
```

### 3. Network and Connectivity Issues

#### Check Your Internet Connection
```bash
# Test basic connectivity
ping google.com

# Test specific domains
ping pro-football-reference.com
ping thomasnet.com
```

#### Check for Rate Limiting
If you're getting 429 errors, the site is rate limiting you:

```javascript
// Reduce concurrency and add delays
const processor = new BatchProcessor({
    concurrency: 2,        // Reduce from default 5
    delayMs: 1000,         // Add 1 second delay between requests
    timeout: 30000,        // Increase timeout
    maxRetries: 3
});
```

### 4. Configuration Issues

#### Check Your Scraper Configuration
```javascript
// Example configuration
const options = {
    concurrency: 3,                    // Number of parallel requests
    delayMs: 500,                      // Delay between batches (ms)
    timeout: 30000,                    // Request timeout (ms)
    maxRetries: 3,                     // Number of retries
    extractionMode: 'sports',          // or 'supplier-directory'
    enableUrlNormalization: true,      // Clean up URLs
    enableStructuredLogging: true      // Enable detailed logging
};
```

#### Environment Variables
Make sure these are set correctly:
```bash
export HTTP_DEADLINE_MS=30000
export MAX_CONCURRENCY=3
export MAX_RETRIES=3
```

### 5. Memory and Performance Issues

#### Monitor Memory Usage
```javascript
// Add to your script
setInterval(() => {
    const usage = process.memoryUsage();
    console.log('Memory usage:', {
        rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB'
    });
}, 10000);
```

#### Optimize Batch Size
```javascript
// For large URL lists, process in smaller batches
const batchSize = 100;
for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await processor.processBatch(batch);
    
    // Add delay between batches
    await new Promise(resolve => setTimeout(resolve, 5000));
}
```

### 6. Debugging Steps

#### Step 1: Test with a Single URL
```javascript
const { BatchProcessor } = require('./src/lib/batch-processor');

const processor = new BatchProcessor({
    concurrency: 1,
    delayMs: 1000,
    timeout: 30000,
    onProgress: (progress) => console.log('Progress:', progress),
    onError: (error) => console.error('Error:', error),
    onComplete: (result) => console.log('Complete:', result)
});

// Test with one URL
processor.processBatch(['https://www.pro-football-reference.com/players/M/MahoPa00.htm']);
```

#### Step 2: Enable Detailed Logging
```javascript
const processor = new BatchProcessor({
    enableStructuredLogging: true,
    onError: (error) => {
        console.error('Detailed error:', {
            url: error.url,
            error: error.error,
            category: error.category,
            timestamp: new Date(error.timestamp).toISOString()
        });
    }
});
```

#### Step 3: Check Network Requests
```javascript
// Add this to see what's happening
const { fetchWithPolicy } = require('./src/lib/http/simple-enhanced-client');

async function testSingleRequest(url) {
    try {
        console.log('Testing URL:', url);
        const response = await fetchWithPolicy(url, { timeout: 10000 });
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        return true;
    } catch (error) {
        console.error('Request failed:', error.message);
        return false;
    }
}
```

### 7. Common Error Categories

| Error Category | Description | Solution |
|----------------|-------------|----------|
| `network` | Network connectivity issues | Check internet connection, try again |
| `timeout` | Request timed out | Increase timeout, reduce concurrency |
| `rate_limit` | Too many requests | Add delays, reduce concurrency |
| `http_404` | Page not found | Check URL validity |
| `http_403` | Access forbidden | Check if site blocks scrapers |
| `dns_error` | Domain not found | Check URL spelling |
| `ssl_error` | SSL certificate issues | Try HTTP instead of HTTPS |

### 8. Best Practices

#### URL Preparation
1. **Clean your URLs first:**
   ```bash
   node url-cleanup-tool.js input-urls.txt clean-urls.txt
   ```

2. **Validate URLs before scraping:**
   ```javascript
   const validator = new PFRValidator();
   const validation = validator.validateBatch(urls);
   const validUrls = validation.valid.map(v => v.cleaned);
   ```

3. **Remove duplicates:**
   ```javascript
   const uniqueUrls = [...new Set(validUrls)];
   ```

#### Scraping Configuration
1. **Start small and scale up:**
   - Begin with 1-2 URLs
   - Gradually increase to 10, 50, 100
   - Monitor for errors and adjust settings

2. **Be respectful:**
   - Use reasonable delays (500ms+)
   - Don't overwhelm the target site
   - Respect robots.txt

3. **Handle errors gracefully:**
   - Implement retry logic
   - Log errors for analysis
   - Continue processing other URLs

### 9. Quick Fixes

#### For "Failed to start job" errors:
1. Run the URL cleanup tool
2. Check your internet connection
3. Reduce concurrency to 1-2
4. Increase delays to 1000ms+
5. Test with a single URL first

#### For timeout errors:
1. Increase timeout to 60000ms
2. Check if the target site is slow
3. Reduce concurrency
4. Add more delays

#### For rate limiting:
1. Reduce concurrency to 1
2. Increase delays to 2000ms+
3. Use different IP addresses (if possible)
4. Check if the site has API access

### 10. Getting Help

If you're still having issues:

1. **Check the logs:** Look for detailed error messages
2. **Test incrementally:** Start with 1 URL, then 5, then 10
3. **Use the diagnostic tool:** `node diagnostic-test.js`
4. **Check the examples:** Look at `test-batch-processor.js`

## Example Working Configuration

```javascript
const { BatchProcessor } = require('./src/lib/batch-processor');

const processor = new BatchProcessor({
    concurrency: 2,                    // Conservative concurrency
    delayMs: 1000,                     // 1 second delay
    timeout: 30000,                    // 30 second timeout
    maxRetries: 3,                     // Retry failed requests
    extractionMode: 'sports',          // Use sports extractor
    enableUrlNormalization: true,      // Clean URLs
    enableStructuredLogging: true,     // Detailed logging
    onProgress: (progress) => {
        console.log(`Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`);
    },
    onError: (error) => {
        console.error(`Error processing ${error.url}: ${error.error}`);
    },
    onComplete: (result) => {
        console.log('Scraping completed!');
        console.log(`Success rate: ${result.summary.successRate.toFixed(1)}%`);
    }
});

// Your cleaned URLs
const urls = [
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    'https://www.pro-football-reference.com/players/A/AlleJo00.htm',
    // ... more URLs
];

// Start scraping
processor.processBatch(urls);
```

This configuration should work for most cases. Adjust the settings based on your specific needs and the target website's behavior.