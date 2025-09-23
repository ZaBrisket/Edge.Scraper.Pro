import test from 'node:test';
import assert from 'node:assert/strict';
import { limitOrThrow } from '../../src/lib/rate-limit';

test('memory fallback blocks after limit', async () => {
  const key = `test:${Math.random()}`;
  for (let i = 0; i < 10; i++) {
    await limitOrThrow(key, { points: 10, window: '60 s' });
  }
  await assert.rejects(() => limitOrThrow(key, { points: 10, window: '60 s' }), (e: any) => e.statusCode === 429);
});
