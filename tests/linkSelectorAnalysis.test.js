const test = require('node:test');
const assert = require('node:assert');
const cheerio = require('cheerio');

const { isTooGeneric, analyzeFallback, getSpecificity } = require('../netlify/functions/get-schema.js');

test('isTooGeneric flags selectors matching over half of links', () => {
  const html = '<a></a><a></a><div class="post"><a></a></div>';
  const $ = cheerio.load(html);
  assert.ok(isTooGeneric($, 'a'));
  assert.ok(!isTooGeneric($, '.post a'));
});

test('analyzeFallback finds article tags and class patterns', () => {
  const html = '<article><a></a></article><div class="entry"><a></a></div>';
  const $ = cheerio.load(html);
  const sels = analyzeFallback($);
  assert.ok(sels.includes('article a'));
  assert.ok(sels.includes('.entry a'));
});

test('getSpecificity computes CSS specificity', () => {
  assert.strictEqual(getSpecificity('article a'), 2);
  assert.strictEqual(getSpecificity('.post a'), 11);
  assert.strictEqual(getSpecificity('#id .class a'), 111);
});
