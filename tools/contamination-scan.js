#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOCK_PATTERNS = [
  { regex: /\b(Comment on line|Write a reply|chatgpt-codex-connector|\bcursor\[bot\])\b/i },
  { regex: /\bResolved\b/, exact: true }
];
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next'
]);
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.eot'
]);

const findings = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) {
        continue;
      }
      if (entry.name === 'package-lock.json') {
        continue;
      }
      scanFile(fullPath);
    }
  }
}

function scanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return;
  }
  if (path.resolve(filePath) === __filename) {
    return;
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.exact) {
        if (line.trim() === 'Resolved') {
          findings.push({ file: path.relative(ROOT, filePath), line: i + 1, text: line.trim() });
          break;
        }
        continue;
      }
      if (pattern.regex.test(line)) {
        findings.push({ file: path.relative(ROOT, filePath), line: i + 1, text: line.trim() });
        break;
      }
    }
  }
}

walk(ROOT);

if (findings.length > 0) {
  console.error('[contamination-scan] Blocked strings detected:');
  for (const finding of findings) {
    console.error(` - ${finding.file}:${finding.line} -> ${finding.text}`);
  }
  process.exit(1);
}

console.log('[contamination-scan] No contamination found.');
