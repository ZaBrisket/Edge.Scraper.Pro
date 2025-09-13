#!/bin/bash

# Script to copy M&A files to your project
# Usage: ./copy-ma-files.sh /path/to/your/project

if [ -z "$1" ]; then
    echo "Usage: $0 /path/to/your/project"
    echo "Example: $0 ~/projects/edgescraperpro"
    exit 1
fi

TARGET_DIR="$1"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Target directory $TARGET_DIR does not exist"
    exit 1
fi

echo "📦 Copying M&A Scraper files to $TARGET_DIR..."

# Create directories
echo "📁 Creating directories..."
mkdir -p "$TARGET_DIR/src/lib/extractors"
mkdir -p "$TARGET_DIR/src/lib/discovery"
mkdir -p "$TARGET_DIR/src/config"
mkdir -p "$TARGET_DIR/netlify/functions"
mkdir -p "$TARGET_DIR/scripts"
mkdir -p "$TARGET_DIR/tests"

# Copy files
echo "📝 Copying files..."
cp src/lib/extractors/ma-extractor.js "$TARGET_DIR/src/lib/extractors/" && echo "✓ ma-extractor.js"
cp src/lib/discovery/ma-url-finder.js "$TARGET_DIR/src/lib/discovery/" && echo "✓ ma-url-finder.js"
cp src/config/news-sources.js "$TARGET_DIR/src/config/" && echo "✓ news-sources.js"
cp netlify/functions/scrape-ma-news.js "$TARGET_DIR/netlify/functions/" && echo "✓ scrape-ma-news.js"
cp scripts/build-ma.js "$TARGET_DIR/scripts/" && echo "✓ build-ma.js"
cp tests/ma-scraping.test.js "$TARGET_DIR/tests/" && echo "✓ ma-scraping.test.js"
cp .env "$TARGET_DIR/" && echo "✓ .env"

# Copy helper files
echo ""
echo "📋 Copying documentation..."
cp MA_HTML_SNIPPET.txt "$TARGET_DIR/" && echo "✓ MA_HTML_SNIPPET.txt (for index.html updates)"

echo ""
echo "✅ Files copied successfully!"
echo ""
echo "📋 Next steps:"
echo "1. cd $TARGET_DIR"
echo "2. Update package.json - add these scripts:"
echo '   "build:ma": "node scripts/build-ma.js",'
echo '   "test:ma": "node tests/ma-scraping.test.js"'
echo ""
echo "3. Update netlify.toml - add to [functions] section:"
echo '   external_node_modules = ["natural", "compromise", "jsdom"]'
echo '   included_files = ["src/**/*.js", "src/**/*.json"]'
echo ""
echo "4. Update index.html - add content from MA_HTML_SNIPPET.txt before </body>"
echo ""
echo "5. Run: npm install"
echo "6. Run: npm run test:ma"
echo "7. Commit and create PR"