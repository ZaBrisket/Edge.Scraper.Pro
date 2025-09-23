import test from 'node:test';
import assert from 'node:assert/strict';
import { lemma, tokenizeToLemmas, evalLogic } from '../../src/nda/logic';

test('lemmatizer distinguishes evaluation vs evaluate', () => {
  assert.equal(lemma('evaluating'), 'evaluate');
  assert.equal(lemma('evaluation'), 'evaluation');
  assert.notEqual(lemma('evaluate'), lemma('evaluation'));
});

test('ALL_OF logic requires all terms', () => {
  const tokens = tokenizeToLemmas('evaluate the proposed transaction');
  assert.ok(evalLogic({ kind: 'ALL_OF', terms: ['evaluate', 'propose'] }, tokens));
  assert.ok(!evalLogic({ kind: 'ALL_OF', terms: ['evaluate', 'missing'] }, tokens));
});

test('NEAR logic detects proximity', () => {
  const tokens = tokenizeToLemmas('solely for evaluating the proposed transaction');
  assert.ok(evalLogic({ kind: 'NEAR', a: 'solely', b: 'evaluate', distance: 2 }, tokens));
  assert.ok(!evalLogic({ kind: 'NEAR', a: 'solely', b: 'transaction', distance: 2 }, tokens));
});
