#!/bin/bash

# Script to prepare M&A Scraper changes for GitHub PR

echo "🚀 Preparing M&A Scraper PR files..."

# Create a directory for PR files
mkdir -p ma-scraper-pr

# Copy all new and modified files
echo "📁 Copying new files..."
cp -r src/lib/extractors ma-scraper-pr/src/lib/
cp -r src/lib/discovery ma-scraper-pr/src/lib/
cp -r src/config ma-scraper-pr/src/
cp netlify/functions/scrape-ma-news.js ma-scraper-pr/netlify/functions/
cp scripts/build-ma.js ma-scraper-pr/scripts/
cp tests/ma-scraping.test.js ma-scraper-pr/tests/

echo "📄 Copying modified files..."
cp public/index.html ma-scraper-pr/public/
cp package.json ma-scraper-pr/
cp netlify.toml ma-scraper-pr/
cp .env ma-scraper-pr/

echo "📝 Copying PR documentation..."
cp PULL_REQUEST_MA_SCRAPER.md ma-scraper-pr/
cp MA_IMPLEMENTATION_COMPLETE.md ma-scraper-pr/

# Create a file listing all changes
cat > ma-scraper-pr/CHANGES.md << 'EOF'
# M&A Scraper Feature - File Changes

## New Files Added
- `src/lib/extractors/ma-extractor.js` - M&A data extraction module
- `src/lib/discovery/ma-url-finder.js` - URL discovery module  
- `src/config/news-sources.js` - News source configurations
- `netlify/functions/scrape-ma-news.js` - Serverless function
- `scripts/build-ma.js` - Build script
- `tests/ma-scraping.test.js` - Test suite
- `.env` - Environment configuration

## Files Modified
- `public/index.html` - Added M&A UI panel and functionality
- `package.json` - Added dependencies and scripts
- `netlify.toml` - Updated build configuration

## Dependencies Added
- natural@^8.1.0 - Natural language processing
- compromise@^14.14.4 - NLP text processing
- xml2js@^0.6.2 - XML parsing for RSS feeds

## How to Apply Changes
1. Review each file in this directory
2. Copy new files to their respective locations
3. Apply modifications to existing files
4. Run `npm install` to install new dependencies
5. Run `npm run test:ma` to verify functionality
6. Commit and push to your feature branch
EOF

echo "✅ PR files prepared in 'ma-scraper-pr' directory!"
echo ""
echo "📋 Next steps:"
echo "1. Review files in ma-scraper-pr/"
echo "2. Create a new branch: git checkout -b feature/ma-news-scraper"
echo "3. Apply the changes from ma-scraper-pr/ to your project"
echo "4. Commit: git add . && git commit -m 'feat: Add M&A news scraper with NLP extraction'"
echo "5. Push: git push origin feature/ma-news-scraper"
echo "6. Create PR on GitHub using PULL_REQUEST_MA_SCRAPER.md content"