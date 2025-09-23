import type { ReviewResult } from './types';

type CacheKey = string;

const CACHE = new Map<CacheKey, { expiresAt: number; result: ReviewResult }>();
const MAX_SIZE = 100;
let TTL_MS = parseInt(process.env.NDA_CACHE_TTL_MS || '600000', 10);

function key(docSha256: string, version: string): CacheKey {
  return `${version}:${docSha256}`;
}

function prune(now: number) {
  for (const [k, entry] of Array.from(CACHE.entries())) {
    if (entry.expiresAt <= now) {
      CACHE.delete(k);
    }
  }
  if (CACHE.size > MAX_SIZE) {
    const keys = Array.from(CACHE.keys());
    const drop = CACHE.size - MAX_SIZE;
    for (let i = 0; i < drop; i++) {
      CACHE.delete(keys[i]);
    }
  }
}

export function getCachedReview(docSha256: string, version: string): ReviewResult | null {
  const now = Date.now();
  prune(now);
  const entry = CACHE.get(key(docSha256, version));
  if (!entry || entry.expiresAt <= now) {
    if (entry) CACHE.delete(key(docSha256, version));
    return null;
  }
  return entry.result;
}

export function setCachedReview(result: ReviewResult) {
  const now = Date.now();
  prune(now);
  CACHE.set(key(result.audit.docSha256, result.checklistVersion), {
    result,
    expiresAt: now + TTL_MS,
  });
}

export function clearCache() {
  CACHE.clear();
}

export function __setCacheTtlForTesting(ms: number) {
  TTL_MS = Math.max(0, ms);
}
