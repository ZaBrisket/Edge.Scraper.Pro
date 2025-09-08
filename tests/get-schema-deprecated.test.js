const test = require('node:test');
const assert = require('node:assert');

const { handler } = require('../netlify/functions/get-schema');

test('get-schema returns 410 with SCHEMA_REMOVED', async () => {
  const res = await handler({ httpMethod: 'POST' });
  assert.strictEqual(res.statusCode, 410);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.error && body.error.code, 'SCHEMA_REMOVED');
});
