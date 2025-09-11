# Fix: Test Module Import Paths

## Issue Description

The batch processor tests were importing `../src/lib/batch-processor-hardened`, but the repository doesn't contain a file with that name—only `src/lib/batch-processor.js` exists. This resulted in `Cannot find module` errors when running tests.

Similarly, the enhanced HTTP client tests were importing `../src/lib/http/enhanced-client-hardened` which also didn't exist.

## Root Cause

During the hardening process, we initially created separate `-hardened` versions of the modules for testing, then replaced the original modules with the hardened versions. However, the test files were still referencing the temporary hardened filenames that no longer existed.

## Solution Implemented

Updated all test imports to reference the actual module paths:

### Batch Processor Tests
```javascript
// Before (incorrect):
const { BatchProcessor, ERROR_CATEGORIES, BATCH_STATES } = require('../src/lib/batch-processor-hardened');

// After (correct):
const { BatchProcessor, ERROR_CATEGORIES, BATCH_STATES } = require('../src/lib/batch-processor');
```

### Enhanced HTTP Client Tests
```javascript
// Before (incorrect):
const { fetchWithPolicy, getMetrics, resetMetrics, cleanup } = require('../src/lib/http/enhanced-client-hardened');

// After (correct):
const { fetchWithPolicy, getMetrics, resetMetrics, cleanup } = require('../src/lib/http/enhanced-client');
```

## Files Updated

1. `tests/batch-processor-core.test.js`
2. `tests/batch-processor-hardened.test.js` 
3. `tests/enhanced-http-client-hardened.test.js`

## Verification

Created and ran a verification test that confirms:
- All modules can be imported successfully
- Expected exports are available
- Instances can be created without errors

The hardened implementations are now the standard implementations in:
- `src/lib/batch-processor.js`
- `src/lib/http/enhanced-client.js`

No separate `-hardened` files exist or are needed.