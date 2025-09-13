#!/bin/bash

echo "Testing Next.js build with brutalist styles..."
echo "============================================"

# First, let's check if the styles are imported correctly
echo "1. Checking style imports..."
grep -q "brutalist-override.css" styles/globals.css && echo "✓ Brutalist styles imported" || echo "✗ Brutalist styles NOT imported"

# Run the Next.js build
echo -e "\n2. Running Next.js build..."
npm run build

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo -e "\n✓ Build succeeded!"
    
    # Check the built CSS file size
    echo -e "\n3. Checking built CSS..."
    if [ -d ".next/static/css" ]; then
        echo "Built CSS files:"
        ls -lh .next/static/css/
    fi
else
    echo -e "\n✗ Build failed!"
    exit 1
fi

echo -e "\nBuild test complete!"