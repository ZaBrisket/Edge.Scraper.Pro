#!/usr/bin/env node

/**
 * Security Test: Verify domain validation prevents subdomain attacks
 */

const URLCleanupTool = require('./url-cleanup-tool');
const { PFRValidator } = require('./src/lib/pfr-validator');

// Test URLs including malicious subdomain attacks
const testURLs = [
    // Valid URLs (should pass)
    'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    'https://pro-football-reference.com/players/A/AlleJo00.htm',
    'https://sub.pro-football-reference.com/players/K/KelcTr00.htm',
    'https://www.thomasnet.com/suppliers/12345',
    'https://thomasnet.com/suppliers/67890',
    
    // Malicious URLs (should be rejected)
    'https://pro-football-reference.com.attacker.com/players/M/MahoPa00.htm',
    'https://pro-football-reference.com.evil.com/players/A/AlleJo00.htm',
    'https://www.pro-football-reference.com.malicious.org/players/K/KelcTr00.htm',
    'https://thomasnet.com.attacker.com/suppliers/12345',
    'https://fake-pro-football-reference.com/players/M/MahoPa00.htm',
    'https://pro-football-reference.com.fake/players/A/AlleJo00.htm',
    
    // Edge cases
    'https://pro-football-reference.com',
    'https://www.pro-football-reference.com',
    'https://subdomain.pro-football-reference.com',
    'https://very.long.subdomain.pro-football-reference.com',
];

async function testSecurityFix() {
    console.log('🔒 Testing Domain Validation Security Fix\n');
    console.log('This test verifies that subdomain attacks are properly blocked.\n');
    
    // Test 1: URL Cleanup Tool
    console.log('1️⃣ Testing URL Cleanup Tool...');
    const cleanupTool = new URLCleanupTool();
    const cleanupResults = cleanupTool.processURLs(testURLs);
    
    console.log(`Total URLs tested: ${testURLs.length}`);
    console.log(`Valid URLs: ${cleanupResults.summary.successfullyCleaned}`);
    console.log(`Invalid URLs: ${cleanupResults.summary.stillInvalid}\n`);
    
    // Show which URLs were accepted/rejected
    console.log('✅ ACCEPTED URLs:');
    cleanupResults.cleaned.forEach(item => {
        console.log(`   ${item.cleaned}`);
    });
    
    console.log('\n❌ REJECTED URLs:');
    cleanupResults.invalid.forEach(item => {
        console.log(`   ${item.original}: ${item.error}`);
    });
    
    // Test 2: PFR Validator
    console.log('\n2️⃣ Testing PFR Validator...');
    const validator = new PFRValidator();
    const validationResults = validator.validateBatch(testURLs);
    
    console.log(`Total URLs tested: ${testURLs.length}`);
    console.log(`Valid URLs: ${validationResults.summary.validCount}`);
    console.log(`Invalid URLs: ${validationResults.summary.invalidCount}\n`);
    
    // Show which URLs were accepted/rejected
    console.log('✅ ACCEPTED URLs:');
    validationResults.valid.forEach(item => {
        console.log(`   ${item.normalized}`);
    });
    
    console.log('\n❌ REJECTED URLs:');
    Object.entries(validationResults.invalid).forEach(([category, urls]) => {
        if (urls.length > 0) {
            console.log(`   ${category.toUpperCase()}:`);
            urls.forEach(item => {
                console.log(`     ${item.url}: ${item.error}`);
            });
        }
    });
    
    // Security Analysis
    console.log('\n🔍 SECURITY ANALYSIS:');
    
    const maliciousPatterns = [
        'pro-football-reference.com.attacker.com',
        'pro-football-reference.com.evil.com',
        'www.pro-football-reference.com.malicious.org',
        'thomasnet.com.attacker.com',
        'fake-pro-football-reference.com',
        'pro-football-reference.com.fake'
    ];
    
    let securityIssues = 0;
    
    // Check if any malicious URLs were accepted
    const allAccepted = [
        ...cleanupResults.cleaned.map(item => item.cleaned),
        ...validationResults.valid.map(item => item.normalized)
    ];
    
    maliciousPatterns.forEach(pattern => {
        const wasAccepted = allAccepted.some(url => url.includes(pattern));
        if (wasAccepted) {
            console.log(`❌ SECURITY ISSUE: Malicious URL pattern "${pattern}" was accepted!`);
            securityIssues++;
        } else {
            console.log(`✅ SECURE: Malicious URL pattern "${pattern}" was properly rejected`);
        }
    });
    
    // Check if legitimate subdomains were rejected
    const legitimateSubdomains = [
        'sub.pro-football-reference.com',
        'very.long.subdomain.pro-football-reference.com'
    ];
    
    legitimateSubdomains.forEach(subdomain => {
        const wasRejected = !allAccepted.some(url => url.includes(subdomain));
        if (wasRejected) {
            console.log(`⚠️  WARNING: Legitimate subdomain "${subdomain}" was rejected (may be too strict)`);
        } else {
            console.log(`✅ GOOD: Legitimate subdomain "${subdomain}" was accepted`);
        }
    });
    
    console.log(`\n📊 SECURITY SUMMARY:`);
    console.log(`   Security issues found: ${securityIssues}`);
    console.log(`   Malicious URLs blocked: ${maliciousPatterns.length - securityIssues}/${maliciousPatterns.length}`);
    
    if (securityIssues === 0) {
        console.log('✅ SECURITY TEST PASSED: All malicious URLs were properly blocked!');
    } else {
        console.log('❌ SECURITY TEST FAILED: Some malicious URLs were accepted!');
        process.exit(1);
    }
    
    return {
        securityIssues,
        maliciousBlocked: maliciousPatterns.length - securityIssues,
        totalMalicious: maliciousPatterns.length
    };
}

// Run the security test
if (require.main === module) {
    testSecurityFix().catch(console.error);
}

module.exports = { testSecurityFix };