import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type LimitConf = { points: number; window: string };

const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const memory = (globalThis as any).__MEM_LIMIT__ || ((globalThis as any).__MEM_LIMIT__ = new Map<string, { count: number; reset: number }>());

function ttlMs(window: string) {
  const parts = window.trim().split(/\s+/);
  const n = parseInt(parts[0], 10);
  const unit = parts[1] || 's';
  return /s/.test(unit) ? n * 1000 : /m/.test(unit) ? n * 60_000 : n;
}

const ratelimit = hasUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true
    })
  : null;

export async function limitOrThrow(key: string, conf: LimitConf = { points: 10, window: '60 s' }) {
  if (ratelimit) {
    const res = await ratelimit.limit(key);
    if (!res.success) {
      const reset = Math.ceil((res.reset - Date.now()) / 1000);
      const err: any = new Error('Too Many Requests');
      err.statusCode = 429;
      err.reset = reset;
      throw err;
    }
    return;
  }
  // Memory fallback
  const now = Date.now();
  const ms = ttlMs(conf.window);
  const cur = memory.get(key) || { count: 0, reset: now + ms };
  if (now > cur.reset) {
    cur.count = 0;
    cur.reset = now + ms;
  }
  cur.count += 1;
  memory.set(key, cur);
  if (cur.count > conf.points) {
    const err: any = new Error('Too Many Requests');
    err.statusCode = 429;
    err.reset = Math.ceil((cur.reset - now) / 1000);
    throw err;
  }
}

type HeaderSource = {
  headers?: Record<string, string | string[] | undefined> | Headers;
  connection?: { remoteAddress?: string | null };
};

function readHeader(headers: HeaderSource['headers'], key: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }
  const value = headers[key];
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export function clientIp(source: HeaderSource | null | undefined, fallback = 'unknown'): string {
  const header =
    readHeader(source?.headers, 'x-forwarded-for') ||
    readHeader(source?.headers, 'x-real-ip') ||
    readHeader(source?.headers, 'x-nf-client-connection-ip');
  if (header) {
    return header.split(',')[0]?.trim() || fallback;
  }
  return source?.connection?.remoteAddress || fallback;
}
