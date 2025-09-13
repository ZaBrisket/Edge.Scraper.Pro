#!/bin/bash
echo "Testing EdgeScraperPro Standalone"
echo "================================="

# Test 1: Check if index.html exists
if [ -f "public/index.html" ]; then
    echo "✅ public/index.html exists"
else
    echo "❌ public/index.html missing"
    exit 1
fi

# Test 2: Check if required JS files exist
for file in batch-processor.js enhanced-url-validator.js pfr-validator.js sports-extractor.js; do
    if [ -f "public/$file" ]; then
        echo "✅ public/$file exists"
    else
        echo "❌ public/$file missing"
    fi
done

# Test 3: Check if fetch-url.js function exists
if [ -f "netlify/functions/fetch-url.js" ]; then
    echo "✅ netlify/functions/fetch-url.js exists"
else
    echo "❌ netlify/functions/fetch-url.js missing"
fi

# Test 4: Check if health.js function exists
if [ -f "netlify/functions/health.js" ]; then
    echo "✅ netlify/functions/health.js exists"
else
    echo "❌ netlify/functions/health.js missing"
fi

# Test 5: Check package.json has correct dependencies
if grep -q "http-server" package.json; then
    echo "✅ http-server dependency found"
else
    echo "❌ http-server dependency missing"
fi

if grep -q "netlify-cli" package.json; then
    echo "✅ netlify-cli dependency found"
else
    echo "❌ netlify-cli dependency missing"
fi

# Test 6: Check netlify.toml configuration
if grep -q 'publish = "public"' netlify.toml; then
    echo "✅ netlify.toml configured for public directory"
else
    echo "❌ netlify.toml not configured for public directory"
fi

if grep -q 'BYPASS_AUTH = "true"' netlify.toml; then
    echo "✅ BYPASS_AUTH configured"
else
    echo "❌ BYPASS_AUTH not configured"
fi

echo ""
echo "Starting local server on http://localhost:8080"
echo "Press Ctrl+C to stop the server"
echo ""

# Start local server
npx http-server public -p 8080 -o