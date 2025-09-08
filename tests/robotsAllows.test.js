const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { robotsAllows } = require('../netlify/functions/fetch-url.js');

test('robotsAllows returns false when path is disallowed', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nDisallow: /private');
    } else {
      res.writeHead(200);
      res.end('ok');
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/private/page`;
  const allowed = await robotsAllows(url);
  assert.strictEqual(allowed, false);
});

test('robotsAllows returns true when Allow overrides broader Disallow', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nDisallow: /folder\nAllow: /folder/public.html');
    } else {
      res.writeHead(200);
      res.end('ok');
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/folder/public.html`;
  const allowed = await robotsAllows(url);
  assert.strictEqual(allowed, true);
});
