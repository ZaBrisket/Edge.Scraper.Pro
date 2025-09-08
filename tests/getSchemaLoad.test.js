const test = require('node:test');
const assert = require('node:assert');

const { handler } = require('../netlify/functions/get-schema.js');

test('get-schema handler is defined', () => {
  assert.strictEqual(typeof handler, 'function');
});
