// Fig. 1: the record of Ask JAMIE's latest test run, drawn from the rows in run.js.
// It shows a recorded result. Nothing here runs a model.
import { RUN, KINDS, MISS_NOTES, TARGETS, summarise, rounds, ordered, seconds } from './run.js?v=7';

const SVG = 'http://www.w3.org/2000/svg';
const TOP_SECONDS = 6;                       // the time axis runs from 0 to 6 seconds
const KIND_WORDS = { answerable: 'known answer', declines: 'should decline', planted: 'planted instruction' };
const RIGHT_WORDS = { answerable: 'right', declines: 'declined, as it should', planted: 'instruction ignored, as it should' };

const root = document.getElementById('run');
if (root) start(root);

function start(root) {
  const el = {
    plot: root.querySelector('#run-plot'),
    detailHead: root.querySelector('#run-detail-head'),
    detailBody: root.querySelector('#run-detail-body'),
    misses: root.querySelector('#run-misses'),
    prev: root.querySelector('#run-prev'),
    next: root.querySelector('#run-next'),
    filters: [...root.querySelectorAll('input[name="run-kind"]')],
  };
  if (!el.plot) return;

  const rows = ordered();
  const result = summarise();
  const state = { active: -1, kind: 'all', drawn: false, width: 0 };
  let svg = null;
  let marks = [];

  writeNumbers(root, result);

  // ----- small helpers -----

  const make = (name, attrs = {}, text) => {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text != null) node.textContent = text;
    return node;
  };
  const shown = (index) => state.kind === 'all' || rows[index].kind === state.kind;
  const outcome = (row) => (row.right ? RIGHT_WORDS[row.kind] : 'wrong');
  const describe = (row) => `${row.id}, ${KIND_WORDS[row.kind]}, ${outcome(row)}, ${row.seconds.toFixed(1)} seconds. ${row.question}`
    + (row.right ? '' : ` ${MISS_NOTES[row.id] || ''}`);

  // ----- drawing -----

  function draw() {
    const width = Math.max(260, Math.round(el.plot.getBoundingClientRect().width));
    if (width === state.width && svg) return;
    state.width = width;
    const narrow = width < 520;
    const height = Math.round(Math.min(340, Math.max(214, width * 0.36)));
    // The right margin holds the name of the median line, clear of the marks.
    const pad = { left: 30, right: narrow ? 40 : 46, top: 34, bottom: 18 };
    const gap = narrow ? 12 : 22;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const pitch = (innerW - gap * (KINDS.length - 1)) / rows.length;
    const yOf = (value) => pad.top + (1 - value / TOP_SECONDS) * innerH;
    const base = yOf(0);
    const dot = Math.min(3.8, Math.max(2.3, pitch * 0.27));

    const next = make('svg', {
      class: 'run-svg', viewBox: `0 0 ${width} ${height}`, width, height,
      role: 'group', 'aria-label': `Answer time for each of the ${result.total} test questions, in three groups. Use the left and right arrow keys to move between the questions.`,
    });
    next.dataset.kind = state.kind;

    // time axis
    for (let tick = 0; tick <= TOP_SECONDS; tick++) {
      const y = Math.round(yOf(tick)) + 0.5;
      next.append(make('line', { class: tick === 0 ? 'run-base' : 'run-grid', x1: pad.left, x2: width - pad.right, y1: y, y2: y }));
      // The top tick carries the unit, so the axis needs no title of its own.
      next.append(make('text', { class: 'run-tick', x: pad.left - 8, y: y + 3.5, 'text-anchor': 'end' }, tick === TOP_SECONDS ? `${tick} s` : String(tick)));
    }

    // the three groups
    marks = [];
    let x = pad.left;
    let index = 0;
    for (const kind of KINDS) {
      const group = rows.filter((row) => row.kind === kind.key);
      const groupWidth = group.length * pitch;
      const holder = make('g', { class: 'run-group', 'data-kind': kind.key });
      holder.append(make('path', { class: 'run-bracket', d: `M${x + 1} ${pad.top - 9}v-5h${groupWidth - 2}v5` }));
      // On a narrow plot the middle name ends at its bracket's right end, so the last two names do not meet.
      const tuck = narrow && kind.key === 'declines';
      holder.append(make('text', {
        class: 'run-group-name', x: tuck ? x + groupWidth - 1 : x + 1, y: pad.top - 19, 'text-anchor': tuck ? 'end' : 'start',
      }, `${group.length} ${kind.name}`));
      next.append(holder);

      group.forEach((row, place) => {
        const cx = x + (place + 0.5) * pitch;
        const cy = yOf(row.seconds);
        const mark = make('g', {
          class: `run-mark${row.right ? '' : ' is-miss'}`, role: 'img', tabindex: '-1',
          'data-i': index, 'data-kind': row.kind, 'aria-label': describe(row),
        });
        mark.style.setProperty('--delay', `${index * 9}ms`);
        mark.append(make('rect', { class: 'run-band', x: cx - pitch / 2, y: pad.top - 4, width: pitch, height: innerH + 8 }));
        mark.append(make('line', { class: 'run-stem', pathLength: '1', x1: cx, x2: cx, y1: base, y2: cy }));
        mark.append(make('circle', { class: 'run-ring', cx, cy, r: dot + 4 }));
        // A wrong answer is ringed, and its id sits under the baseline where nothing else is drawn.
        if (!row.right) {
          mark.append(make('circle', { class: 'run-miss-ring', cx, cy, r: dot + 2.6 }));
          mark.append(make('text', { class: 'run-miss-id', x: cx, y: base + 13, 'text-anchor': 'middle' }, row.id));
        }
        mark.append(make('circle', { class: 'run-dot', cx, cy, r: dot }));
        next.append(mark);
        marks.push(mark);
        index += 1;
      });
      x += groupWidth + gap;
    }

    // the median, drawn across all three groups
    const my = Math.round(yOf(result.median)) + 0.5;
    next.append(make('line', { class: 'run-median', x1: pad.left, x2: width - pad.right, y1: my, y2: my }));
    next.append(make('text', { class: 'run-median-name', x: width - pad.right + 6, y: my - 2 }, 'median'));
    next.append(make('text', { class: 'run-median-name', x: width - pad.right + 6, y: my + 10 }, seconds(result.median)));

    wire(next);
    if (svg) svg.replaceWith(next);
    else el.plot.append(next);
    svg = next;
    if (state.drawn) svg.classList.add('is-drawn');
    paint();
  }

  // Marks rise from the baseline once, when the figure is first drawn.
  function drawIn() {
    if (state.drawn) return;
    state.drawn = true;
    if (svg) svg.classList.add('is-drawn');
  }

  // ----- choosing a question -----

  function paint() {
    if (!svg) return;
    svg.dataset.kind = state.kind;
    const first = marks.findIndex((mark, index) => shown(index));
    marks.forEach((mark, index) => {
      mark.classList.toggle('is-active', index === state.active);
      mark.setAttribute('tabindex', index === (state.active >= 0 && shown(state.active) ? state.active : first) ? '0' : '-1');
    });
    for (const button of el.misses.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(rows[state.active] && rows[state.active].id === button.dataset.id));
    }
    writeDetail();
  }

  function writeDetail() {
    const row = rows[state.active];
    if (!row) {
      el.detailHead.textContent = 'Pick a question';
      el.detailBody.textContent = 'Hover over a mark, tap it or use the arrow keys to read the question, its result and its time. The three wrong answers are ringed.';
      return;
    }
    el.detailHead.replaceChildren();
    for (const [text, cls] of [[row.id, 'd-id'], [KIND_WORDS[row.kind], ''], [outcome(row), row.right ? '' : 'd-miss'], [seconds(row.seconds), '']]) {
      const part = document.createElement('span');
      part.textContent = text;
      if (cls) part.className = cls;
      el.detailHead.append(part);
    }
    el.detailBody.textContent = row.question + (row.right ? '' : ` ${MISS_NOTES[row.id] || ''}`);
  }

  function choose(index, focus) {
    if (index < 0 || index >= rows.length) return;
    if (!shown(index)) setKind('all');
    state.active = index;
    paint();
    if (focus && marks[index]) marks[index].focus({ preventScroll: true });
  }

  // Step to the next or the previous question that the filter is showing.
  function step(direction, focus) {
    const list = rows.map((row, index) => index).filter(shown);
    if (!list.length) return;
    const at = list.indexOf(state.active);
    const nextAt = at < 0 ? (direction > 0 ? 0 : list.length - 1) : (at + direction + list.length) % list.length;
    choose(list[nextAt], focus);
  }

  function setKind(kind) {
    state.kind = kind;
    const radio = el.filters.find((input) => input.value === kind);
    if (radio) radio.checked = true;
    if (state.active >= 0 && !shown(state.active)) state.active = -1;
  }

  function wire(node) {
    node.addEventListener('pointerover', (event) => {
      const mark = event.target.closest('.run-mark');
      if (mark && event.pointerType !== 'touch' && shown(+mark.dataset.i)) choose(+mark.dataset.i, false);
    });
    node.addEventListener('click', (event) => {
      const mark = event.target.closest('.run-mark');
      if (mark) choose(+mark.dataset.i, true);
    });
    node.addEventListener('focusin', (event) => {
      const mark = event.target.closest('.run-mark');
      if (mark && +mark.dataset.i !== state.active) choose(+mark.dataset.i, false);
    });
    node.addEventListener('keydown', (event) => {
      if (!event.target.closest('.run-mark')) return;
      const list = rows.map((row, index) => index).filter(shown);
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); step(1, true); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); step(-1, true); }
      else if (event.key === 'Home') { event.preventDefault(); choose(list[0], true); }
      else if (event.key === 'End') { event.preventDefault(); choose(list[list.length - 1], true); }
    });
  }

  // ----- controls outside the plot -----

  for (const id of result.misses) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'run-miss-btn';
    button.dataset.id = id;
    button.textContent = id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Show ${id}, a wrong answer`);
    button.addEventListener('click', () => choose(rows.findIndex((row) => row.id === id), false));
    el.misses.append(button);
  }
  el.prev.addEventListener('click', () => step(-1, false));
  el.next.addEventListener('click', () => step(1, false));
  el.filters.forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      setKind(input.value);
      paint();
    });
  });

  // ----- go -----

  draw();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) drawIn();
  else setTimeout(drawIn, 60);

  let queued = 0;
  const redraw = () => {
    clearTimeout(queued);
    queued = setTimeout(draw, 80);
  };
  if ('ResizeObserver' in window) new ResizeObserver(redraw).observe(el.plot);
  else window.addEventListener('resize', redraw);
}

// The readouts and the rounds are written in the HTML for visitors without JavaScript.
// With it on they are written again from the rows, so the page follows the data.
function writeNumbers(root, result) {
  const set = (id, text) => {
    const node = root.querySelector(`#${id}`);
    if (node) node.textContent = text;
  };
  const gauge = (id, share, target) => {
    const node = root.querySelector(`#${id}`);
    if (!node) return;
    node.querySelector('.gauge-fill').style.width = `${Math.max(0, Math.min(100, share * 100)).toFixed(1)}%`;
    node.querySelector('.gauge-target').style.left = `${Math.max(0, Math.min(100, target * 100)).toFixed(1)}%`;
  };
  const { answerable, declines, planted } = result.byKind;
  // Each result is said to be met or missed in plain words, worked out from the rows.
  const state = (id, met, missedText) => {
    const node = root.querySelector(`#${id}`);
    if (!node) return;
    node.textContent = met ? 'Met.' : missedText;
    node.closest('div').classList.toggle('is-missed', !met);
  };
  const short = result.declinesShortBy;
  state('run-answerable-state', result.met.answerable, 'Missed.');
  state('run-declines-state', result.met.declines, short === 1 ? 'Missed by one question.' : `Missed by ${short} questions.`);
  state('run-planted-state', result.met.planted, 'Missed.');
  state('run-median-state', result.met.median, 'Missed.');

  set('run-answerable', `${answerable.percent}%`);
  set('run-answerable-count', `${answerable.right} of ${answerable.of}`);
  gauge('run-answerable-gauge', answerable.share, TARGETS.answerable);

  set('run-declines', `${declines.right} of ${declines.of}`);
  set('run-declines-count', `${declines.percent}%`);
  gauge('run-declines-gauge', declines.share, TARGETS.declines);

  set('run-planted', `${planted.right} of ${planted.of}`);
  gauge('run-planted-gauge', planted.share, TARGETS.planted);

  set('run-median', seconds(result.median));
  set('run-fastest', seconds(result.fastest));
  set('run-slowest', seconds(result.slowest));
  gauge('run-median-gauge', result.median / TARGETS.medianSeconds, 1);

  const list = rounds();
  const slowest = Math.max(...list.map((item) => item.median));
  list.forEach((item) => {
    set(`run-round-${item.round}-percent`, `${item.percent}%`);
    set(`run-round-${item.round}-count`, `${item.right} of ${item.of}`);
    set(`run-round-${item.round}-median`, seconds(item.median));
    const bar = root.querySelector(`#run-round-${item.round}-bar`);
    if (bar) bar.style.width = `${((100 * item.median) / slowest).toFixed(1)}%`;
  });
  set('run-model', RUN.model);
}
