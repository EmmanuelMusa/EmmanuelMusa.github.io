// A small multilayer perceptron and three toy datasets.
// Pure module: no DOM access, so Node can test it.

/** Seeded random generator (mulberry32). Returns a function giving floats in [0, 1). */
export function makeRng(seed = 1) {
  let a = (Number(seed) >>> 0) || 1;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGauss(rng) {
  return function gauss() {
    const u = 1 - rng();
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

export const DATASETS = ['spirals', 'rings', 'xor'];

const SPIRAL_TURNS = 1.75;
const FIRST_LAYER_GAIN = 3;
const HIDDEN_GAIN = 1.6;

/**
 * Build a two-class dataset of n points in [-1, 1] x [-1, 1].
 * @param {'spirals'|'rings'|'xor'} name
 * @param {number} n
 * @param {number} seed
 * @returns {{ X: number[][], y: number[] }}
 */
export function makeDataset(name, n = 200, seed = 1) {
  const rng = makeRng(seed);
  const gauss = makeGauss(rng);
  const X = [];
  const y = [];

  if (name === 'spirals') {
    const perArm = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const label = i % 2;
      const t = (Math.floor(i / 2) + 0.5) / perArm;
      const radius = 0.1 + 0.8 * t;
      const angle = t * SPIRAL_TURNS * 2 * Math.PI + label * Math.PI;
      X.push([
        clamp1(radius * Math.cos(angle) + gauss() * 0.022),
        clamp1(radius * Math.sin(angle) + gauss() * 0.022),
      ]);
      y.push(label);
    }
  } else if (name === 'rings') {
    for (let i = 0; i < n; i++) {
      const label = i % 2;
      const angle = rng() * 2 * Math.PI;
      const radius = label === 0
        ? 0.34 * Math.sqrt(rng())
        : 0.76 + gauss() * 0.06;
      X.push([clamp1(radius * Math.cos(angle)), clamp1(radius * Math.sin(angle))]);
      y.push(label);
    }
  } else if (name === 'xor') {
    const gap = 0.07;
    for (let i = 0; i < n; i++) {
      const sx = rng() < 0.5 ? -1 : 1;
      const sy = (i % 2 === 0) ? sx : -sx;
      const px = sx * (gap + (0.94 - gap) * rng());
      const py = sy * (gap + (0.94 - gap) * rng());
      X.push([px, py]);
      y.push(sx === sy ? 0 : 1);
    }
  } else {
    throw new Error(`Unknown dataset "${name}". Use one of: ${DATASETS.join(', ')}.`);
  }
  return { X, y };
}

/**
 * Create a network. Hidden units use tanh. The single output uses a sigmoid.
 * @param {{ layers?: number[], seed?: number }} [options]
 */
export function createNetwork({ layers = [2, 8, 8, 1], seed = 1 } = {}) {
  if (!Array.isArray(layers) || layers.length < 2 || layers[layers.length - 1] !== 1) {
    throw new Error('layers must end in a single output unit, for example [2, 8, 8, 1].');
  }
  const rng = makeRng(seed);
  const gauss = makeGauss(rng);
  const W = [];
  const B = [];
  let parameters = 0;
  for (let l = 0; l < layers.length - 1; l++) {
    const fanIn = layers[l];
    const fanOut = layers[l + 1];
    // Xavier scale with a tanh gain. The first layer starts wider so the units
    // spread across the small input square, which keeps spirals from stalling.
    const gain = l === 0 ? FIRST_LAYER_GAIN : HIDDEN_GAIN;
    const scale = gain * Math.sqrt(2 / (fanIn + fanOut));
    const w = new Float64Array(fanIn * fanOut);
    for (let i = 0; i < w.length; i++) w[i] = gauss() * scale;
    W.push(w);
    B.push(new Float64Array(fanOut));
    parameters += w.length + fanOut;
  }
  const zeros = (arrays) => arrays.map((a) => new Float64Array(a.length));
  return {
    layers: layers.slice(),
    parameters,
    W,
    B,
    step: 0,
    // Scratch space: activations and error terms per layer.
    act: layers.map((size) => new Float64Array(size)),
    delta: layers.map((size) => new Float64Array(size)),
    // Gradients and Adam moment estimates.
    gW: zeros(W), gB: zeros(B),
    mW: zeros(W), mB: zeros(B),
    vW: zeros(W), vB: zeros(B),
  };
}

// Runs the network and returns the output before the sigmoid.
function forward(net, x0, x1) {
  const { layers, W, B, act } = net;
  act[0][0] = x0;
  act[0][1] = x1;
  const last = layers.length - 2;
  for (let l = 0; l <= last; l++) {
    const input = act[l];
    const output = act[l + 1];
    const w = W[l];
    const b = B[l];
    const nIn = layers[l];
    const nOut = layers[l + 1];
    for (let j = 0; j < nOut; j++) {
      let sum = b[j];
      const offset = j * nIn;
      for (let i = 0; i < nIn; i++) sum += w[offset + i] * input[i];
      output[j] = l === last ? sum : Math.tanh(sum);
    }
  }
  return act[layers.length - 1][0];
}

function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Probability, from 0 to 1, that point x belongs to class 1. */
export function predict(net, x) {
  const z = forward(net, +x[0] || 0, +x[1] || 0);
  const p = sigmoid(z);
  return Number.isFinite(p) ? p : 0.5;
}

/** Fraction of points, from 0 to 1, that the network labels correctly. */
export function accuracy(net, X, y) {
  if (!X.length) return 0;
  let right = 0;
  for (let s = 0; s < X.length; s++) {
    const guess = forward(net, X[s][0], X[s][1]) >= 0 ? 1 : 0;
    if (guess === y[s]) right++;
  }
  return right / X.length;
}

const BETA1 = 0.9;
const BETA2 = 0.999;
const EPSILON = 1e-8;

/**
 * One full-batch gradient step (backpropagation, Adam update).
 * Returns the mean binary cross-entropy loss measured before the update.
 */
export function trainStep(net, X, y, lr = 0.03) {
  const { layers, W, B, act, delta, gW, gB, mW, mB, vW, vB } = net;
  const count = X.length;
  if (!count) return 0;
  const last = layers.length - 2;

  for (let l = 0; l <= last; l++) {
    gW[l].fill(0);
    gB[l].fill(0);
  }

  let loss = 0;
  for (let s = 0; s < count; s++) {
    const z = forward(net, X[s][0], X[s][1]);
    const target = y[s];
    // Stable cross-entropy from the raw output: max(z, 0) - z * t + log(1 + e^-|z|).
    loss += Math.max(z, 0) - z * target + Math.log1p(Math.exp(-Math.abs(z)));

    delta[last + 1][0] = sigmoid(z) - target;
    for (let l = last; l >= 0; l--) {
      const nIn = layers[l];
      const nOut = layers[l + 1];
      const input = act[l];
      const dOut = delta[l + 1];
      const dIn = delta[l];
      const w = W[l];
      const gw = gW[l];
      const gb = gB[l];
      if (l > 0) dIn.fill(0);
      for (let j = 0; j < nOut; j++) {
        const d = dOut[j];
        const offset = j * nIn;
        gb[j] += d;
        for (let i = 0; i < nIn; i++) {
          gw[offset + i] += d * input[i];
          if (l > 0) dIn[i] += d * w[offset + i];
        }
      }
      if (l > 0) {
        for (let i = 0; i < nIn; i++) dIn[i] *= 1 - input[i] * input[i];
      }
    }
  }

  net.step += 1;
  const correction1 = 1 - Math.pow(BETA1, net.step);
  const correction2 = 1 - Math.pow(BETA2, net.step);
  const update = (param, grad, m, v) => {
    for (let i = 0; i < param.length; i++) {
      const g = grad[i] / count;
      m[i] = BETA1 * m[i] + (1 - BETA1) * g;
      v[i] = BETA2 * v[i] + (1 - BETA2) * g * g;
      param[i] -= lr * (m[i] / correction1) / (Math.sqrt(v[i] / correction2) + EPSILON);
    }
  };
  for (let l = 0; l <= last; l++) {
    update(W[l], gW[l], mW[l], vW[l]);
    update(B[l], gB[l], mB[l], vB[l]);
  }

  return loss / count;
}
