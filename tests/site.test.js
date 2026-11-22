// Checks on the pages themselves: the numbers written into the HTML for visitors
// without JavaScript agree with the data, and every local asset carries one version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { summarise, rounds, MISS_NOTES, RUN, seconds } from '../assets/js/run.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
const index = read('index.html');
const notFound = read('404.html');
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// The part of the page that is Fig. 1.
const figure = (() => {
  const start = index.indexOf('<figure class="fig run"');
  const end = index.indexOf('</figure>', start);
  assert.ok(start > 0 && end > start, 'Fig. 1 is in the page');
  return index.slice(start, end);
})();
const figureText = text(figure);

test('the numbers written into Fig. 1 match the data', () => {
  const result = summarise();
  const { answerable, declines, planted } = result.byKind;
  const expected = [
    `${answerable.percent}%`,
    `${answerable.right} of ${answerable.of}`,
    `${declines.right} of ${declines.of}`,
    `${declines.percent}%`,
    `${planted.right} of ${planted.of}`,
    seconds(result.median),
    seconds(result.fastest),
    seconds(result.slowest),
    `${result.total} questions`,
    RUN.model,
  ];
  for (const piece of expected) assert.ok(figureText.includes(piece), `Fig. 1 says "${piece}"`);
});

test('Fig. 1 names the three misses with their questions and what went wrong', () => {
  const plain = figureText.replace(/&quot;/g, '"');
  for (const id of summarise().misses) {
    const row = RUN.rows.find((item) => item.id === id);
    assert.ok(plain.includes(id), `names ${id}`);
    assert.ok(plain.includes(row.question), `quotes the question of ${id}`);
    assert.ok(plain.includes(MISS_NOTES[id]), `says what went wrong on ${id}`);
  }
});

test('the three rounds written into Fig. 1 match the data', () => {
  for (const item of rounds()) {
    assert.ok(figureText.includes(`${item.right} of ${item.of}`), `round ${item.round} count`);
    assert.ok(figureText.includes(`${item.percent}%`), `round ${item.round} percent`);
    assert.ok(figureText.includes(seconds(item.median)), `round ${item.round} median`);
  }
});

test('nothing says a neural network trains in the browser any more', () => {
  const readme = read('README.md');
  for (const [name, body] of [['index.html', index], ['404.html', notFound], ['README.md', readme]]) {
    assert.doesNotMatch(body, /trains? (live )?in your browser/i, name);
    assert.doesNotMatch(body, /neural network (that|at the top|learning)/i, name);
    assert.doesNotMatch(body, /nn\.js|hero\.js/, name);
  }
});

test('every local stylesheet and script carries the same version, and so do the imports between modules', () => {
  const versions = new Set();
  const local = [];
  for (const html of [index, notFound]) {
    for (const match of html.matchAll(/<(?:link|script)\b[^>]*?(?:href|src)="([^"]+\.(?:css|js)[^"]*)"/g)) {
      if (!/^https?:/.test(match[1])) local.push(match[1]);
    }
  }
  assert.ok(local.length >= 4, 'found the local stylesheet and scripts');
  for (const address of local) {
    const version = (address.match(/\?v=(\d+)$/) || [])[1];
    assert.ok(version, `${address} carries a version`);
    versions.add(version);
  }
  const scripts = fileURLToPath(new URL('assets/js/', root));
  for (const file of readdirSync(scripts)) {
    const body = readFileSync(scripts + file, 'utf8');
    for (const match of body.matchAll(/from\s+'(\.[^']+)'/g)) {
      const version = (match[1].match(/\?v=(\d+)$/) || [])[1];
      assert.ok(version, `${file} imports ${match[1]} with a version`);
      versions.add(version);
    }
  }
  assert.equal(versions.size, 1, `one version across the site, found ${[...versions].join(', ')}`);
});

test('the JAMIE entry gives the same result as Fig. 1', () => {
  const start = index.indexOf('id="jamie"');
  const end = index.indexOf('</article>', start);
  assert.ok(start > 0 && end > start, 'the JAMIE entry is in the page');
  const entry = text(index.slice(start, end));
  const result = summarise();
  const { answerable, declines, planted } = result.byKind;
  for (const piece of [
    `${answerable.right} of ${answerable.of}`,
    `${answerable.percent}%`,
    `${declines.right} of ${declines.of}`,
    `${planted.right} of ${planted.of}`,
    seconds(result.median),
  ]) assert.ok(entry.includes(piece), `the JAMIE entry says "${piece}"`);
});
