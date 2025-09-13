#!/bin/bash

# Verification script for M&A implementation
echo "🔍 Verifying M&A Scraper Implementation..."
echo "========================================"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check function
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 missing"
        return 1
    fi
}

# Check required files
echo ""
echo "📁 Checking required files..."
MISSING=0

check_file "src/lib/extractors/ma-extractor.js" || ((MISSING++))
check_file "src/lib/discovery/ma-url-finder.js" || ((MISSING++))
check_file "src/config/news-sources.js" || ((MISSING++))
check_file "netlify/functions/scrape-ma-news.js" || ((MISSING++))
check_file "scripts/build-ma.js" || ((MISSING++))
check_file "tests/ma-scraping.test.js" || ((MISSING++))
check_file ".env" || ((MISSING++))

echo ""
echo "📊 File count summary:"
echo "Expected: 7 new files"
echo "Missing: $MISSING files"

# Check for dealValuePatterns in ma-extractor.js
echo ""
echo "🔍 Checking MA Extractor implementation..."
if [ -f "src/lib/extractors/ma-extractor.js" ]; then
    if grep -q "dealValuePatterns" "src/lib/extractors/ma-extractor.js"; then
        echo -e "${GREEN}✓${NC} dealValuePatterns array found"
    else
        echo -e "${RED}✗${NC} dealValuePatterns array missing"
    fi
    
    if grep -q "class MAExtractor" "src/lib/extractors/ma-extractor.js"; then
        echo -e "${GREEN}✓${NC} MAExtractor class found"
    else
        echo -e "${RED}✗${NC} MAExtractor class missing"
    fi
fi

# Check for RSS feeds in url finder
echo ""
echo "🔍 Checking URL Finder implementation..."
if [ -f "src/lib/discovery/ma-url-finder.js" ]; then
    if grep -q "rssFeedUrls" "src/lib/discovery/ma-url-finder.js"; then
        echo -e "${GREEN}✓${NC} RSS feed configuration found"
    else
        echo -e "${RED}✗${NC} RSS feed configuration missing"
    fi
fi

# Check Netlify function
echo ""
echo "🔍 Checking Netlify function..."
if [ -f "netlify/functions/scrape-ma-news.js" ]; then
    if grep -q "exports.handler" "netlify/functions/scrape-ma-news.js"; then
        echo -e "${GREEN}✓${NC} exports.handler found"
    else
        echo -e "${RED}✗${NC} exports.handler missing"
    fi
fi

# Check for unwanted files
echo ""
echo "🚫 Checking for unwanted changes..."
if [ -d "public" ]; then
    MA_FILES=$(find public -name "*ma*" -o -name "*M&A*" 2>/dev/null | wc -l)
    if [ $MA_FILES -gt 0 ]; then
        echo -e "${RED}✗${NC} Found M&A files in public/ directory (should be in src/)"
        find public -name "*ma*" -o -name "*M&A*"
    else
        echo -e "${GREEN}✓${NC} No M&A files in public/ directory"
    fi
fi

# Run tests if available
echo ""
echo "🧪 Running tests..."
if [ -f "package.json" ] && grep -q '"test:ma"' package.json; then
    npm run test:ma 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Tests passed"
    else
        echo -e "${RED}✗${NC} Tests failed"
    fi
else
    echo -e "${RED}✗${NC} test:ma script not found in package.json"
fi

# Check line count
echo ""
echo "📏 Checking implementation size..."
TOTAL_LINES=0
for file in src/lib/extractors/ma-extractor.js \
            src/lib/discovery/ma-url-finder.js \
            src/config/news-sources.js \
            netlify/functions/scrape-ma-news.js \
            scripts/build-ma.js \
            tests/ma-scraping.test.js; do
    if [ -f "$file" ]; then
        LINES=$(wc -l < "$file")
        TOTAL_LINES=$((TOTAL_LINES + LINES))
    fi
done

echo "Total lines in new files: $TOTAL_LINES"
if [ $TOTAL_LINES -gt 0 ] && [ $TOTAL_LINES -lt 1000 ]; then
    echo -e "${GREEN}✓${NC} Line count reasonable (~800-1000 expected)"
elif [ $TOTAL_LINES -gt 2000 ]; then
    echo -e "${RED}✗${NC} Too many lines (expected ~1000, found $TOTAL_LINES)"
fi

# Final summary
echo ""
echo "========================================"
if [ $MISSING -eq 0 ]; then
    echo -e "${GREEN}✅ All files present!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Update package.json with build:ma and test:ma scripts"
    echo "2. Update netlify.toml with external_node_modules"
    echo "3. Add M&A UI panel to index.html"
    echo "4. Run: npm install"
    echo "5. Run: npm run test:ma"
    echo "6. Commit and push"
else
    echo -e "${RED}❌ Missing $MISSING files${NC}"
    echo ""
    echo "Run the creation script first:"
    echo "./create-ma-scraper-correct.sh"
fi