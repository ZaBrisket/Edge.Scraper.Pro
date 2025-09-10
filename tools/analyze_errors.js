#!/usr/bin/env node

/**
 * Quick error log analyzer
 *
 * Usage:
 *   node tools/analyze_errors.js --file "/mnt/data/error_report_2025-09-10 (3).json"
 *
 * Accepts:
 * - JSON array
 * - NDJSON (one JSON per line)
 *
 * Prints: total errors, window, by host/status tallies, top messages, example URLs.
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { file: '/mnt/data/error_report_2025-09-10 (3).json', head: 5 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--file' || a === '-f') && argv[i + 1]) {
      args.file = argv[++i];
    } else if ((a === '--head' || a === '-n') && argv[i + 1]) {
      args.head = Number(argv[++i]);
    }
  }
  return args;
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Could not read file: ${filePath}`);
    return null;
  }
}

function parseLog(text) {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const data = JSON.parse(trimmed);
    return Array.isArray(data) ? data : [data];
  } catch {
    // Try NDJSON
    const lines = trimmed.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      try {
        out.push(JSON.parse(l));
      } catch {
        // skip
      }
    }
    return out;
  }
}

function coalesce(val, alt) {
  return typeof val === 'undefined' || val === null ? alt : val;
}

function analyze(entries) {
  const byHost = new Map();
  const byStatus = new Map();
  const urls = new Set();
  const messages = new Map();
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const e of entries) {
    const host = coalesce(e.host, (e.url && safeHost(e.url)) || 'unknown');
    const status = coalesce(e.status, e.statusCode || e.http_status || 'unknown');
    const message = coalesce(e.message, e.error || e.reason || '');
    const url = coalesce(e.url, e.requestUrl || e.target || '');
    const tsStr = coalesce(e.timestamp, e.ts || e.time || e.date || null);
    const ts = tsStr ? Date.parse(tsStr) : NaN;

    incr(byHost, host);
    incr(byStatus, status);
    if (url) urls.add(url);
    if (message) incr(messages, normalizeMessage(message));
    if (!Number.isNaN(ts)) {
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
    }
  }

  return {
    total: entries.length,
    window: isFinite(minTs) && isFinite(maxTs)
      ? { start: new Date(minTs).toISOString(), end: new Date(maxTs).toISOString() }
      : null,
    byHost: sortMap(byHost),
    byStatus: sortMap(byStatus),
    uniqueUrls: urls.size,
    topMessages: sortMap(messages),
    sample: entries.slice(0, 5),
  };
}

function incr(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortMap(map) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function safeHost(u) {
  try {
    return new URL(u).host;
  } catch {
    return 'unknown';
  }
}

function printReport(filePath, report, head = 5) {
  console.log('=== Error Log Analysis ===');
  console.log('File:', filePath);
  console.log('Total errors:', report.total);
  if (report.window) {
    console.log('Time window:', report.window.start, '→', report.window.end);
  }
  console.log('\nTop hosts:');
  for (const [host, count] of report.byHost.slice(0, head)) {
    console.log(`- ${host}: ${count}`);
  }
  console.log('\nBy status:');
  for (const [status, count] of report.byStatus.slice(0, head)) {
    console.log(`- ${status}: ${count}`);
  }
  console.log(`\nUnique URLs: ${report.uniqueUrls}`);
  console.log('\nTop messages:');
  for (const [msg, count] of report.topMessages.slice(0, head)) {
    console.log(`- ${msg}: ${count}`);
  }
  console.log('\nExamples:');
  for (const ex of report.sample) {
    console.log('- ', JSON.stringify({ host: ex.host || safeHost(ex.url), status: ex.status || ex.statusCode, url: ex.url, message: ex.message }, null, 0));
  }
}

function normalizeMessage(message) {
  if (typeof message !== 'string') return String(message);
  return message
    .replace(/\b(circuit|breaker).*open\b/i, 'circuit open')
    .replace(/\b(429|rate\s*limit)\b/i, '429 rate limit')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const args = parseArgs(process.argv);
  const text = safeReadFile(args.file);
  if (!text) {
    console.error('Log file not found. Provide a path with --file.');
    process.exitCode = 2;
    return;
  }
  const entries = parseLog(text);
  const report = analyze(entries);
  printReport(args.file, report, args.head);
}

main();

