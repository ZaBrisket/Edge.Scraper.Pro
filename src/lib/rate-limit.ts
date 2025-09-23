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

export function clientIp(event: any, context: any): string {
  return context?.ip || event?.headers?.['x-nf-client-connection-ip'] || 'unknown';
}
