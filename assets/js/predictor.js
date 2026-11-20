// Fig. 5: the next-word demo. Trains an n-gram model on this page's own text.
import { tokenize, buildModel, suggest, ORDER_NAMES } from './ngram.js';

const SLOTS = 3;
const SKIP = 'svg, script, style, noscript, canvas, .sr-only, #predictor, [hidden]';

const root = document.getElementById('predictor');
if (root) start(root);

// The visible words of the page, leaving out the demo itself and drawn figures.
function pageText() {
  const main = document.querySelector('main') || document.body;
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const parts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) continue;
    const text = node.nodeValue.trim();
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

// Split what was typed into finished words and the word still being typed.
function readInput(value) {
  const tokens = tokenize(value);
  const midWord = /[A-Za-z0-9']$/.test(value);
  if (midWord && tokens.length) {
    return { context: tokens.slice(0, -1), prefix: tokens[tokens.length - 1] };
  }
  return { context: tokens, prefix: '' };
}

function start(root) {
  const input = root.querySelector('#predictor-input');
  const clear = root.querySelector('#predictor-clear');
  const mode = root.querySelector('#predictor-mode');
  const stats = root.querySelector('#predictor-stats');
  const buttons = [...root.querySelectorAll('.suggestion')].slice(0, SLOTS);
  if (!input || buttons.length < SLOTS) return;

  let model;
  try {
    const tokens = tokenize(pageText());
    model = buildModel(tokens, 3);
    stats.textContent = `trained on ${model.total.toLocaleString('en')} words, ${model.vocabSize.toLocaleString('en')} distinct`;
  } catch (error) {
    model = buildModel([], 3);
    stats.textContent = 'the model could not be trained';
  }

  let current = { items: [], completing: false };

  function compute(value) {
    const { context, prefix } = readInput(value);
    if (prefix) {
      const all = suggest(model, context, Math.max(SLOTS, model.vocabSize));
      const completions = all.filter((s) => s.word.startsWith(prefix) && s.word !== prefix).slice(0, SLOTS);
      if (completions.length) return { items: completions, completing: true, context, prefix };
      const next = context.concat(prefix);
      return { items: suggest(model, next, SLOTS), completing: false, context: next, prefix: '' };
    }
    return { items: suggest(model, context, SLOTS), completing: false, context, prefix: '' };
  }

  function describe(result) {
    if (result.completing) return `Finishing the word "${result.prefix}"`;
    const tail = result.context.slice(-2).join(' ');
    if (!tail) return 'Most frequent words on this page';
    if (!result.items.length) return 'No suggestion';
    const best = result.items[0].order;
    if (best === 1) return `Nothing on this page follows "${tail}", so these are the most frequent words`;
    return `Next word after "${result.context.slice(-(best - 1)).join(' ')}"`;
  }

  function render() {
    let result;
    try {
      result = compute(input.value);
    } catch (error) {
      result = { items: [], completing: false, context: [], prefix: '' };
    }
    current = result;
    mode.textContent = describe(result);
    buttons.forEach((button, index) => {
      const item = result.items[index];
      const word = button.querySelector('.s-word');
      const meter = button.querySelector('.s-meter span');
      const p = button.querySelector('.s-p');
      const order = button.querySelector('.s-order');
      if (!item) {
        button.disabled = true;
        word.textContent = '';
        meter.style.width = '0%';
        p.textContent = '';
        order.textContent = '';
        button.removeAttribute('aria-label');
        return;
      }
      button.disabled = false;
      word.textContent = item.word;
      meter.style.width = `${Math.max(1.5, item.p * 100).toFixed(1)}%`;
      p.textContent = item.p < 0.005 ? 'p under 0.01' : `p ${item.p.toFixed(2)}`;
      order.textContent = ORDER_NAMES[item.order] || `order ${item.order}`;
      button.setAttribute('aria-label', `Add ${item.word}. Probability ${item.p.toFixed(2)}, from the ${order.textContent} model.`);
    });
  }

  function accept(index, viaKeyboard) {
    const item = current.items[index];
    if (!item) return;
    let value = input.value;
    if (current.completing) {
      value = value.slice(0, value.length - current.prefix.length) + item.word + ' ';
    } else {
      if (value && !/\s$/.test(value)) value += ' ';
      value += item.word + ' ';
    }
    input.value = value;
    render();
    if (viaKeyboard && !buttons[index].disabled) {
      buttons[index].focus();
    } else {
      input.focus();
      input.setSelectionRange(value.length, value.length);
    }
    input.scrollLeft = input.scrollWidth;
  }

  buttons.forEach((button, index) => {
    // A click with detail 0 came from the keyboard, so focus stays on the suggestion
    // and Enter can be pressed again to keep adding words.
    button.addEventListener('click', (event) => accept(index, event.detail === 0));
    button.addEventListener('keydown', (event) => {
      const enabled = buttons.filter((b) => !b.disabled);
      const at = enabled.indexOf(button);
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        enabled[(at + 1) % enabled.length].focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (at === 0 && event.key === 'ArrowUp') input.focus();
        else enabled[(at - 1 + enabled.length) % enabled.length].focus();
      } else if (event.key === 'Escape') {
        input.focus();
      }
    });
  });

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      const first = buttons.find((b) => !b.disabled);
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  clear.addEventListener('click', () => {
    input.value = '';
    render();
    input.focus();
  });

  render();
}
