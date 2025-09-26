#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const files = process.argv.slice(2);
const patterns = [
  { name: '.only usage', regex: /\b(?:it|describe|test)\.only\b/ },
  { name: 'debugger statement', regex: /(?<!-)\bdebugger\b/ },
];

const ignored = new Set([
  'scripts/contamination-scan.mjs',
  'scripts/lint-staged-guard.mjs',
]);

async function main() {
  if (files.length === 0) {
    process.exit(0);
  }

  const violations = [];

  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    if (ignored.has(relative)) {
      continue;
    }

    try {
      const content = await fs.readFile(file, 'utf8');
      for (const pattern of patterns) {
        if (pattern.regex.test(content)) {
          violations.push({ file: relative, pattern: pattern.name });
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`[lint-staged-guard] Failed to read ${file}:`, error.message);
        process.exit(1);
      }
    }
  }

  if (violations.length > 0) {
    console.error('[lint-staged-guard] Blocked patterns detected:');
    for (const violation of violations) {
      console.error(` - ${violation.pattern} in ${violation.file}`);
    }
    process.exit(1);
  }
}

main();
