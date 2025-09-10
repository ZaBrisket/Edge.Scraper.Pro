#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function load(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON:', e.message);
    process.exit(1);
  }
}

function main() {
  const input = process.argv[2] || '/mnt/data/error_report_2025-09-10 (3).json';
  if (!fs.existsSync(input)) {
    console.error('Input log not found:', input);
    process.exit(2);
  }
  const data = load(input);
  const events = Array.isArray(data) ? data : (data.events || data.logs || []);
  if (!Array.isArray(events) || events.length === 0) {
    console.error('No events found in log');
    process.exit(3);
  }

  const byHost = new Map();
  const byStatus = new Map();
  const urls = new Set();
  const samples = [];
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const ev of events) {
    const host = ev.host || (ev.url ? new URL(ev.url).host : 'unknown');
    const status = ev.status || ev.statusCode || (ev.error && ev.error.status);
    const message = ev.message || (ev.error && ev.error.message) || '';
    const url = ev.url || (ev.request && ev.request.url);
    if (url) urls.add(url);
    byHost.set(host, (byHost.get(host) || 0) + 1);
    byStatus.set(String(status || 'unknown'), (byStatus.get(String(status || 'unknown')) || 0) + 1);
    const ts = Date.parse(ev.timestamp || ev.time || ev.ts || ev.date);
    if (!Number.isNaN(ts)) {
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
    }
    if (samples.length < 5) {
      samples.push({ timestamp: ev.timestamp || ev.time, host, status, url, message });
    }
  }

  console.log('total_events', events.length);
  console.log('time_window', {
    start: isFinite(minTs) ? new Date(minTs).toISOString() : null,
    end: isFinite(maxTs) ? new Date(maxTs).toISOString() : null,
  });
  console.log('by_host', Object.fromEntries(byHost));
  console.log('by_status', Object.fromEntries(byStatus));
  console.log('unique_urls', urls.size);
  console.log('sample_events', samples);

  // Quick 429→500 and circuit analysis
  const upstream429As500 = events.filter((e) => {
    const msg = (e.message || (e.error && e.error.message) || '').toLowerCase();
    const sc = e.status || e.statusCode;
    return sc === 500 && msg.includes('429');
  }).length;
  const circuitOpen = events.filter((e) => (e.message || '').toLowerCase().includes('circuit') && (e.message || '').toLowerCase().includes('open')).length;
  console.log('pattern_counts', { upstream429As500, circuitOpen });
}

if (require.main === module) main();

