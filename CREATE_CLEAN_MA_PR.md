# 🎯 Step-by-Step Guide: Create Clean M&A Scraper PR

## Prerequisites
```bash
# Ensure you're on main branch with latest changes
git checkout main
git pull origin main
```

## Step 1: Create New Branch
```bash
git checkout -b feature/ma-news-scraper-clean
```

## Step 2: Create Directory Structure
```bash
mkdir -p src/lib/extractors
mkdir -p src/lib/discovery
mkdir -p src/config
mkdir -p netlify/functions
mkdir -p scripts
mkdir -p tests
```

## Step 3: Run Creation Script

I've prepared all files in this workspace. Copy them exactly:

### Copy New Files
```bash
# From this workspace, copy these files to your project:
cp /workspace/src/lib/extractors/ma-extractor.js src/lib/extractors/
cp /workspace/src/lib/discovery/ma-url-finder.js src/lib/discovery/
cp /workspace/src/config/news-sources.js src/config/
cp /workspace/netlify/functions/scrape-ma-news.js netlify/functions/
cp /workspace/scripts/build-ma.js scripts/
cp /workspace/tests/ma-scraping.test.js tests/
cp /workspace/.env .env
```

## Step 4: Update Existing Files

### 4.1 Update `package.json`
Add these two lines to the "scripts" section:
```json
"build:ma": "node scripts/build-ma.js",
"test:ma": "node tests/ma-scraping.test.js",
```

### 4.2 Update `netlify.toml`
Add to the `[functions]` section:
```toml
external_node_modules = ["natural", "compromise", "jsdom"]
included_files = [
  "src/**/*.js",
  "src/**/*.json"
]
```

### 4.3 Update `index.html`
Add the M&A panel HTML from `MA_HTML_SNIPPET.txt` before the closing `</body>` tag.

## Step 5: Install Dependencies
```bash
npm install
```

## Step 6: Run Tests
```bash
npm run test:ma
```

Expected output:
```
✅ Test 1: Deal Value Extraction
✅ Test 2: Company Extraction
✅ Test 3: Transaction Type Detection
✅ Test 4: Date Extraction
✅ Test 5: URL Discovery
```

## Step 7: Verify Changes
```bash
# Check that only intended files were added/modified
git status

# Should show:
# - 7 new files in src/, netlify/, scripts/, tests/
# - 3 modified files: package.json, netlify.toml, index.html

# Check line count
git diff --stat
# Should show approximately 1,150 lines added
```

## Step 8: Commit Changes
```bash
git add .
git commit -m "feat: Add M&A news scraper with NLP extraction

- Add MAExtractor class for deal value and company extraction
- Add MAUrlFinder for automated news discovery  
- Add news source configurations for 5 major outlets
- Add Netlify function for serverless M&A scraping
- Add UI panel to existing index.html
- Add comprehensive test suite

No structural changes to project. Focused implementation only."
```

## Step 9: Push Branch
```bash
git push origin feature/ma-news-scraper-clean
```

## Step 10: Create Pull Request

1. Go to your GitHub repository
2. Click "Compare & pull request" for the new branch
3. Use the content from `PULL_REQUEST_MA_CLEAN.md` as the PR description
4. Verify the diff shows:
   - ~1,150 lines added
   - Only the files listed above
   - No public/ directory changes
   - No unrelated modifications

## Final Verification Checklist

Before creating the PR, ensure:

- [ ] `src/lib/extractors/ma-extractor.js` exists
- [ ] `src/lib/discovery/ma-url-finder.js` exists  
- [ ] `src/config/news-sources.js` exists
- [ ] `netlify/functions/scrape-ma-news.js` exists
- [ ] Tests pass: `npm run test:ma`
- [ ] Total lines added: ~1,150 (not 21,000+)
- [ ] No changes to public/ directory structure
- [ ] No sports-related code
- [ ] Only M&A functionality added

## Common Issues & Solutions

**Issue**: Tests fail with module not found
**Solution**: Ensure all directories exist and npm install completed

**Issue**: Build fails
**Solution**: Check that scripts/build-ma.js has execute permissions

**Issue**: Too many changes showing
**Solution**: You may have uncommitted changes from before. Stash them first.

---

This approach gives you a clean, focused PR with exactly what was specified.