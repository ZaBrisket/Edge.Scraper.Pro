import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewResult } from '../../src/nda/types';

process.env.NDA_CACHE_TTL_MS = '50';

async function loadCache() {
  return await import('../../src/nda/cache');
}

function makeResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  const base: ReviewResult = {
    checklistId: 'edgewater-nda',
    checklistVersion: '1.1.0',
    variant: 'A',
    findings: [],
    stats: { tokens: 10, pages: 1, processingMs: 5 },
    audit: { docSha256: 'sha', createdAt: new Date().toISOString() },
  };
  return { ...base, ...overrides, audit: { ...base.audit, ...(overrides.audit || {}) } };
}

test('cache returns stored review within ttl', async () => {
  const cache = await loadCache();
  cache.clearCache();
  cache.__setCacheTtlForTesting(1000);
  const result = makeResult({ audit: { docSha256: 'abc123', createdAt: new Date().toISOString() } });
  cache.setCachedReview(result);
  const hit = cache.getCachedReview('abc123', result.checklistVersion);
  assert.ok(hit, 'expected cached result');
  assert.equal(hit, result);
});

test('cache entry expires after ttl elapses', async () => {
  const cache = await loadCache();
  cache.clearCache();
  cache.__setCacheTtlForTesting(10);
  const result = makeResult({ audit: { docSha256: 'expire', createdAt: new Date().toISOString() } });
  cache.setCachedReview(result);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const hit = cache.getCachedReview('expire', result.checklistVersion);
  assert.equal(hit, null);
});
