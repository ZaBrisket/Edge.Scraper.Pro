const test = require('node:test');
const assert = require('node:assert');
const { isPrivateIP } = require('../netlify/functions/fetch-url.js');

test('detects private IPv4 addresses', () => {
  assert.strictEqual(isPrivateIP('10.0.0.1'), true);
  assert.strictEqual(isPrivateIP('172.16.0.1'), true);
  assert.strictEqual(isPrivateIP('172.31.255.255'), true);
  assert.strictEqual(isPrivateIP('192.168.1.1'), true);
  assert.strictEqual(isPrivateIP('127.0.0.1'), true);
  assert.strictEqual(isPrivateIP('169.254.2.5'), true);
  assert.strictEqual(isPrivateIP('8.8.8.8'), false);
});

test('detects private IPv6 addresses', () => {
  assert.strictEqual(isPrivateIP('::1'), true);
  assert.strictEqual(isPrivateIP('fe80::1'), true);
  assert.strictEqual(isPrivateIP('fd00::1234'), true);
  assert.strictEqual(isPrivateIP('2001:4860:4860::8888'), false);
});
