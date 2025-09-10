/**
 * Test script for Enhanced Batch Processing functionality
 * 
 * Tests all required features:
 * - Pre-fetch URL validation with invalid URL reporting
 * - Upfront duplicate detection and user notification
 * - Order preservation throughout processing pipeline
 * - Unified timeout configuration
 * - Intelligent error management and reporting
 */

const { BatchProcessor, ERROR_CATEGORIES, BATCH_STATES } = require('./src/lib/batch-processor');
const { PFRValidator, VALIDATION_CATEGORIES } = require('./src/lib/pfr-validator');

// Test data
const testUrls = [
    // Valid URLs
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    'https://www.pro-football-reference.com/players/A/AlleJo00.htm',
    
    // Duplicate URL (different tracking params)
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm?utm_source=test',
    
    // Invalid URLs
    'not-a-url',
    'ftp://invalid-protocol.com',
    'https://wrong-domain.com/player',
    'https://www.pro-football-reference.com/teams/kan/2023.htm', // Non-player page
    
    // Another valid URL
    'https://www.pro-football-reference.com/players/K/KelcTr00.htm',
    
    // Another duplicate
    'https://www.pro-football-reference.com/players/A/AlleJo00.htm#rushing'
];

// Mock processor function
async function mockProcessor(url, item) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate different types of responses
    if (url.includes('MahoPa00')) {
        return { content: 'Patrick Mahomes content', length: 1000 };
    } else if (url.includes('AlleJo00')) {
        // Simulate timeout on second attempt
        if (item.index > 2) {
            throw new Error('Operation timed out after 10000ms');
        }
        return { content: 'Josh Allen content', length: 800 };
    } else if (url.includes('KelcTr00')) {
        // Simulate server error
        const error = new Error('Server error');
        error.status = 503;
        throw error;
    }
    
    return { content: 'Default content', length: 500 };
}

async function runTests() {
    console.log('=== Enhanced Batch Processing Test Suite ===\n');
    
    // Test 1: URL Validation
    console.log('Test 1: URL Validation');
    const validator = new PFRValidator();
    const validationResult = validator.validateBatch(testUrls);
    
    console.log('Validation Summary:');
    console.log(`- Total URLs: ${validationResult.total}`);
    console.log(`- Valid URLs: ${validationResult.summary.validCount}`);
    console.log(`- Invalid URLs: ${validationResult.summary.invalidCount}`);
    console.log(`- Duplicate URLs: ${validationResult.summary.duplicateCount}`);
    
    console.log('\nInvalid URL Categories:');
    Object.entries(validationResult.invalid).forEach(([category, urls]) => {
        if (urls.length > 0) {
            console.log(`- ${category}: ${urls.length} URL(s)`);
            urls.forEach(({ url, error }) => {
                console.log(`  - ${url}: ${error}`);
            });
        }
    });
    
    console.log('\nDuplicates:');
    validationResult.duplicates.forEach(dup => {
        console.log(`- ${dup.url} (duplicate of ${dup.firstOccurrence})`);
    });
    
    // Test 2: Batch Processing
    console.log('\n\nTest 2: Batch Processing with Error Handling');
    
    const progressReports = [];
    const processor = new BatchProcessor({
        concurrency: 2,
        delayMs: 50,
        timeout: parseInt(process.env.HTTP_DEADLINE_MS || '10000', 10),
        onProgress: (progress) => {
            progressReports.push(progress);
            if (progress.phase === 'processing') {
                console.log(`Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`);
            }
        },
        onError: (error) => {
            console.error('Batch error:', error.error);
        },
        onComplete: (result) => {
            console.log('\nBatch processing completed!');
        }
    });
    
    try {
        const result = await processor.processBatch(testUrls, mockProcessor);
        
        console.log('\nProcessing Summary:');
        console.log(result.summary.overview);
        console.log(result.summary.validation);
        console.log(result.summary.errors);
        console.log(result.summary.performance);
        console.log(result.summary.duration);
        
        // Test 3: Order Preservation
        console.log('\n\nTest 3: Order Preservation');
        const processedIndices = result.results.map(r => r.index);
        const isOrderPreserved = processedIndices.every((idx, i) => 
            i === 0 || idx > processedIndices[i - 1]
        );
        console.log(`Order preserved: ${isOrderPreserved ? 'YES' : 'NO'}`);
        console.log(`Processed indices: ${processedIndices.join(', ')}`);
        
        // Test 4: Error Categorization
        console.log('\n\nTest 4: Error Categorization');
        if (result.errorReport.totalErrors > 0) {
            console.log(`Total errors: ${result.errorReport.totalErrors}`);
            console.log('\nErrors by category:');
            Object.entries(result.errorReport.errorsByCategory).forEach(([category, errors]) => {
                console.log(`- ${category}: ${errors.length} error(s)`);
            });
            
            console.log('\nError patterns:');
            result.errorReport.patterns.forEach(pattern => {
                console.log(`- ${pattern.category}:${pattern.code || 'unknown'} - ${pattern.count} occurrence(s)`);
                console.log(`  Examples: ${pattern.exampleUrls.join(', ')}`);
            });
            
            console.log('\nRecommendations:');
            result.errorReport.recommendations.forEach(rec => {
                console.log(`- [${rec.severity}] ${rec.message}`);
                console.log(`  Action: ${rec.action}`);
            });
        }
        
        // Test 5: Cursor-optimized Export
        console.log('\n\nTest 5: Cursor-optimized Error Export');
        const exportData = result.errorReport.exportData;
        console.log('Export data size:', JSON.stringify(exportData).length, 'bytes');
        console.log('Export data structure:', Object.keys(exportData));
        console.log('Error summary:', exportData.summary);
        
        // Test 6: Timeout Configuration
        console.log('\n\nTest 6: Timeout Configuration');
        console.log(`Configured timeout: ${processor.options.timeout}ms`);
        console.log(`Environment variable HTTP_DEADLINE_MS: ${process.env.HTTP_DEADLINE_MS || 'not set'}`);
        
    } catch (error) {
        console.error('Test failed:', error.message);
    }
    
    // Test 7: Control Methods
    console.log('\n\nTest 7: Control Methods (Pause/Resume/Stop)');
    const controlProcessor = new BatchProcessor({ concurrency: 1, delayMs: 200 });
    
    // Start processing
    const controlPromise = controlProcessor.processBatch(
        ['https://example1.com', 'https://example2.com', 'https://example3.com'],
        async (url) => {
            await new Promise(resolve => setTimeout(resolve, 300));
            return { url, processed: true };
        }
    );
    
    // Test pause after 100ms
    setTimeout(() => {
        console.log('Pausing processor...');
        controlProcessor.pause();
        console.log(`State: ${controlProcessor.state}`);
    }, 100);
    
    // Resume after 500ms
    setTimeout(() => {
        console.log('Resuming processor...');
        controlProcessor.resume();
        console.log(`State: ${controlProcessor.state}`);
    }, 500);
    
    // Stop after 800ms
    setTimeout(() => {
        console.log('Stopping processor...');
        controlProcessor.stop();
        console.log(`State: ${controlProcessor.state}`);
    }, 800);
    
    try {
        await controlPromise;
    } catch (error) {
        console.log('Control test completed with expected abort');
    }
    
    console.log('\n=== All Tests Completed ===');
}

// Run tests
runTests().catch(console.error);