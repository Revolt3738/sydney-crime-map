/*
 * Research benchmark for the complete local suburb dataset. "current" is the
 * literal-matching baseline, before the optional fuzzy fallback.
 *
 * PowerShell: install the compared versions into a temporary directory, not the project:
 *   $benchDir = Join-Path $env:TEMP 'suburb-search-benchmark'
 *   npm install --prefix $benchDir --no-save --ignore-scripts --no-audit --no-fund match-sorter@8.3.1 fuse.js@7.5.0 minisearch@7.2.0 @leeoniya/ufuzzy@1.0.19 fast-fuzzy@1.12.0
 *   node tests/search-ranking-benchmark.cjs (Join-Path $benchDir 'node_modules')
 *   node tests/search-ranking-benchmark.cjs (Join-Path $benchDir 'node_modules') --additional
 *   Add --precision to inspect extra fuzzy suggestions for otherwise valid searches.
 *   Add --examples for a quick smoke test of representative queries.
 *   Add --hard for additional incomplete-query and double-typo cases.
 *
 * This is a synthetic comparison, not a measurement of real user searches.
 */
const fs = require("node:fs");
const {createRequire} = require("node:module");
const path = require("node:path");
const vm = require("node:vm");
const {performance} = require("node:perf_hooks");

const modules = process.argv[2];
if (!modules) throw new Error("Pass the temporary node_modules directory as the first argument");
const load = createRequire(path.join(path.dirname(path.resolve(modules)), "__search_benchmark__.cjs"));
const {matchSorter} = load("match-sorter");
const Fuse = load("fuse.js");
const MiniSearch = load("minisearch");
const additional = process.argv.includes("--additional");
const root = path.resolve(__dirname, "..");
const rows = JSON.parse(fs.readFileSync(path.join(root, "work/crime_data.json"), "utf8")).rows;
const source = fs.readFileSync(path.join(root, "work/suburb_compare.js"), "utf8");
const end = source.indexOf("\nfunction renderCompareCard");
if (end < 0 || !rows.length) throw new Error("Unexpected source or empty dataset");
const currentSearch = vm.runInNewContext(
  `const names = new Intl.Collator("en-AU");\n${source.slice(0, end)}\nliteralSuggestions`, {Intl},
);

const options = {keys: ["name", "source"], threshold: 0.3};
const fuseText = new Fuse(rows, options);
const fuseToken = new Fuse(rows, {...options, useTokenSearch: true, tokenMatch: "all"});
const mini = new MiniSearch({idField: "code", fields: ["name", "source"]});
mini.addAll(rows);
const errors = {};
const normalize = value => (value ?? "").trim().toLowerCase();
let uf, regularEntries, compactEntries, regularHaystack, compactHaystack, fast, fastWords, fuzzyWord;
const sortedWords = value => (normalize(value).match(/[\p{L}\p{N}]+/gu) ?? []).sort().join(" ");
if (additional) {
  const UFuzzy = load("@leeoniya/ufuzzy");
  const {Searcher, fuzzy} = load("fast-fuzzy");
  fuzzyWord = fuzzy;
  uf = new UFuzzy({intraMode: 1});
  regularEntries = rows.flatMap(row => [...new Set([row.name, row.source].filter(Boolean))]
    .map(text => ({text, code: row.code})));
  compactEntries = rows.flatMap(row => [...new Set([row.name, row.source].filter(Boolean)
    .flatMap(text => [text, text.replace(/\s+/gu, "")]))].map(text => ({text, code: row.code})));
  regularHaystack = regularEntries.map(entry => entry.text);
  compactHaystack = compactEntries.map(entry => entry.text);
  fast = new Searcher(rows, {keySelector: row => [row.name, row.source].filter(Boolean), threshold: 0.7});
  fastWords = new Searcher(rows, {keySelector: row => [row.name, row.source, row.name.replace(/\s*\(.*/u, "")]
    .filter(Boolean).map(sortedWords), threshold: 0.7});
}
const prefixLast = (_term, index, terms) => index === terms.length - 1;
const miniOptions = maxDistance => ({
  prefix: prefixLast, combineWith: "AND",
  fuzzy: term => term.length < 4 ? false : maxDistance(term.length),
});
const baseName = row => normalize(row.name.replace(/\s*\(.*/u, ""));
const names = new Map();
const rowsByCode = new Map(rows.map(row => [row.code, row]));
for (const row of rows) {
  for (const value of [row.name, row.source, baseName(row)]) {
    const key = normalize(value);
    if (!key) continue;
    if (!names.has(key)) names.set(key, new Set());
    names.get(key).add(row.code);
  }
}

const measured = additional ? ["current", "uFuzzy", "uFuzzyCompact", "fastFuzzy", "fastDynamic", "fastAdaptive", "fastWordsFiltered", "fastWordsDynamic"] :
  ["current", "matchSorter", "fuseText", "fuseToken", "miniOne", "miniTwo"];
const keys = additional ? [...measured, "hybridUFEmpty", "hybridUFFill", "hybridUFCEmpty", "hybridUFCFill",
  "hybridFastEmpty", "hybridFastFill", "hybridFastDynamicEmpty", "hybridFastDynamicFill",
  "hybridFastAdaptiveEmpty", "hybridFastAdaptiveFill", "hybridFastWordsEmpty", "hybridFastWordsFill", "hybridFastWordsWeak", "hybridFastWordsGuarded", "hybridFastWordsWeak2"] :
  [...measured, "hybridEmpty", "hybridFill", "hybridTextEmpty", "hybridTextFill",
    "hybridAdaptiveEmpty", "hybridAdaptiveFill", "hybridAdaptiveWeak", "hybridRrfEmpty", "hybridRrfFill"];
const durations = Object.fromEntries(measured.map(key => [key, []]));
const cache = new Map();
function timed(key, fn) {
  const start = performance.now();
  const result = fn();
  durations[key].push(performance.now() - start);
  return result;
}
function getResults(query) {
  if (cache.has(query)) return cache.get(query);
  const primary = timed("current", () => Array.from(currentSearch(rows, query), row => row.code));
  const fuzzyAllowed = !/[,，]/u.test(query) && query.replace(/[^\p{L}\p{N}]/gu, "").length >= 4;
  const unique = (...lists) => [...new Set(lists.flat())].slice(0, 8);
  const emptyFallback = fallback => primary.length || !fuzzyAllowed ? primary : fallback;
  const fillFallback = fallback => fuzzyAllowed ? unique(primary, fallback) : primary;
  const term = normalize(query);
  const hasStrongPrimary = primary.some(code => {
    const row = rowsByCode.get(code);
    const name = normalize(row.name);
    if (name.startsWith(term) || normalize(row.source) === term) return true;
    for (let index = name.indexOf(term); index > 0; index = name.indexOf(term, index + 1)) {
      if (/[^\p{L}\p{N}]/u.test(name[index - 1])) return true;
    }
    return false;
  });
  const weakFallback = fallback => !fuzzyAllowed || hasStrongPrimary ? primary : unique(primary, fallback);
  const weakLimited = fallback => !fuzzyAllowed || hasStrongPrimary ? primary : !primary.length ? fallback :
    unique(primary, fallback.filter(code => !primary.includes(code)).slice(0, 2));
  if (additional) {
    const safe = (key, fn) => {
      try { return timed(key, fn); }
      catch (error) {
        const entry = errors[key] ??= {count: 0, examples: []};
        entry.count++;
        if (entry.examples.length < 5) entry.examples.push({query, message: error.message});
        return [];
      }
    };
    const searchUF = (entries, haystack) => {
      const [indices, info, order] = uf.search(haystack, query, 1, haystack.length + 1);
      const ranked = info && order ? order.map(index => info.idx[index]) : indices ?? [];
      return unique(ranked.map(index => entries[index].code));
    };
    const ufResults = safe("uFuzzy", () => searchUF(regularEntries, regularHaystack));
    const compactResults = safe("uFuzzyCompact", () => searchUF(compactEntries, compactHaystack));
    const fastResults = safe("fastFuzzy", () => fast.search(query, {threshold: 0.7}).slice(0, 8).map(row => row.code));
    const length = Math.max(1, query.replace(/[^\p{L}\p{N}]/gu, "").length);
    const dynamicThreshold = Math.max(0.7, 1 - 1 / length - 1e-9);
    const dynamic = safe("fastDynamic", () => fast.search(query, {threshold: dynamicThreshold})
      .slice(0, 8).map(row => row.code));
    const fastAdaptive = safe("fastAdaptive", () => /\s/u.test(query.trim()) ?
      unique(fastWords.search(sortedWords(query), {threshold: 0.7}).map(row => row.code), fastResults) : fastResults);
    const searchWords = (threshold, backup) => {
      if (!/\s/u.test(query.trim())) return backup;
      const terms = sortedWords(query).split(" ").filter(Boolean);
      const wordMatches = (term, word) => word.startsWith(term) || (term.length >= 4 &&
        fuzzyWord(term, word, {useSellers: false}) >= 1 - 1 / Math.max(term.length, word.length) - 1e-9);
      const wordResults = fastWords.search(sortedWords(query), {threshold}).filter(row =>
        [row.name, row.source].filter(Boolean).some(value => {
          const words = sortedWords(value).split(" ").filter(Boolean);
          return terms.every(term => words.some(word => wordMatches(term, word)));
        })).map(row => row.code);
      return unique(wordResults, backup);
    };
    const fastWordsFiltered = safe("fastWordsFiltered", () => searchWords(0.7, fastResults));
    const fastWordsDynamic = safe("fastWordsDynamic", () => searchWords(dynamicThreshold, dynamic));
    const guarded = !fuzzyAllowed || hasStrongPrimary ? primary :
      primary.length ? unique(primary, fastWordsDynamic) : fastWordsFiltered;
    const result = {current: primary, uFuzzy: ufResults, uFuzzyCompact: compactResults,
      fastFuzzy: fastResults, fastDynamic: dynamic, fastAdaptive, fastWordsFiltered, fastWordsDynamic,
      hybridUFEmpty: emptyFallback(ufResults), hybridUFFill: fillFallback(ufResults),
      hybridUFCEmpty: emptyFallback(compactResults), hybridUFCFill: fillFallback(compactResults),
      hybridFastEmpty: emptyFallback(fastResults), hybridFastFill: fillFallback(fastResults),
      hybridFastDynamicEmpty: emptyFallback(dynamic), hybridFastDynamicFill: fillFallback(dynamic),
      hybridFastAdaptiveEmpty: emptyFallback(fastAdaptive), hybridFastAdaptiveFill: fillFallback(fastAdaptive),
      hybridFastWordsEmpty: emptyFallback(fastWordsFiltered), hybridFastWordsFill: fillFallback(fastWordsFiltered),
      hybridFastWordsWeak: weakFallback(fastWordsFiltered), hybridFastWordsGuarded: guarded,
      hybridFastWordsWeak2: weakLimited(fastWordsFiltered)};
    cache.set(query, result);
    return result;
  }
  const match = timed("matchSorter", () => matchSorter(rows, query, {keys: ["name", "source"]}).slice(0, 8).map(row => row.code));
  const text = timed("fuseText", () => fuseText.search(query, {limit: 8}).map(result => result.item.code));
  const token = timed("fuseToken", () => fuseToken.search(query, {limit: 8}).map(result => result.item.code));
  const one = timed("miniOne", () => mini.search(query, miniOptions(() => 1)).slice(0, 8).map(result => result.id));
  const two = timed("miniTwo", () => mini.search(query, miniOptions(length => length >= 8 ? 2 : 1)).slice(0, 8).map(result => result.id));
  const adaptive = /\s/u.test(query.trim()) ? unique(token, text) : unique(text, token);
  const votes = new Map();
  for (const list of [text, token]) {
    list.forEach((code, index) => votes.set(code, (votes.get(code) ?? 0) + 1 / (60 + index + 1)));
  }
  const fused = [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([code]) => code);
  const result = {
    current: primary, matchSorter: match, fuseText: text, fuseToken: token, miniOne: one, miniTwo: two,
    hybridEmpty: emptyFallback(token), hybridFill: fillFallback(token),
    hybridTextEmpty: emptyFallback(text), hybridTextFill: fillFallback(text),
    hybridAdaptiveEmpty: emptyFallback(adaptive), hybridAdaptiveFill: fillFallback(adaptive), hybridAdaptiveWeak: weakFallback(adaptive),
    hybridRrfEmpty: emptyFallback(fused), hybridRrfFill: fillFallback(fused),
  };
  cache.set(query, result);
  return result;
}

function newStats() {
  return {cases: 0, skipped: 0, scores: Object.fromEntries(keys.map(key => [key, {top1: 0, top8: 0, empty: 0}]))};
}
function observe(stats, query, row) {
  if (!query || (names.has(query) && [...names.get(query)].some(code => code !== row.code))) {
    stats.skipped++;
    return;
  }
  stats.cases++;
  for (const [key, list] of Object.entries(getResults(query))) {
    const score = stats.scores[key];
    if (list[0] === row.code) score.top1++;
    if (list.includes(row.code)) score.top8++;
    if (!list.length) score.empty++;
    if (stats.examples?.[key] && !list.includes(row.code) && stats.examples[key].length < 3) {
      stats.examples[key].push({query, expected: row.name, results: list.map(code => rows.find(item => item.code === code).name)});
    }
  }
}
function distinctPositions(array) {
  if (!array.length) return [];
  return [...new Set([array[0], array[Math.floor((array.length - 1) / 2)], array[array.length - 1]])];
}
const keyboardRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
function neighbor(character) {
  const line = keyboardRows.find(value => value.includes(character));
  if (!line) return "x";
  const index = line.indexOf(character);
  return line[index === line.length - 1 ? index - 1 : index + 1];
}
function mutations(base, kind) {
  const positions = [];
  for (let i = 0; i < base.length; i++) {
    if (!/[a-z]/u.test(base[i])) continue;
    if (kind === "transpose" && (!/[a-z]/u.test(base[i + 1] ?? "") || base[i] === base[i + 1])) continue;
    positions.push(i);
  }
  return [...new Set(distinctPositions(positions).map(i => {
    if (kind === "deletion") return base.slice(0, i) + base.slice(i + 1);
    if (kind === "insertion") return base.slice(0, i) + base[i] + base.slice(i);
    if (kind === "substitution") return base.slice(0, i) + neighbor(base[i]) + base.slice(i + 1);
    return base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2);
  }))];
}

if (process.argv.includes("--examples")) {
  for (const query of ["par", "parramata", "praramatta", "eiley park", "rmu heights", "hill castle", "stmarys", "rsby", "eenfield", "parramatta,sydney"]) {
    const results = getResults(query);
    console.log(JSON.stringify({query, results: Object.fromEntries(Object.entries(results).map(([key, codes]) =>
      [key, codes.slice(0, 3).map(code => rows.find(row => row.code === code).name)]))}));
  }
  console.log(JSON.stringify({errors}));
  process.exit(Object.keys(errors).length ? 1 : 0);
}

if (process.argv.includes("--precision")) {
  const strategies = additional ? ["hybridUFEmpty", "hybridUFFill", "hybridUFCEmpty", "hybridUFCFill",
    "hybridFastEmpty", "hybridFastFill", "hybridFastDynamicEmpty", "hybridFastDynamicFill",
    "hybridFastAdaptiveEmpty", "hybridFastAdaptiveFill", "hybridFastWordsEmpty", "hybridFastWordsFill", "hybridFastWordsWeak", "hybridFastWordsGuarded", "hybridFastWordsWeak2"] :
    ["hybridEmpty", "hybridFill", "hybridTextEmpty", "hybridTextFill", "hybridAdaptiveEmpty", "hybridAdaptiveFill", "hybridAdaptiveWeak", "hybridRrfEmpty", "hybridRrfFill"];
  for (const [kind, queryFor] of [
    ["exact_name", row => normalize(row.name)],
    ["prefix_4", row => baseName(row).slice(0, 4)],
    ["infix_4", row => (baseName(row).match(/(?:^|\s)([a-z]{6,})/u)?.[1] ?? "").slice(1, 5)],
  ]) {
    const queries = [...new Set(rows.map(queryFor))];
    const scores = Object.fromEntries(strategies.map(key => [key, {withExtras: 0, extraCount: 0, examples: []}]));
    let eligible = 0;
    for (const query of queries) {
      const results = getResults(query);
      if (!results.current.length || results.current.length >= 8) continue;
      eligible++;
      for (const key of strategies) {
        const extras = results[key].filter(code => !results.current.includes(code));
        if (!extras.length) continue;
        const score = scores[key];
        score.withExtras++;
        score.extraCount += extras.length;
        if (score.examples.length < 3) score.examples.push({query, names: extras.map(code => rows.find(row => row.code === code).name)});
      }
    }
    console.log(JSON.stringify({group: `${kind}_extra_suggestions`, eligible, scores}));
  }
  console.log(JSON.stringify({errors}));
  process.exit(Object.keys(errors).length ? 1 : 0);
}

if (process.argv.includes("--hard")) {
  const hardGroups = [
    ["double_substitution", row => {
      const base = baseName(row);
      const positions = [];
      for (let i = 0; i < base.length; i++) if (/[a-z]/u.test(base[i])) positions.push(i);
      if (positions.length < 6) return [];
      const first = positions[0], last = positions.at(-1);
      return [base.slice(0, first) + neighbor(base[first]) + base.slice(first + 1, last) +
        neighbor(base[last]) + base.slice(last + 1)];
    }],
    ["incomplete_prefix_substitution", row => {
      const base = baseName(row);
      if (base.length <= 5) return [];
      const prefix = base.slice(0, 5);
      const possibleTargets = rows.filter(candidate => [candidate.name, candidate.source]
        .some(value => normalize(value).startsWith(prefix))).length;
      if (possibleTargets > 8) return [];
      return mutations(prefix, "substitution").slice(1, 2);
    }],
  ];
  for (const [name, queries] of hardGroups) {
    const stats = newStats();
    let rowsCovered = 0;
    for (const row of rows) {
      const values = queries(row);
      if (values.length) rowsCovered++;
      for (const query of values) observe(stats, query, row);
    }
    console.log(JSON.stringify({group: name, rowsCovered, ...stats}));
  }
  console.log(JSON.stringify({errors}));
  process.exit(Object.keys(errors).length ? 1 : 0);
}

const groups = [
  ["exact_name", row => [normalize(row.name)]],
  ["exact_source", row => row.source ? [normalize(row.source)] : []],
  ...[2, 3, 4].map(length => [`prefix_${length}`, row => [baseName(row).slice(0, length)]]),
  ...["deletion", "insertion", "substitution", "transpose"].map(kind => [kind, row => mutations(baseName(row), kind)]),
  ["reversed_words", row => {
    const words = baseName(row).split(/\s+/u);
    return words.length > 1 && words.join(" ") !== words.toReversed().join(" ") ? [words.toReversed().join(" ")] : [];
  }],
  ["missing_spaces", row => {
    const base = baseName(row);
    return base.includes(" ") ? [base.replaceAll(" ", "")] : [];
  }],
];

for (const [name, queries] of groups) {
  const stats = newStats();
  if (additional && ["deletion", "insertion", "substitution", "transpose"].includes(name)) {
    stats.examples = {uFuzzy: [], uFuzzyCompact: [], fastAdaptive: [], fastWordsFiltered: [],
      hybridFastWordsEmpty: [], hybridFastWordsFill: [], hybridFastWordsWeak: [], hybridFastWordsGuarded: [], hybridFastWordsWeak2: []};
  }
  let rowsCovered = 0;
  for (const row of rows) {
    const values = queries(row);
    if (values.length) rowsCovered++;
    for (const query of values) {
      if (name.startsWith("prefix_")) {
        const prefixMatches = rows.filter(candidate => [candidate.name, candidate.source]
          .some(value => normalize(value).startsWith(query))).length;
        if (prefixMatches > 8) { stats.skipped++; continue; }
      }
      observe(stats, query, row);
    }
  }
  console.log(JSON.stringify({group: name, rowsCovered, ...stats}));
}
let seed = 721903;
const noise = {cases: 0, skipped: 0, scores: Object.fromEntries(keys.map(key => [key, {withResults: 0, suggestionCount: 0}]))};
for (let i = 0; i < 300; i++) {
  const length = 4 + i % 9;
  let query = "";
  for (let n = 0; n < length; n++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    query += String.fromCharCode(97 + (seed >>> 16) % 26);
  }
  if (rows.some(row => normalize(row.name).includes(query) || normalize(row.source).includes(query))) {
    noise.skipped++;
    continue;
  }
  noise.cases++;
  for (const [key, list] of Object.entries(getResults(query))) {
    if (list.length) noise.scores[key].withResults++;
    noise.scores[key].suggestionCount += list.length;
  }
}
console.log(JSON.stringify({group: "synthetic_non_names", ...noise}));
const timings = Object.fromEntries(Object.entries(durations).map(([key, values]) => {
  const ordered = values.toSorted((a, b) => a - b);
  return [key, {searches: values.length, medianMs: ordered[Math.floor(ordered.length * 0.5)], p95Ms: ordered[Math.floor(ordered.length * 0.95)]}];
}));
console.log(JSON.stringify({rows: rows.length, uniqueQueries: cache.size, timings, errors}));
if (Object.keys(errors).length) process.exitCode = 1;
