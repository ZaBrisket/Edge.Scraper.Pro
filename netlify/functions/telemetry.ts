import type { Handler } from '@netlify/functions';
import { PostHog } from 'posthog-node';
import { clientIp, limitOrThrow } from '../../src/lib/rate-limit';

export const handler: Handler = async (event, context) => {
  try {
    if (process.env.KILL_SWITCH === '1') {
      return res(503, { error: 'Temporarily unavailable', code: 'KILLED' });
    }

    await limitOrThrow(`telemetry:${clientIp(event, context)}`, { points: 60, window: '60 s' });

    if (event.httpMethod !== 'POST') {
      return res(405, { error: 'Method Not Allowed' });
    }

    const { event: name, props, distinctId } = JSON.parse(event.body || '{}');
    if (!name) {
      return res(400, { error: 'Missing event' });
    }

    const key = process.env.POSTHOG_KEY;
    const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
    if (!key) {
      return res(204, {});
    }

    const ph = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
    await ph.capture({
      event: name,
      distinctId: distinctId || 'anonymous',
      properties: { ...props, ip: clientIp(event, context) }
    });
    await ph.shutdown();

    return res(202, { ok: true });
  } catch (e: any) {
    console.error('[telemetry error]', e);
    return res(e.statusCode || 500, { error: e.message || 'Internal Error' });
  }
};

function res(statusCode: number, body: any) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
