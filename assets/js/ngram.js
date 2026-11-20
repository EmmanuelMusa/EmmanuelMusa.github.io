// A word tokenizer and an n-gram language model with backoff.
// Pure module: no DOM access, so Node can test it.

const SEPARATOR = ' ';
const WORD = /[a-z0-9]+(?:['.][a-z0-9]+)*/g;

/**
 * Split text into lowercase word tokens. Apostrophes inside a word are kept
 * (it's), and so are digits and decimals (17, 2.3).
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (typeof text !== 'string' || !text) return [];
  const flat = text.toLowerCase().replace(/[‘’ʼ]/g, "'");
  return flat.match(WORD) || [];
}

/**
 * Count every n-gram of order 1 to n.
 * counts[k - 1] maps a context of k - 1 words to a map of next word to count.
 * @param {string[]} tokens
 * @param {number} n highest order (3 means trigram)
 */
export function buildModel(tokens, n = 3) {
  const order = Math.max(1, Math.floor(n) || 1);
  const counts = [];
  const totals = [];
  for (let k = 0; k < order; k++) {
    counts.push(new Map());
    totals.push(new Map());
  }
  const list = Array.isArray(tokens) ? tokens : [];
  for (let i = 0; i < list.length; i++) {
    for (let k = 1; k <= order; k++) {
      const start = i - (k - 1);
      if (start < 0) break;
      const key = k === 1 ? '' : list.slice(start, i).join(SEPARATOR);
      const table = counts[k - 1];
      let row = table.get(key);
      if (!row) {
        row = new Map();
        table.set(key, row);
      }
      row.set(list[i], (row.get(list[i]) || 0) + 1);
      totals[k - 1].set(key, (totals[k - 1].get(key) || 0) + 1);
    }
  }
  const unigrams = counts[0].get('');
  return {
    n: order,
    counts,
    totals,
    total: list.length,
    vocabSize: unigrams ? unigrams.size : 0,
  };
}

// Highest count first. Ties break alphabetically so results are repeatable.
function ranked(row) {
  return [...row.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/**
 * Suggest up to k next words. Starts at the highest order the context allows
 * and backs off to lower orders until k words are found.
 * p is the share of times the word followed that context at that order.
 * @param {ReturnType<typeof buildModel>} model
 * @param {string[]} contextTokens
 * @param {number} k
 * @returns {{ word: string, p: number, order: number }[]}
 */
export function suggest(model, contextTokens, k = 3) {
  const out = [];
  if (!model || !model.counts || !(k > 0)) return out;
  const context = (Array.isArray(contextTokens) ? contextTokens : [])
    .map((t) => String(t).toLowerCase());
  const seen = new Set();
  const highest = Math.min(model.n, context.length + 1);

  for (let order = highest; order >= 1 && out.length < k; order--) {
    const key = order === 1 ? '' : context.slice(context.length - (order - 1)).join(SEPARATOR);
    const row = model.counts[order - 1].get(key);
    if (!row) continue;
    const total = model.totals[order - 1].get(key);
    for (const [word, count] of ranked(row)) {
      if (seen.has(word)) continue;
      seen.add(word);
      out.push({ word, p: count / total, order });
      if (out.length >= k) break;
    }
  }
  return out;
}

export const ORDER_NAMES = { 1: 'unigram', 2: 'bigram', 3: 'trigram' };
