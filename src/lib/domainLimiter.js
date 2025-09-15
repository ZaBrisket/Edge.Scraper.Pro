// src/lib/domainLimiter.js
// Minimal in-memory per-domain limiter to avoid stampedes from a single Netlify lambda instance.
const PQueue = require('p-queue').default;

const queues = new Map();

function getQueue(hostname) {
  if (!queues.has(hostname)) {
    const concurrency = Number(process.env.PER_DOMAIN_CONCURRENCY || 2);
    queues.set(hostname, new PQueue({
      concurrency,
      interval: 1000, // 1s window
      intervalCap: concurrency, // roughly concurrency per second
      carryoverConcurrencyCount: true
    }));
  }
  return queues.get(hostname);
}

async function withDomainLimit(targetUrl, task) {
  const { hostname } = new URL(targetUrl);
  const q = getQueue(hostname);
  return q.add(task);
}

module.exports = { withDomainLimit };