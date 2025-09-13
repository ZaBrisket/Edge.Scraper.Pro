#!/bin/bash

# Simple script to create GitHub PR for M&A News Scraper
# Run this from your project root after reviewing the changes

echo "🚀 Creating GitHub Pull Request for M&A News Scraper..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository. Please run this from the project root."
    exit 1
fi

# Create a new branch
BRANCH_NAME="feature/ma-news-scraper-$(date +%Y%m%d)"
echo "🌿 Creating branch: $BRANCH_NAME"

git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"

# Stage all changes
echo "📝 Staging changes..."
git add .

# Commit changes
echo "💾 Committing changes..."
git commit -m "feat: Implement comprehensive M&A News Scraper

- Add intelligent M&A data extraction engine
- Implement multi-source news integration
- Create URL discovery system with RSS parsing
- Add M&A configuration panel to frontend
- Implement confidence scoring and validation
- Add comprehensive test suite
- Configure Netlify functions and build system

Features:
- Deal value extraction and normalization
- Company entity recognition using NLP
- Transaction type classification
- Executive quote and advisor detection
- Multi-source rate limiting
- Real-time progress updates
- Auto-discovery of M&A news URLs

Closes: M&A News Scraper Implementation"

# Push branch
echo "📤 Pushing branch..."
git push -u origin "$BRANCH_NAME"

# Get repository info
REPO_URL=$(git config --get remote.origin.url)
REPO_NAME=$(echo "$REPO_URL" | sed 's/.*github.com[:/]\([^/]*\/[^/]*\)\.git.*/\1/')

echo ""
echo "✅ Branch created and pushed successfully!"
echo ""
echo "🔗 Create PR at: https://github.com/$REPO_NAME/compare/$BRANCH_NAME"
echo ""
echo "📋 PR Title: feat: Implement Comprehensive M&A News Scraper System"
echo ""
echo "📚 Documentation files created:"
echo "  - PR_M&A_NEWS_SCRAPER.md (detailed overview)"
echo "  - PR_FILES_MANIFEST.md (file manifest)"
echo "  - PR_SUMMARY.md (quick summary)"
echo ""
echo "🧪 Test the implementation:"
echo "  npm run test:ma"
echo "  npm run build"
echo "  netlify dev"
echo ""
echo "🎉 Ready for review and merge!"