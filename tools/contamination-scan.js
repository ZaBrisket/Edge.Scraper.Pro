#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOCK_PATTERNS = [
  { regex: /\b(Comment on line|Write a reply|chatgpt-codex-connector|\bcursor\[bot\])\b/i },
  { regex: /\bBEGIN PROMPT\b/i },
  { regex: /\bEND PROMPT\b/i },
  { regex: /\bplaceholder\b/i },
  { regex: /\blorem ipsum\b/i },
  { regex: /\bTODO\b/i },
  { regex: /\bFIXME\b/i },
  { regex: /\bHACK\b/i },
  { regex: /\bBUG\b/i },
  { regex: /\bXXX\b/i },
  { regex: /\bWIP\b/i },
  { regex: /@ts-ignore/i },
  { regex: /\/\/\s*eslint-disable/i },
  { regex: /ts-nocheck/i },
  { regex: /debugger/i },
  { regex: /console\.log\(/i },
  { regex: /\bprint\(/i },
  { regex: /sk-[A-Za-z0-9_\-]+/i },
  { regex: /ghp_[A-Za-z0-9]+/i },
  { regex: /AKIA[0-9A-Z]{12,}/ },
  { regex: /-----BEGIN PRIVATE KEY-----/ },
  { regex: /\bit\.skip\b/i },
  { regex: /\bdescribe\.skip\b/i },
  { regex: /\btest\.skip\b/i },
  { regex: /\bxit\b/i },
  { regex: /\bxdescribe\b/i },
  { regex: /\bpending\b/i },
  { regex: /<<<<<<<|=======|>>>>>>>/ },
  { regex: /\bResolved\b/, exact: true }
];
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  'docs',
  'outputs',
  'logs',
  'pr-files',
  'public',
  'sessions'
]);
const ALLOWED_EXTENSIONS = new Set([
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml'
]);
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.eot'
]);
const SCAN_PREFIXES = [
  'src/services/nda',
  'netlify/functions',
  'tests/nda',
  'tools/build-nda-docx.js',
  'tools/contamination-scan.js',
  '.github/workflows'
];

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
      if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        continue;
      }
      if (entry.name === 'package-lock.json') {
        continue;
      }
      const relative = path.relative(ROOT, fullPath);
      const matchesScope = SCAN_PREFIXES.some((prefix) =>
        relative === prefix || relative.startsWith(`${prefix}/`)
      );
      if (!matchesScope) {
        continue;
      }
      scanFile(fullPath, relative);
    }
  }
}

function scanFile(filePath, relativePath) {
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
    if (relativePath.startsWith('.github/workflows') && line.includes('PATTERN=')) {
      continue;
    }
    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.exact) {
        if (line.trim() === 'Resolved') {
          findings.push({ file: relativePath, line: i + 1, text: line.trim() });
          break;
        }
        continue;
      }
      if (pattern.regex.test(line)) {
        findings.push({ file: relativePath, line: i + 1, text: line.trim() });
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
