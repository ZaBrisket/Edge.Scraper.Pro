#!/usr/bin/env node

// This is a wrapper to run the TypeScript CLI through tsx
const { execFileSync } = require('child_process');
const path = require('path');

// Get the directory where this script is located
const scriptDir = __dirname;
const tsFile = path.join(scriptDir, 'edge-scraper.ts');

// Pass all arguments to tsx, excluding the first two (node and script path)
const args = process.argv.slice(2);

try {
  // Run tsx with the TypeScript file and all passed arguments
  execFileSync('npx', ['tsx', tsFile, ...args], {
    stdio: 'inherit',
    cwd: path.join(scriptDir, '..') // Run from project root
  });
} catch (error) {
  // Exit with the same code as the child process
  process.exit(error.status || 1);
}