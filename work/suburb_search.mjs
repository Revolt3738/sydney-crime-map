import {Searcher, fuzzy} from "fast-fuzzy";

const indexes = new WeakMap();
const threshold = 0.7;
const limit = 8;
const normalize = value => (value ?? "").trim().toLowerCase();
const sortedWords = value => (normalize(value).match(/[\p{L}\p{N}]+/gu) ?? []).sort().join(" ");

export function canSearch(query) {
  const term = normalize(query);
  return !/[,，]/u.test(term) && term.replace(/[^\p{L}\p{N}]/gu, "").length >= 4;
}

async function yieldToMain() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function buildIndex(rows, options) {
  const index = new Searcher([], options);
  let deadline = performance.now() + 8;
  for (let start = 0; start < rows.length; start += 32) {
    index.add(...rows.slice(start, start + 32));
    if (performance.now() >= deadline) {
      await yieldToMain();
      deadline = performance.now() + 8;
    }
  }
  return index;
}

function searchIndexes(rows) {
  if (!indexes.has(rows)) {
    const options = {keySelector: row => [row.name, row.source].filter(Boolean), threshold};
    indexes.set(rows, {normal: buildIndex(rows, options), words: null});
  }
  return indexes.get(rows);
}

function matchingWords(row, terms) {
  return [row.name, row.source].filter(Boolean).some(value => {
    const words = sortedWords(value).split(" ").filter(Boolean);
    return terms.every(term => words.some(word => word.startsWith(term) || (term.length >= 4 &&
      fuzzy(term, word, {useSellers: false}) >= 1 - 1 / Math.max(term.length, word.length) - 1e-9)));
  });
}

export async function fuzzySuggestions(rows, query) {
  const term = normalize(query);
  if (!canSearch(term)) return [];
  const index = searchIndexes(rows);
  const normal = (await index.normal).search(term).slice(0, limit);
  if (!/\s/u.test(term)) return normal;
  index.words ??= buildIndex(rows, {
    keySelector: row => [row.name, row.source, row.name.replace(/\s*\(.*/u, "")]
      .filter(Boolean).map(sortedWords), threshold,
  });
  const sorted = sortedWords(term);
  const terms = sorted.split(" ").filter(Boolean);
  const words = (await index.words).search(sorted).filter(row => matchingWords(row, terms));
  return [...new Set([...words, ...normal])].slice(0, limit);
}
