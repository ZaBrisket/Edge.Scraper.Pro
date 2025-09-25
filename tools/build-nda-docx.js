#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'src/services/nda/docx.ts');
const outdir = path.join(root, 'build', 'nda');

fs.mkdirSync(outdir, { recursive: true });

esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  outfile: path.join(outdir, 'docx.js'),
  sourcemap: true,
  logLevel: 'info'
}).catch((err) => {
  console.error('[build-nda-docx] Failed to bundle nda docx service');
  console.error(err);
  process.exit(1);
});
