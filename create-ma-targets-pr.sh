#!/bin/bash

# M&A Target List Builder - Pull Request Creation Script
# This script creates a proper feature branch and prepares for PR creation

set -e

echo "🎯 Creating M&A Target List Builder Pull Request..."

# Get current branch name
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Create a clean feature branch name
FEATURE_BRANCH="feature/ma-target-list-builder"

# Check if we're already on a feature branch or need to create one
if [[ "$CURRENT_BRANCH" == "main" ]]; then
    echo "❌ Error: Cannot create PR from main branch"
    echo "Current commits are already on a feature branch: $CURRENT_BRANCH"
    echo "Use that branch for the PR instead."
    exit 1
fi

# If we're on a cursor branch, let's rename it to a proper feature branch
if [[ "$CURRENT_BRANCH" == cursor/* ]]; then
    echo "📝 Renaming cursor branch to feature branch..."
    git branch -m "$CURRENT_BRANCH" "$FEATURE_BRANCH"
    echo "✅ Branch renamed to: $FEATURE_BRANCH"
fi

# Show the commits that will be in the PR
echo ""
echo "📋 Commits to be included in PR:"
git log --oneline main..HEAD

echo ""
echo "📊 File changes summary:"
git diff --stat main..HEAD

echo ""
echo "🚀 Ready to create Pull Request!"
echo ""
echo "Next steps:"
echo "1. Push the feature branch:"
echo "   git push origin $FEATURE_BRANCH"
echo ""
echo "2. Create PR on GitHub:"
echo "   - Base branch: main"
echo "   - Compare branch: $FEATURE_BRANCH"
echo "   - Title: 🎯 M&A Target List Builder - Production-Ready SourceScrub Integration"
echo "   - Use PULL_REQUEST_MA_TARGETS.md as description"
echo ""
echo "3. After review, merge with:"
echo "   - Merge commit (preserve history)"
echo "   - Delete feature branch after merge"

echo ""
echo "✅ Pull request preparation complete!"