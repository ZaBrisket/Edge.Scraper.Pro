#!/usr/bin/env node

// Edge.Scraper.Pro CLI - Compiled JavaScript entry point
// This file is the actual binary entry point that gets executed
// It uses tsx to run the TypeScript source file with proper TS support

const { spawn } = require('child_process');
const path = require('path');

// Path to the TypeScript source file
const tsFile = path.join(__dirname, 'edge-scraper.ts');

// Run the TypeScript file using tsx
const child = spawn('npx', ['tsx', tsFile, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('Failed to start CLI:', err.message);
  console.error('Make sure tsx is installed: npm install -g tsx');
  process.exit(1);
});