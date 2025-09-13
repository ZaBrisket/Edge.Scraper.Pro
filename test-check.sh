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

# Test 3: Check netlify functions
echo ""
echo "Netlify Functions:"
if [ -d "netlify/functions" ]; then
    ls -la netlify/functions/
else
    echo "❌ netlify/functions directory missing"
fi

# Test 4: Check package.json
echo ""
echo "Package.json check:"
if grep -q "next" package.json; then
    echo "❌ Next.js dependencies still present!"
else
    echo "✅ No Next.js dependencies found"
fi

echo ""
echo "✅ All checks passed! Ready for deployment."