#!/usr/bin/env node
/*
 * Batch-validate a list of URLs using the PFR validator.
 * Usage:
 *   node tools/validate_urls.js /absolute/path/to/urls.txt [--json out.json] [--report out.txt]
 */

const fs = require('fs');
const path = require('path');
const { PFRValidator } = require('../src/lib/pfr-validator');

function readLines(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

function parseArgs(argv) {
  const args = { input: null, json: null, report: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!args.input && !a.startsWith('--')) {
      args.input = a;
    } else if (a === '--json') {
      args.json = argv[++i];
    } else if (a === '--report') {
      args.report = argv[++i];
    }
  }
  if (!args.input) {
    throw new Error('Input file path is required');
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const urls = readLines(inputPath);

  const validator = new PFRValidator();
  const t0 = Date.now();
  const batch = validator.validateBatch(urls);
  const dt = Date.now() - t0;

  const summary = {
    inputPath,
    total: batch.total,
    valid: batch.summary.validCount,
    invalid: batch.summary.invalidCount,
    duplicates: batch.summary.duplicateCount,
    elapsedMs: dt,
    avgPerUrlMs: batch.total > 0 ? dt / batch.total : 0
  };

  // Persist JSON if requested
  if (args.json) {
    const out = {
      summary,
      valid: batch.valid,
      invalid: batch.invalid,
      duplicates: batch.duplicates
    };
    fs.writeFileSync(path.resolve(args.json), JSON.stringify(out, null, 2));
  }

  // Persist text report if requested
  const reportText = validator.generateReport(batch) + `\nElapsed: ${dt}ms (avg ${summary.avgPerUrlMs.toFixed(3)} ms/url)`;
  if (args.report) {
    fs.writeFileSync(path.resolve(args.report), reportText);
  }

  // Print concise summary to stdout
  console.log(JSON.stringify(summary));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

