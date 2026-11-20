// Fig. 1: draws the training run and wires its controls.
import { makeDataset, createNetwork, trainStep, predict, accuracy } from './nn.js';

const POINTS = 200;
const LEARNING_RATE = 0.02;
const DOMAIN = 1.12;            // the plot shows x and y from -1.12 to 1.12
const STEP_BUDGET_MS = 5;       // most time one frame may spend on training
const MAX_STEPS_PER_FRAME = 6;
const LOSS_TARGET = 0.012;
const EPOCH_CAP = { spirals: 1800, rings: 600, xor: 600 };
const CONTOUR_LEVELS = [0.1, 0.3, 0.7, 0.9];

const root = document.getElementById('run');
if (root) start(root);

function start(root) {
  const el = {
    field: root.querySelector('#run-field'),
    chart: root.querySelector('#run-loss-chart'),
    net: root.querySelector('#run-net'),
    epoch: root.querySelector('#run-epoch'),
    loss: root.querySelector('#run-loss'),
    acc: root.querySelector('#run-acc'),
    status: root.querySelector('#run-status'),
    seed: root.querySelector('#run-seed'),
    summary: root.querySelector('#run-summary'),
    pause: root.querySelector('#run-pause'),
    restart: root.querySelector('#run-restart'),
    radios: [...root.querySelectorAll('input[name="dataset"]')],
  };
  if (!el.field || !el.field.getContext) return;

  const css = getComputedStyle(document.documentElement);
  const hex = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
  const colour = {
    ink: hex('--ink', '#0c1926'),
    paper: hex('--paper', '#efe6d2'),
    paper2: hex('--paper-2', '#c4c0ae'),
    paper3: hex('--paper-3', '#93a0a8'),
    line: hex('--line-2', '#2d465e'),
    signal: hex('--signal', '#ffb13c'),
    data: hex('--data', '#7cbcd6'),
  };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const INK = rgb(colour.ink);
  const WARM = rgb(colour.signal);
  const COOL = rgb(colour.data);
  const monoFont = (px) => `${px}px "Martian Mono", Consolas, monospace`;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const state = {
    dataset: 'spirals',
    seed: 1,
    runId: 0,
    net: null,
    data: null,
    epoch: 0,
    loss: NaN,
    acc: 0,
    history: [],
    done: false,
    animating: false,
    userPaused: false,
    onScreen: true,
    budget: 0,
    lastTime: 0,
    raf: 0,
    grid: 64,
    fieldEvery: 1,
    frame: 0,
    ticks: 0,
    cost: 0,
  };

  // ----- canvas plumbing -----

  const surfaces = [el.field, el.chart, el.net].map((canvas) => ({
    canvas, ctx: canvas.getContext('2d'), w: 0, h: 0,
  }));
  const [fieldS, chartS, netS] = surfaces;
  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d');
  let fieldValues = new Float32Array(0);
  let fieldImage = null;

  function fit(surface) {
    const box = surface.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    if (surface.w === w && surface.h === h && surface.dpr === dpr) return;
    surface.w = w;
    surface.h = h;
    surface.dpr = dpr;
    surface.canvas.width = Math.round(w * dpr);
    surface.canvas.height = Math.round(h * dpr);
    surface.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setGrid(size) {
    state.grid = size;
    offscreen.width = size + 1;
    offscreen.height = size + 1;
    fieldValues = new Float32Array((size + 1) * (size + 1));
    fieldImage = offCtx.createImageData(size + 1, size + 1);
  }

  // ----- drawing: the decision field -----

  function drawField() {
    const { ctx, w, h } = fieldS;
    const G = state.grid;
    const N = G + 1;
    const pixels = fieldImage.data;
    const probe = [0, 0];

    for (let j = 0; j < N; j++) {
      probe[1] = DOMAIN - (2 * DOMAIN * j) / G;
      for (let i = 0; i < N; i++) {
        probe[0] = -DOMAIN + (2 * DOMAIN * i) / G;
        const p = predict(state.net, probe);
        fieldValues[j * N + i] = p;
        const t = p * 2 - 1;
        const tint = t >= 0 ? WARM : COOL;
        const amount = Math.pow(Math.abs(t), 0.85) * (t >= 0 ? 0.3 : 0.32);
        const k = (j * N + i) * 4;
        pixels[k] = INK[0] + (tint[0] - INK[0]) * amount;
        pixels[k + 1] = INK[1] + (tint[1] - INK[1]) * amount;
        pixels[k + 2] = INK[2] + (tint[2] - INK[2]) * amount;
        pixels[k + 3] = 255;
      }
    }
    offCtx.putImageData(fieldImage, 0, 0);

    const cell = w / G;
    const cellY = h / G;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(offscreen, -cell / 2, -cellY / 2, N * cell, N * cellY);

    // Faint iso-probability lines, then the decision boundary at p = 0.5.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const level of CONTOUR_LEVELS) traceContour(ctx, level, G, cell, cellY);
    ctx.strokeStyle = colour.paper;
    ctx.globalAlpha = 0.13;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    traceContour(ctx, 0.5, G, cell, cellY);
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    drawAxes(ctx, w, h);
    drawPoints(ctx, w, h);
  }

  // Marching squares over the grid of predictions.
  function traceContour(ctx, level, G, cw, ch) {
    const N = G + 1;
    const v = fieldValues;
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const a = v[j * N + i];
        const b = v[j * N + i + 1];
        const c = v[(j + 1) * N + i + 1];
        const d = v[(j + 1) * N + i];
        const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const x = i * cw;
        const y = j * ch;
        const top = [x + cw * ((level - a) / (b - a)), y];
        const right = [x + cw, y + ch * ((level - b) / (c - b))];
        const bottom = [x + cw * ((level - d) / (c - d)), y + ch];
        const left = [x, y + ch * ((level - a) / (d - a))];
        const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
        switch (code) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, top); break;
          case 5: seg(left, top); seg(bottom, right); break;
          case 10: seg(top, right); seg(left, bottom); break;
          default: break;
        }
      }
    }
  }

  const toX = (x, w) => ((x + DOMAIN) / (2 * DOMAIN)) * w;
  const toY = (y, h) => ((DOMAIN - y) / (2 * DOMAIN)) * h;

  function drawAxes(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = colour.paper;
    ctx.fillStyle = colour.paper;
    ctx.lineWidth = 1;
    ctx.font = monoFont(9.5);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let k = -4; k <= 4; k++) {
      const value = k / 4;
      const major = k % 2 === 0;
      const x = Math.round(toX(value, w)) + 0.5;
      const y = Math.round(toY(value, h)) + 0.5;
      const len = major ? 7 : 4;
      ctx.moveTo(x, h); ctx.lineTo(x, h - len);
      ctx.moveTo(0, y); ctx.lineTo(len, y);
      ctx.moveTo(x, 0); ctx.lineTo(x, len * 0.6);
      ctx.moveTo(w, y); ctx.lineTo(w - len * 0.6, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const value of [-1, 0, 1]) {
      ctx.fillText(label(value), 11, toY(value, h));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const value of [0, 1]) {
      ctx.fillText(label(value), toX(value, w), h - 11);
    }
    ctx.restore();
  }

  const label = (value) => (value < 0 ? `−${Math.abs(value)}` : String(value));

  function drawPoints(ctx, w, h) {
    const { X, y } = state.data;
    const r = w < 300 ? 2.6 : w < 440 ? 3 : 3.5;
    ctx.lineWidth = 1.25;
    for (let s = 0; s < X.length; s++) {
      const px = toX(X[s][0], w);
      const py = toY(X[s][1], h);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      if (y[s] === 1) {
        ctx.fillStyle = colour.signal;
        ctx.strokeStyle = colour.ink;
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = colour.ink;
        ctx.strokeStyle = '#b9e0f2';
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // ----- drawing: the loss curve -----

  const LOG_TOP = Math.log10(2);
  const LOG_BOTTOM = Math.log10(0.004);

  function niceMax(epoch) {
    for (const stop of [100, 200, 400, 800, 1200, 1800, 2400]) if (epoch <= stop) return stop;
    return epoch;
  }

  function drawChart() {
    const { ctx, w, h } = chartS;
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 44, r: 14, t: 22, b: 20 };
    const pw = Math.max(10, w - pad.l - pad.r);
    const ph = Math.max(10, h - pad.t - pad.b);
    const xMax = niceMax(state.history.length);
    const yOf = (loss) => {
      const v = Math.log10(Math.min(2, Math.max(0.004, loss)));
      return pad.t + ((LOG_TOP - v) / (LOG_TOP - LOG_BOTTOM)) * ph;
    };
    const xOf = (epoch) => pad.l + (epoch / xMax) * pw;

    ctx.font = monoFont(9.5);
    ctx.lineWidth = 1;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (const tick of [1, 0.1, 0.01]) {
      const y = Math.round(yOf(tick)) + 0.5;
      ctx.strokeStyle = colour.line;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
      ctx.fillStyle = colour.paper3;
      ctx.fillText(String(tick), pad.l - 8, y);
    }
    ctx.strokeStyle = colour.paper3;
    ctx.beginPath();
    ctx.moveTo(pad.l + 0.5, pad.t - 4);
    ctx.lineTo(pad.l + 0.5, pad.t + ph + 0.5);
    ctx.lineTo(pad.l + pw, pad.t + ph + 0.5);
    ctx.stroke();

    ctx.fillStyle = colour.paper3;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('loss, log scale', pad.l + 8, pad.t - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`epoch ${xMax}`, pad.l + pw, h - 5);
    ctx.textAlign = 'left';
    ctx.fillText('0', pad.l, h - 5);

    const hist = state.history;
    if (!hist.length) return;
    const stride = Math.max(1, Math.floor(hist.length / (pw * 1.5)));
    ctx.beginPath();
    for (let i = 0; i < hist.length; i += stride) {
      const x = xOf(i + 1);
      const y = yOf(hist[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const endX = xOf(hist.length);
    const endY = yOf(hist[hist.length - 1]);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = colour.paper;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(endX, endY, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = colour.signal;
    ctx.fill();
  }

  // ----- drawing: the network and its weights -----

  function drawNet() {
    const { ctx, w, h } = netS;
    ctx.clearRect(0, 0, w, h);
    const net = state.net;
    const layers = net.layers;
    const pad = { l: 30, r: 30, t: 12, b: 24 };
    const colX = (l) => pad.l + (l / (layers.length - 1)) * (w - pad.l - pad.r);
    const rowY = (l, i) => pad.t + ((i + 0.5) / layers[l]) * (h - pad.t - pad.b);

    let biggest = 1e-6;
    for (const layer of net.W) for (const value of layer) biggest = Math.max(biggest, Math.abs(value));

    for (let l = 0; l < layers.length - 1; l++) {
      const nIn = layers[l];
      const nOut = layers[l + 1];
      for (let j = 0; j < nOut; j++) {
        for (let i = 0; i < nIn; i++) {
          const weight = net.W[l][j * nIn + i];
          const strength = Math.min(1, Math.abs(weight) / biggest);
          ctx.strokeStyle = weight >= 0 ? colour.signal : colour.data;
          ctx.globalAlpha = 0.12 + 0.78 * strength;
          ctx.lineWidth = 0.5 + 1.4 * strength;
          ctx.beginPath();
          ctx.moveTo(colX(l), rowY(l, i));
          ctx.lineTo(colX(l + 1), rowY(l + 1, j));
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    for (let l = 0; l < layers.length; l++) {
      for (let i = 0; i < layers[l]; i++) {
        ctx.beginPath();
        ctx.arc(colX(l), rowY(l, i), 2.6, 0, Math.PI * 2);
        ctx.fillStyle = colour.ink;
        ctx.strokeStyle = colour.paper;
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.font = monoFont(9.5);
    ctx.fillStyle = colour.paper3;
    ctx.textBaseline = 'alphabetic';
    const names = layers.map((size, l) => (
      l === 0 ? `${size} in` : l === layers.length - 1 ? `${size} out` : `${size} tanh`
    ));
    names.forEach((name, l) => {
      ctx.textAlign = l === 0 ? 'left' : l === layers.length - 1 ? 'right' : 'center';
      const x = l === 0 ? colX(l) - 18 : l === layers.length - 1 ? colX(l) + 18 : colX(l);
      ctx.fillText(name, x, h - 7);
    });
  }

  // ----- readouts -----

  function writeReadouts() {
    el.epoch.textContent = String(state.epoch);
    el.loss.textContent = Number.isFinite(state.loss) ? state.loss.toFixed(4) : '0.0000';
    el.acc.textContent = `${(state.acc * 100).toFixed(1)}%`;
  }

  function setStatus(text, key) {
    el.status.textContent = text;
    root.dataset.state = key;
  }

  function drawAll() {
    surfaces.forEach(fit);
    drawField();
    drawChart();
    drawNet();
    writeReadouts();
  }

  // ----- training -----

  function step() {
    state.loss = trainStep(state.net, state.data.X, state.data.y, LEARNING_RATE);
    state.epoch += 1;
    state.history.push(state.loss);
    if (state.loss < LOSS_TARGET || state.epoch >= EPOCH_CAP[state.dataset]) state.done = true;
  }

  // Epochs per frame at 60 frames a second. Slow at first so the boundary can be watched.
  function pace(epoch) {
    if (epoch < 40) return 0.34;
    if (epoch < 120) return 0.5;
    if (epoch < 300) return 1;
    if (epoch < 700) return 2;
    return 4;
  }

  function canRun() {
    return state.animating && !state.done && !state.userPaused && state.onScreen && !document.hidden;
  }

  function schedule() {
    if (state.raf || !canRun()) return;
    state.lastTime = 0;
    state.raf = requestAnimationFrame(frame);
    setStatus('training', 'training');
  }

  function frame(now) {
    state.raf = 0;
    if (!canRun()) return;
    const began = performance.now();
    const elapsed = state.lastTime ? Math.min(50, now - state.lastTime) : 16.7;
    state.lastTime = now;
    state.budget += pace(state.epoch) * (elapsed / 16.7);

    let stepped = 0;
    while (state.budget >= 1 && !state.done && stepped < MAX_STEPS_PER_FRAME) {
      step();
      state.budget -= 1;
      stepped += 1;
      if (performance.now() - began > STEP_BUDGET_MS) break;
    }
    if (state.budget > MAX_STEPS_PER_FRAME) state.budget = MAX_STEPS_PER_FRAME;

    if (stepped) {
      state.frame += 1;
      state.acc = accuracy(state.net, state.data.X, state.data.y);
      if (state.done || state.frame % state.fieldEvery === 0) drawField();
      drawChart();
      if (state.done || state.frame % 2 === 0) drawNet();
      writeReadouts();

      // Keep slow devices smooth: draw a coarser field, then draw it less often.
      const spent = performance.now() - began;
      state.cost = state.cost ? state.cost * 0.9 + spent * 0.1 : spent;
      if (state.cost > 10 && state.grid > 36) { setGrid(36); state.cost = 0; }
      else if (state.cost > 10 && state.fieldEvery < 3) { state.fieldEvery += 1; state.cost = 0; }
    }

    if (state.done) {
      finish();
      return;
    }
    // A second check beside the IntersectionObserver, a few times a second.
    state.ticks += 1;
    if (state.ticks % 20 === 0 && !isOnScreen()) {
      state.onScreen = false;
      setStatus('paused while off screen', 'paused');
      return;
    }
    state.raf = requestAnimationFrame(frame);
  }

  function isOnScreen() {
    const box = root.getBoundingClientRect();
    return box.bottom > 0 && box.top < window.innerHeight;
  }

  function finish() {
    state.animating = false;
    state.acc = accuracy(state.net, state.data.X, state.data.y);
    drawAll();
    const reached = state.loss < LOSS_TARGET;
    setStatus(reached ? `run complete at epoch ${state.epoch}` : `stopped at the cap of ${state.epoch} epochs`, 'done');
    el.pause.disabled = true;
    el.pause.textContent = 'Pause';
    el.summary.textContent = `Training finished on the ${state.dataset} dataset at epoch ${state.epoch}. `
      + `Loss ${state.loss.toFixed(4)}. Accuracy ${(state.acc * 100).toFixed(1)} percent.`;
  }

  // Train to the end without drawing the steps in between. Used for reduced motion.
  function finishQuietly(runId) {
    setStatus('training', 'training');
    const chunk = () => {
      if (runId !== state.runId) return;
      const began = performance.now();
      while (!state.done && performance.now() - began < 8) step();
      if (state.done) finish();
      else setTimeout(chunk, 0);
    };
    chunk();
  }

  function newRun({ animate }) {
    state.runId += 1;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.data = makeDataset(state.dataset, POINTS, 40 + state.seed);
    state.net = createNetwork({ layers: [2, 8, 8, 1], seed: state.seed });
    state.epoch = 0;
    state.loss = NaN;
    state.history = [];
    state.done = false;
    state.budget = 0;
    state.frame = 0;
    state.userPaused = false;
    state.acc = accuracy(state.net, state.data.X, state.data.y);
    el.seed.textContent = `seed ${state.seed}`;
    el.summary.textContent = '';
    el.pause.textContent = 'Pause';
    drawAll();

    if (animate) {
      state.animating = true;
      el.pause.hidden = false;
      el.pause.disabled = false;
      if (canRun()) schedule();
      else setStatus(state.onScreen ? 'paused while the tab is hidden' : 'paused while off screen', 'paused');
    } else {
      state.animating = false;
      el.pause.hidden = true;
      finishQuietly(state.runId);
    }
  }

  // ----- controls -----

  function syncLabels() {
    el.restart.textContent = reduceMotion.matches ? 'Train' : 'Restart';
  }

  el.restart.addEventListener('click', () => {
    state.seed += 1;
    newRun({ animate: true });
  });

  el.pause.addEventListener('click', () => {
    if (state.done) return;
    state.userPaused = !state.userPaused;
    el.pause.textContent = state.userPaused ? 'Resume' : 'Pause';
    if (state.userPaused) setStatus('paused', 'paused');
    else schedule();
  });

  el.radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.dataset = radio.value;
      newRun({ animate: !reduceMotion.matches });
    });
  });

  const onMotionChange = () => syncLabels();
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionChange);

  // Pause when the figure is off screen or the tab is hidden.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      state.onScreen = entries[entries.length - 1].isIntersecting;
      if (!state.animating || state.done || state.userPaused) return;
      if (state.onScreen) schedule();
      else setStatus('paused while off screen', 'paused');
    }).observe(root);
  }
  window.addEventListener('scroll', () => {
    if (!state.animating || state.done || state.userPaused || state.raf) return;
    state.onScreen = isOnScreen();
    if (state.onScreen) schedule();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!state.animating || state.done || state.userPaused) return;
    if (document.hidden) setStatus('paused while the tab is hidden', 'paused');
    else schedule();
  });

  // Redraw crisply when the layout or the pixel ratio changes.
  let resizeQueued = false;
  const onResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      if (state.net) drawAll();
    });
  };
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(onResize);
    surfaces.forEach((surface) => observer.observe(surface.canvas));
  } else {
    window.addEventListener('resize', onResize);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);

  // ----- go -----

  setGrid(window.innerWidth < 700 ? 56 : 64);
  syncLabels();
  const fromChecked = el.radios.find((radio) => radio.checked);
  if (fromChecked) state.dataset = fromChecked.value;
  newRun({ animate: !reduceMotion.matches });
}
