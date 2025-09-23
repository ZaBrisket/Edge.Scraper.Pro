import type { NextApiRequest, NextApiResponse } from 'next';
import { PostHog } from 'posthog-node';
import { clientIp, limitOrThrow } from '../../src/lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.KILL_SWITCH === '1') {
    return res.status(503).json({ error: 'Temporarily unavailable', code: 'KILLED' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const ip = clientIp(req);
    await limitOrThrow(`telemetry:${ip}`, { points: 60, window: '60 s' });

    const { event: name, props, distinctId } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'Missing event' });
    }

    const key = process.env.POSTHOG_KEY;
    const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
    if (!key) {
      return res.status(204).json({});
    }

    const ph = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
    await ph.capture({
      event: name,
      distinctId: distinctId || 'anonymous',
      properties: { ...props, ip },
    });
    await ph.shutdown();

    return res.status(202).json({ ok: true });
  } catch (err: any) {
    console.error('[telemetry error]', err);
    return res.status(err?.statusCode || 500).json({ error: err?.message || 'Internal Error' });
  }
}
