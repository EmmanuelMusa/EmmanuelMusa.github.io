import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDataset,
  createNetwork,
  trainStep,
  predict,
  accuracy,
} from '../assets/js/nn.js';

const NAMES = ['spirals', 'rings', 'xor'];

test('makeDataset returns n points in [-1, 1] with labels 0 or 1', () => {
  for (const name of NAMES) {
    const { X, y } = makeDataset(name, 120, 7);
    assert.equal(X.length, 120, name);
    assert.equal(y.length, 120, name);
    for (const p of X) {
      assert.equal(p.length, 2);
      assert.ok(p[0] >= -1 && p[0] <= 1, `${name} x in range`);
      assert.ok(p[1] >= -1 && p[1] <= 1, `${name} y in range`);
    }
    for (const label of y) assert.ok(label === 0 || label === 1);
    const ones = y.reduce((a, b) => a + b, 0);
    assert.ok(ones > 30 && ones < 90, `${name} has both classes`);
  }
});

test('makeDataset rejects an unknown name', () => {
  assert.throws(() => makeDataset('moons', 10, 1));
});

test('the same seed gives the same dataset', () => {
  for (const name of NAMES) {
    const a = makeDataset(name, 80, 42);
    const b = makeDataset(name, 80, 42);
    assert.deepEqual(a, b, name);
  }
});

test('a different seed gives a different dataset', () => {
  const a = makeDataset('rings', 80, 1);
  const b = makeDataset('rings', 80, 2);
  assert.notDeepEqual(a.X, b.X);
});

test('the same seed gives the same first loss', () => {
  const data = makeDataset('xor', 100, 3);
  const a = createNetwork({ seed: 11 });
  const b = createNetwork({ seed: 11 });
  const lossA = trainStep(a, data.X, data.y, 0.03);
  const lossB = trainStep(b, data.X, data.y, 0.03);
  assert.equal(lossA, lossB);
  assert.ok(Number.isFinite(lossA) && lossA > 0);
});

test('default layers are 2, 8, 8, 1', () => {
  const net = createNetwork({ seed: 1 });
  assert.deepEqual(net.layers, [2, 8, 8, 1]);
});

test('xor: loss falls and accuracy passes 0.9 after 400 steps', () => {
  const data = makeDataset('xor', 200, 5);
  const net = createNetwork({ seed: 9 });
  const first = trainStep(net, data.X, data.y, 0.03);
  let last = first;
  for (let i = 1; i < 400; i++) last = trainStep(net, data.X, data.y, 0.03);
  assert.ok(last < first, `loss fell from ${first} to ${last}`);
  assert.ok(accuracy(net, data.X, data.y) > 0.9);
});

test('rings and spirals are learnable by the default network', () => {
  for (const name of ['rings', 'spirals']) {
    const data = makeDataset(name, 200, 5);
    const net = createNetwork({ seed: 9 });
    for (let i = 0; i < 3000; i++) trainStep(net, data.X, data.y, 0.03);
    const acc = accuracy(net, data.X, data.y);
    assert.ok(acc > 0.9, `${name} accuracy ${acc}`);
  }
});

test('predict always returns a finite number from 0 to 1', () => {
  const net = createNetwork({ seed: 4 });
  const probes = [
    [0, 0], [1, 1], [-1, -1], [0.3, -0.7],
    [1e6, -1e6], [-1e9, 1e9], [1e-12, 0],
  ];
  const check = () => {
    for (const x of probes) {
      const p = predict(net, x);
      assert.ok(Number.isFinite(p), `finite for ${x}`);
      assert.ok(p >= 0 && p <= 1, `in range for ${x}`);
    }
  };
  check();
  const data = makeDataset('rings', 100, 2);
  for (let i = 0; i < 200; i++) trainStep(net, data.X, data.y, 0.05);
  check();
});

test('loss stays finite under a large learning rate', () => {
  const data = makeDataset('xor', 100, 8);
  const net = createNetwork({ seed: 2 });
  for (let i = 0; i < 300; i++) {
    const loss = trainStep(net, data.X, data.y, 1.5);
    assert.ok(Number.isFinite(loss));
  }
});

test('accuracy is a fraction from 0 to 1', () => {
  const data = makeDataset('spirals', 60, 1);
  const net = createNetwork({ seed: 1 });
  const acc = accuracy(net, data.X, data.y);
  assert.ok(acc >= 0 && acc <= 1);
});
