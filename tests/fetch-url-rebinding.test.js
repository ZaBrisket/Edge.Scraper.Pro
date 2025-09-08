const test = require('node:test');
const assert = require('node:assert');
const dns = require('dns').promises;

const {
  resolveHost,
  safeFetchWithRedirects,
} = require('../netlify/functions/fetch-url.js');

// Helper to restore globals after tests
function withMock(obj, prop, mock, fn) {
  const orig = obj[prop];
  obj[prop] = mock;
  return fn().finally(() => {
    obj[prop] = orig;
  });
}

test('rejects when DNS rebinds to private IP', async (t) => {
  t.after(() => resolveHost.cache.clear());
  const lookups = [
    { address: '1.1.1.1', family: 4 },
    { address: '192.168.0.1', family: 4 },
  ];
  let idx = 0;
  await withMock(dns, 'lookup', async () => lookups[idx++], async () => {
    let called = false;
    await withMock(global, 'fetch', async () => {
      called = true;
      return new Response('ok');
    }, async () => {
      await assert.rejects(() => safeFetchWithRedirects('http://example.com'), /private|rebind/i);
      assert.strictEqual(called, false);
    });
  });
});

test('allows redirect to different public IP', async (t) => {
  t.after(() => resolveHost.cache.clear());
  const lookups = [
    { address: '1.1.1.1', family: 4 },
    { address: '1.1.1.1', family: 4 },
    { address: '2.2.2.2', family: 4 },
    { address: '2.2.2.2', family: 4 },
  ];
  let idx = 0;
  await withMock(dns, 'lookup', async () => lookups[idx++], async () => {
    await withMock(global, 'fetch', async (url) => {
      if (url.includes('1.1.1.1')) {
        return new Response(null, { status: 302, headers: { Location: 'http://redirect.com/final' } });
      }
      return new Response('done', { status: 200 });
    }, async () => {
      const { response, finalUrl } = await safeFetchWithRedirects('http://example.com/start');
      assert.strictEqual(finalUrl, 'http://redirect.com/final');
      assert.strictEqual(await response.text(), 'done');
    });
  });
});

test('cache used and invalidated on mismatch', async (t) => {
  t.after(() => resolveHost.cache.clear());
  const lookups = [
    { address: '1.1.1.1', family: 4 },
    { address: '2.2.2.2', family: 4 },
    { address: '3.3.3.3', family: 4 },
    { address: '5.5.5.5', family: 4 },
  ];
  let idx = 0;
  await withMock(dns, 'lookup', async () => lookups[idx++], async () => {
    const ip1 = await resolveHost('foo.com');
    const ip2 = await resolveHost('foo.com');
    assert.strictEqual(ip1, '1.1.1.1');
    assert.strictEqual(ip2, '1.1.1.1');
    assert.strictEqual(idx, 1);

    resolveHost.cache.get('foo.com').resolvedAt -= 6000;
    const ip3 = await resolveHost('foo.com');
    assert.strictEqual(ip3, '2.2.2.2');
    assert.strictEqual(idx, 2);

    let called = false;
    await withMock(global, 'fetch', async () => {
      called = true;
      return new Response('ok');
    }, async () => {
      await assert.rejects(() => safeFetchWithRedirects('http://foo.com'), /rebind/i);
      assert.strictEqual(called, false);
    });

    assert.strictEqual(resolveHost.cache.has('foo.com'), false);
    const ip4 = await resolveHost('foo.com');
    assert.strictEqual(ip4, '5.5.5.5');
    assert.strictEqual(idx, 4);
  });
});
