import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, buildModel, suggest } from '../assets/js/ngram.js';

const TEXT = `
  The model reads the data. The model reads the logs. The model reads the data again.
  The model writes a lookup. A check backs every number. The data stays local.
  The data is read only.
`;

test('tokenize lowercases and keeps apostrophes and digits', () => {
  assert.deepEqual(
    tokenize("It's 17 tools, Emmanuel's model. 4 of 4!"),
    ["it's", '17', 'tools', "emmanuel's", 'model', '4', 'of', '4'],
  );
});

test('tokenize handles curly apostrophes, decimals and empty input', () => {
  assert.deepEqual(tokenize('don’t wait 2.3 s'), ["don't", 'wait', '2.3', 's']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   \n  '), []);
  assert.deepEqual(tokenize(undefined), []);
  assert.deepEqual(tokenize("'quoted' words"), ['quoted', 'words']);
});

test('buildModel keeps counts for orders 1 to n', () => {
  const model = buildModel(tokenize(TEXT), 3);
  assert.equal(model.n, 3);
  assert.equal(model.total, tokenize(TEXT).length);
  assert.ok(model.vocabSize > 5);
});

test('a known trigram wins after its two-word context', () => {
  const model = buildModel(tokenize(TEXT));
  const out = suggest(model, ['model', 'reads']);
  assert.equal(out[0].word, 'the');
  assert.equal(out[0].order, 3);
  assert.equal(out[0].p, 1);

  const next = suggest(model, ['reads', 'the']);
  assert.equal(next[0].word, 'data');
  assert.equal(next[0].order, 3);
  assert.ok(Math.abs(next[0].p - 2 / 3) < 1e-9);
  assert.equal(next[1].word, 'logs');
});

test('only the last two words of a long context matter for a trigram model', () => {
  const model = buildModel(tokenize(TEXT));
  const a = suggest(model, ['zzz', 'qqq', 'model', 'reads']);
  const b = suggest(model, ['model', 'reads']);
  assert.deepEqual(a, b);
});

test('an unseen context backs off and still returns k items', () => {
  const model = buildModel(tokenize(TEXT));
  const out = suggest(model, ['zebra', 'the'], 3);
  assert.equal(out.length, 3);
  assert.ok(out.every((s) => s.order <= 2));
  assert.equal(out[0].order, 2);

  const cold = suggest(model, ['zebra', 'giraffe'], 3);
  assert.equal(cold.length, 3);
  assert.ok(cold.every((s) => s.order === 1));
});

test('suggestions never repeat a word', () => {
  const model = buildModel(tokenize(TEXT));
  for (const ctx of [[], ['the'], ['model', 'reads'], ['zebra', 'the'], ['x', 'y']]) {
    const words = suggest(model, ctx, 5).map((s) => s.word);
    assert.equal(new Set(words).size, words.length);
  }
});

test('an empty context returns the most frequent words', () => {
  const tokens = tokenize(TEXT);
  const model = buildModel(tokens);
  const out = suggest(model, [], 3);
  assert.equal(out.length, 3);
  assert.ok(out.every((s) => s.order === 1));
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.equal(out[0].word, top[0]);
  assert.ok(Math.abs(out[0].p - top[1] / tokens.length) < 1e-9);
  assert.ok(out[0].p >= out[1].p && out[1].p >= out[2].p);
});

test('probabilities at one order sum to 1 or less', () => {
  const model = buildModel(tokenize(TEXT));
  const contexts = [[], ['the'], ['model'], ['reads', 'the'], ['the', 'model'], ['zebra', 'the']];
  for (const ctx of contexts) {
    const out = suggest(model, ctx, 1000);
    for (const order of [1, 2, 3]) {
      const sum = out.filter((s) => s.order === order).reduce((a, s) => a + s.p, 0);
      assert.ok(sum <= 1 + 1e-9, `order ${order} sums to ${sum} for [${ctx}]`);
    }
    for (const s of out) assert.ok(s.p > 0 && s.p <= 1);
  }
});

test('context matching ignores case', () => {
  const model = buildModel(tokenize(TEXT));
  assert.deepEqual(suggest(model, ['Model', 'READS']), suggest(model, ['model', 'reads']));
});

test('odd input never throws', () => {
  const empty = buildModel([]);
  assert.deepEqual(suggest(empty, ['a', 'b'], 3), []);
  const model = buildModel(tokenize(TEXT));
  assert.equal(suggest(model, undefined, 3).length, 3);
  assert.equal(suggest(model, ['constructor', '__proto__'], 3).length, 3);
  assert.equal(suggest(model, ['the'], 0).length, 0);
  const tiny = buildModel(['one']);
  assert.deepEqual(suggest(tiny, ['one'], 3), [{ word: 'one', p: 1, order: 1 }]);
});

test('a bigram model backs off from order 2', () => {
  const model = buildModel(tokenize(TEXT), 2);
  const out = suggest(model, ['model', 'reads']);
  assert.equal(out[0].word, 'the');
  assert.equal(out[0].order, 2);
});
