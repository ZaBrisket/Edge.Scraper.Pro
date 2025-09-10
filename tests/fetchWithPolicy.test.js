const test = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const http = require('node:http');

process.env.HTTP_MAX_RETRIES = '1';
process.env.HTTP_DEADLINE_MS = '500';
process.env.HTTP_CIRCUIT_BREAKER_THRESHOLD = '2';
process.env.HTTP_CIRCUIT_BREAKER_RESET_MS = '1000';
process.env.HTTP_RATE_LIMIT_PER_SEC = '5';
process.env.HTTP_MAX_CONCURRENCY = '1';

const { fetchWithPolicy } = require('../src/lib/http/client');
const { TimeoutError, CircuitOpenError, NetworkError, RateLimitError } = require('../src/lib/http/errors');

test('retries on 500 and succeeds', async (t) => {
  let count = 0;
  const server = http.createServer((req, res) => {
    count++;
    if (count === 1) {
      res.writeHead(500);
      res.end('err');
    } else {
      res.writeHead(200);
      res.end('ok');
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const res = await fetchWithPolicy(`http://127.0.0.1:${port}/`);
  assert.strictEqual(res.status, 200);
});

test('enforces timeout', async () => {
  nock('http://slow.com').get('/').delay(200).reply(200, 'slow');
  await assert.rejects(() => fetchWithPolicy('http://slow.com/', { timeout: 50 }), TimeoutError);
});

test('opens circuit after failures', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(500);
    res.end('nope');
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  await assert.rejects(() => fetchWithPolicy(`http://127.0.0.1:${port}/`), NetworkError);
  await assert.rejects(() => fetchWithPolicy(`http://127.0.0.1:${port}/`), CircuitOpenError);
  server.close();
});

test('handles 429 with Retry-After header and does not open circuit', async (t) => {
  let count = 0;
  const server = http.createServer((req, res) => {
    count++;
    if (count === 1) {
      res.setHeader('Retry-After', '1');
      res.writeHead(429);
      res.end('rate limited');
    } else {
      res.writeHead(200);
      res.end('ok');
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const res = await fetchWithPolicy(`http://127.0.0.1:${port}/`, { retries: 2 });
  assert.strictEqual(res.status, 200);
});
