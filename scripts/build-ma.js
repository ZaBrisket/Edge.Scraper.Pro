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

// Copy all public assets to dist
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy entire public directory to dist
const publicDir = path.join(process.cwd(), 'public');
const distDir = path.join(process.cwd(), 'dist');

if (fs.existsSync(publicDir)) {
  copyDir(publicDir, distDir);
  console.log('Copied all public assets to dist/');
} else {
  console.log('Warning: public directory not found');
}

console.log('Build complete!');