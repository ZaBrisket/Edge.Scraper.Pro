import test from 'node:test';
import assert from 'node:assert/strict';
import { retry } from '../../src/nda/aspose';

test('retry aborts after max attempts and throws 503', async () => {
  let count = 0;
  const fn = async () => {
    count++;
    const e: any = new Error('upstream');
    e.statusCode = 503;
    throw e;
  };
  await assert.rejects(() => retry(fn, 2, 1), (e: any) => e.code === 'ASPOSE_UNAVAILABLE' && e.statusCode === 503);
  assert.equal(count, 2);
});
