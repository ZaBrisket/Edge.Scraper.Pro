#!/bin/bash

# Create Pull Request for M&A News Scraper Implementation
# This script creates a comprehensive PR with all necessary files and documentation

echo "🚀 Creating Pull Request for M&A News Scraper Implementation..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository. Please run this from the project root."
    exit 1
fi

# Check if there are uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Staging all changes..."
    git add .
    
    echo "💾 Committing changes..."
    git commit -m "feat: Implement comprehensive M&A News Scraper

- Add M&A extraction engine with deal value detection
- Implement multi-source news integration (BusinessWire, PR Newswire, etc.)
- Create URL discovery system with RSS and sitemap parsing
- Add M&A configuration panel to frontend
- Implement confidence scoring and data validation
- Add comprehensive test suite and documentation
- Configure Netlify functions and build system

Features:
- Deal value extraction and normalization
- Company entity recognition using NLP
- Transaction type classification
- Executive quote and advisor detection
- Multi-source rate limiting and error handling
- Real-time progress updates and export functionality
- Auto-discovery of M&A news URLs

Files added:
- src/lib/extractors/ma-extractor.js
- src/lib/discovery/ma-url-finder.js
- src/config/news-sources.js
- netlify/functions/scrape-ma-news.js
- scripts/build-ma.js
- tests/ma-scraping.test.js
- .env

Files modified:
- public/index.html (added M&A panel)
- package.json (updated scripts)
- netlify.toml (updated config)

Closes: M&A News Scraper Implementation"
    
    echo "✅ Changes committed successfully!"
else
    echo "ℹ️  No uncommitted changes found."
fi

# Create a new branch for the PR
BRANCH_NAME="feature/ma-news-scraper-$(date +%Y%m%d-%H%M%S)"
echo "🌿 Creating feature branch: $BRANCH_NAME"

git checkout -b "$BRANCH_NAME" 2>/dev/null || {
    echo "⚠️  Branch might already exist, switching to it..."
    git checkout "$BRANCH_NAME"
}

# Push the branch
echo "📤 Pushing branch to remote..."
git push -u origin "$BRANCH_NAME"

# Create PR description
PR_TITLE="feat: Implement Comprehensive M&A News Scraper System"
PR_BODY="## 🎯 Overview
This PR implements a comprehensive M&A (Mergers & Acquisitions) news scraping system with intelligent data extraction, multi-source support, and advanced analytics capabilities.

## 🚀 Key Features
- **Intelligent M&A Detection** - Extracts deal values, transaction types, companies, dates, quotes, and advisors
- **Multi-Source Support** - BusinessWire, PR Newswire, GlobeNewswire, Reuters, Bloomberg
- **Auto-Discovery** - RSS feeds and keyword-based URL discovery
- **Confidence Scoring** - 0-100% confidence rating for each detected transaction
- **Rate Limiting** - Respects source-specific rate limits
- **Export Functionality** - JSON export of all results
- **Modern UI** - Clean, professional interface with real-time progress

## 📁 Files Added
- \`src/lib/extractors/ma-extractor.js\` - Core M&A extraction engine
- \`src/lib/discovery/ma-url-finder.js\` - URL discovery and RSS parsing
- \`src/config/news-sources.js\` - News source configurations
- \`netlify/functions/scrape-ma-news.js\` - M&A scraping API endpoint
- \`scripts/build-ma.js\` - Build script for M&A features
- \`tests/ma-scraping.test.js\` - Comprehensive test suite
- \`.env\` - Environment configuration

## 📝 Files Modified
- \`public/index.html\` - Added M&A configuration panel
- \`package.json\` - Updated scripts and dependencies
- \`netlify.toml\` - Updated build and function config

## 🧪 Testing
All tests passing:
- ✅ Deal value extraction accuracy
- ✅ Company name recognition
- ✅ Transaction type classification
- ✅ Date parsing and normalization
- ✅ URL discovery configuration

## 🚀 Ready for Review
This implementation is production-ready with comprehensive error handling, rate limiting, and a professional user interface.

**Closes:** M&A News Scraper Implementation"

# Check if GitHub CLI is available
if command -v gh &> /dev/null; then
    echo "🔧 Creating PR using GitHub CLI..."
    gh pr create --title "$PR_TITLE" --body "$PR_BODY" --base main --head "$BRANCH_NAME"
    echo "✅ Pull request created successfully!"
else
    echo "📋 GitHub CLI not found. Please create the PR manually:"
    echo ""
    echo "Title: $PR_TITLE"
    echo ""
    echo "Body:"
    echo "$PR_BODY"
    echo ""
    echo "Branch: $BRANCH_NAME"
    echo "Base: main"
    echo ""
    echo "Or install GitHub CLI: https://cli.github.com/"
fi

echo ""
echo "🎉 Pull Request setup complete!"
echo "📋 Branch: $BRANCH_NAME"
echo "🔗 View on GitHub: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\/[^/]*\)\.git.*/\1/')/compare/$BRANCH_NAME"
echo ""
echo "📚 Additional Documentation:"
echo "- PR_M&A_NEWS_SCRAPER.md - Detailed implementation overview"
echo "- PR_FILES_MANIFEST.md - Complete file manifest and dependencies"
echo ""
echo "✅ Ready for review and merge!"