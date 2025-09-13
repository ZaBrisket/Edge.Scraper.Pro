const fs = require('fs');
const path = require('path');

console.log('Building M&A Scraper...');

// Ensure directories exist
const dirs = [
  'dist',
  'netlify/functions',
  'src/lib/extractors',
  'src/lib/discovery',
  'src/config'
];

dirs.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Copy index.html to dist
const indexPath = path.join(process.cwd(), 'public', 'index.html');
const distIndexPath = path.join(process.cwd(), 'dist', 'index.html');

if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, distIndexPath);
  console.log('Copied index.html to dist/');
}

console.log('Build complete!');