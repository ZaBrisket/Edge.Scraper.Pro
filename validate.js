// save as validate.js and run with: node validate.js
const fs = require('fs');

const requiredFiles = [
  'src/lib/http/adaptive-rate-limiter.js',
  'src/lib/stream-processor.js',
  'src/lib/content-extractor.js',
  'src/lib/session-manager.js',
  'src/lib/retry-manager.js',
  'netlify/functions/rate-limiter-metrics.js',
  'netlify/functions/session-status.js',
  'netlify/functions/bulk-scrape.js'
];

const modules = [
  'AdaptiveRateLimiter',
  'StreamProcessor',
  'ContentExtractor',
  'SessionManager',
  'RetryManager'
];

console.log('🔍 Validating EdgeScraper Pro Implementation\n');

// Check files exist
console.log('Checking required files:');
let allFilesExist = true;
for (const file of requiredFiles) {
  const exists = fs.existsSync(file);
  console.log(`  ${exists ? '✓' : '✗'} ${file}`);
  if (!exists) allFilesExist = false;
}

// Check modules can be loaded
console.log('\nChecking module imports:');
let allModulesLoad = true;
const modulePaths = {
  'AdaptiveRateLimiter': './src/lib/http/adaptive-rate-limiter',
  'StreamProcessor': './src/lib/stream-processor',
  'ContentExtractor': './src/lib/content-extractor',
  'SessionManager': './src/lib/session-manager',
  'RetryManager': './src/lib/retry-manager'
};

for (const moduleName of modules) {
  try {
    const modulePath = modulePaths[moduleName];
    require(modulePath);
    console.log(`  ✓ ${moduleName} loads successfully`);
  } catch (e) {
    console.log(`  ✗ ${moduleName} failed to load: ${e.message}`);
    allModulesLoad = false;
  }
}

// Check environment variables
console.log('\nChecking environment configuration:');
const requiredEnvVars = [
  'HTTP_MAX_CONCURRENT',
  'HTTP_DEADLINE_MS'
];

for (const envVar of requiredEnvVars) {
  const value = process.env[envVar];
  if (value) {
    console.log(`  ✓ ${envVar}=${value}`);
  } else {
    console.log(`  ⚠ ${envVar} not set (add to .env)`);
  }
}

// Check file sizes
console.log('\nChecking file sizes:');
const expectedSizes = {
  'src/lib/http/adaptive-rate-limiter.js': 350,
  'src/lib/stream-processor.js': 400,
  'src/lib/content-extractor.js': 500,
  'src/lib/session-manager.js': 350,
  'src/lib/retry-manager.js': 400
};

for (const [file, minLines] of Object.entries(expectedSizes)) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').length;
    const status = lines >= minLines ? '✓' : '⚠';
    console.log(`  ${status} ${file}: ${lines} lines (expected: ${minLines}+)`);
  }
}

// Summary
console.log('\n' + '='.repeat(50));
if (allFilesExist && allModulesLoad) {
  console.log('✅ ALL VALIDATIONS PASSED - Ready for testing!');
  console.log('\nNext steps:');
  console.log('1. Test individual modules: npm test');
  console.log('2. Start local server: npm run dev');
  console.log('3. Test endpoints with curl');
  console.log('4. Deploy to production');
} else {
  console.log('❌ VALIDATION FAILED - Review errors above');
}