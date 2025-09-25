#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const REPORT_PATH = path.join(REPORTS_DIR, 'contamination-report.md');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  'logs',
  'sessions',
]);

const SKIP_PATTERNS = [
  `${path.sep}outputs${path.sep}samples${path.sep}`,
];

const PATTERNS = [
  {
    name: 'console.log',
    regex: /console\.log\(/,
    filter: (rel) => (rel.startsWith('src/')
      || rel.startsWith('netlify/functions/')
      || rel.startsWith('public/targets/'))
      && !rel.startsWith('src/lib/logger'),
  },
  {
    name: 'debugger',
    regex: /\bdebugger\b/,
    filter: (rel, line) => !rel.startsWith('scripts/')
      && !rel.startsWith('.github/')
      && !rel.startsWith('tools/')
      && !line.includes('no-debugger')
      && !/['"]debugger['"]/i.test(line),
  },
  {
    name: 'todo',
    regex: /\bTODO\b/i,
    filter: (rel) => !rel.startsWith('public/vendor/')
      && rel !== 'scripts/contamination-scan.mjs'
      && !rel.startsWith('.github/'),
  },
  {
    name: 'fixme',
    regex: /\bFIXME\b/i,
    filter: (rel) => !rel.startsWith('scripts/') && !rel.startsWith('.github/'),
  },
  {
    name: 'it.only',
    regex: /\bit\.only\b/,
    filter: (rel) => !rel.startsWith('scripts/'),
  },
  {
    name: 'describe.only',
    regex: /\bdescribe\.only\b/,
    filter: (rel) => !rel.startsWith('scripts/'),
  },
  {
    name: 'fdescribe',
    regex: /\bfdescribe\b/,
    filter: (rel) => !rel.startsWith('scripts/'),
  },
  {
    name: 'fit',
    regex: /\bfit\(/,
    filter: (rel) => !rel.startsWith('scripts/'),
  },
  {
    name: 'xdescribe',
    regex: /\bxdescribe\b/,
    filter: (rel) => !rel.startsWith('scripts/'),
  },
  { name: 'xit', regex: /\bxit\(/ },
  {
    name: 'API_KEY assignment',
    regex: /(?<![A-Za-z0-9_])API_KEY\s*=\s*['"][^'"\s]+['"]/i,
    filter: (rel) => rel !== 'netlify.toml',
  },
  {
    name: 'Bearer token',
    regex: /Bearer\s+[A-Za-z0-9\-_\.]{15,}/,
  },
  {
    name: 'PEM block',
    regex: /-----BEGIN [^-]+-----/,
    filter: (rel) => !rel.startsWith('tools/') && !rel.startsWith('.github/'),
  },
  {
    name: 'private key text',
    regex: /PRIVATE KEY/i,
    filter: (rel) => !rel.startsWith('scripts/') && !rel.startsWith('tools/') && !rel.startsWith('.github/'),
  },
  {
    name: 'suspicious base64',
    regex: /[A-Za-z0-9+/=]{200,}/,
    filter: (rel) => !rel.startsWith('public/vendor/') && !rel.endsWith('.min.js'),
  },
];

const findings = new Map();

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (shouldSkip(fullPath)) {
      continue;
    }
    await scanFile(fullPath);
  }
}

function shouldSkip(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (!rel) return true;
  if (rel.startsWith(`reports${path.sep}`)) return true;
  if (rel === 'package-lock.json') return true;
  return SKIP_PATTERNS.some((token) => rel.includes(token));
}

async function scanFile(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return;
  }
  const relPath = path.relative(ROOT, filePath);
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of PATTERNS) {
      if (typeof pattern.filter === 'function' && !pattern.filter(relPath, line)) {
        continue;
      }
      if (!pattern.regex.test(line)) {
        continue;
      }
      if (pattern.name === 'suspicious base64' && line.trim().length < 220) {
        continue;
      }
      const group = findings.get(pattern.name) || [];
      group.push({ file: relPath, line: i + 1, text: line.trim().slice(0, 200) });
      findings.set(pattern.name, group);
      break;
    }
  }
}

async function ensureReportsDir() {
  try {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

function printReport() {
  if (findings.size === 0) {
    console.log('[contamination-scan] No contamination patterns detected.');
    return;
  }
  console.log('[contamination-scan] Potential contamination detected:');
  for (const [name, entries] of findings.entries()) {
    console.log(`\n== ${name} ==`);
    for (const entry of entries) {
      console.log(` - ${entry.file}:${entry.line} -> ${entry.text}`);
    }
  }
}

async function writeReportFile() {
  await ensureReportsDir();
  if (findings.size === 0) {
    const content = `# Contamination Scan Report\n\nScan Date: ${new Date().toISOString()}\n\nNo contamination patterns found.\n`;
    await fs.writeFile(REPORT_PATH, content, 'utf8');
    return;
  }

  let body = `# Contamination Scan Report\n\nScan Date: ${new Date().toISOString()}\n\n`;
  body += 'The following patterns were detected:\n\n';
  for (const [name, entries] of findings.entries()) {
    body += `## ${name}\n`;
    for (const entry of entries.slice(0, 20)) {
      body += `- ${entry.file}:${entry.line} — ${entry.text}\n`;
    }
    if (entries.length > 20) {
      body += `- … ${entries.length - 20} additional occurrence(s)\n`;
    }
    body += '\n';
  }
  await fs.writeFile(REPORT_PATH, body, 'utf8');
}

async function main() {
  await walk(ROOT);
  printReport();
  await writeReportFile();
  if (findings.size > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[contamination-scan] Failed:', error);
  process.exitCode = 1;
});
