const test = require('node:test');
const assert = require('node:assert');

const { extractText, safeParseJson } = require('../netlify/functions/get-schema.js');

// Tests for extractText

test('extracts text from array of parts', () => {
  const resp = {
    candidates: [
      { content: { parts: [{ text: 'hello' }, { text: 'world' }] } }
    ]
  };
  // Should join multiple text parts with a literal \\n separator
  assert.strictEqual(extractText(resp), 'hello\\nworld');
});

test('returns empty string when candidates missing', () => {
  const resp = {}; // Malformed response with no candidates
  // Should gracefully return empty string
  assert.strictEqual(extractText(resp), '');
});

test('handles single text block format', () => {
  const resp = {
    candidates: [
      { content: { parts: { 0: { text: 'solo' } } } }
    ]
  };
  // Should read text from parts[0] even when parts is not an array
  assert.strictEqual(extractText(resp), 'solo');
});

// Tests for safeParseJson

test('parses valid JSON text', () => {
  // Typical valid JSON string should parse to object
  assert.deepStrictEqual(safeParseJson('{"a":1}'), { a: 1 });
});

test('extracts JSON from surrounding text', () => {
  const text = 'prefix {"a":1} suffix';
  // Edge case: JSON embedded within other text should still parse
  assert.deepStrictEqual(safeParseJson(text), { a: 1 });
});

test('returns null for invalid JSON', () => {
  // Malformed input that cannot be parsed
  assert.strictEqual(safeParseJson('not json'), null);
});

test('handles multiple JSON blocks and returns first', () => {
  const text = 'start {"a":1} middle {"b":2} end';
  // Should parse only the first JSON object
  assert.deepStrictEqual(safeParseJson(text), { a: 1 });
});

test('handles braces inside strings', () => {
  const text = 'prefix {"a":"{braces}"} suffix';
  // Braces within string values should not break parsing
  assert.deepStrictEqual(safeParseJson(text), { a: '{braces}' });
});
