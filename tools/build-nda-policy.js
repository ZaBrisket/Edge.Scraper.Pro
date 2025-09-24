#!/usr/bin/env node
const path = require('path');
const { build } = require('esbuild');

async function run() {
  const entry = path.join(__dirname, '..', 'src', 'services', 'nda', 'browserEntry.ts');
  const outfile = path.join(__dirname, '..', 'public', 'nda', 'policyEngine.browser.js');

  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      format: 'iife',
      target: ['es2019'],
      outfile,
      sourcemap: false,
      legalComments: 'inline',
      banner: {
        js: '/* Auto-generated via npm run build:nda */',
      },
      define: {
        'process.env.NDA_MAX_DOCX_MB': JSON.stringify(process.env.NDA_MAX_DOCX_MB || '5'),
      },
    });
    console.log(`Built NDA policy engine to ${path.relative(process.cwd(), outfile)}`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

run();
