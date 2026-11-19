import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {canSearch, fuzzySuggestions} from "../work/suburb_search.mjs";

const data = JSON.parse(await fs.readFile(new URL("../work/crime_data.json", import.meta.url), "utf8"));
const source = await fs.readFile(new URL("../work/suburb_compare.js", import.meta.url), "utf8");
const end = source.indexOf("\nfunction renderCompareCard");
assert.ok(end > 0, "Could not locate search functions");
const search = vm.runInNewContext(`const names = new Intl.Collator("en-AU");\n${source.slice(0, end)}\n` +
  "({literalSuggestions, matchingSuggestions})", {Intl, SuburbSearch: {fuzzySuggestions}});
const {rows} = data;
const names = result => Array.from(result, row => row.name);

test("all 926 names and available source aliases remain exact first", async () => {
  assert.equal(rows.length, 926);
  for (const row of rows) {
    assert.equal((await search.matchingSuggestions(rows, row.name))[0]?.code, row.code, row.name);
    if (row.source) assert.equal((await search.matchingSuggestions(rows, row.source))[0]?.code, row.code, row.source);
  }
  assert.deepEqual(names(await search.matchingSuggestions(rows, "  pAr  ")).slice(0, 2), ["Parklea", "Parramatta"]);
  assert.deepEqual(names(await search.matchingSuggestions(rows, "Chatswood")), ["Chatswood", "Chatswood West"]);
});

test("typos, reversed words and missing spaces offer the expected suburb", async () => {
  for (const [query, expected] of [["parramata", "Parramatta"], ["praramatta", "Parramatta"],
    ["eiley park", "Wiley Park"], ["rmu heights", "Emu Heights (NSW)"],
    ["hill castle", "Castle Hill (NSW)"], ["stmarys", "St Marys (NSW)"]]) {
    assert.equal((await search.matchingSuggestions(rows, query))[0]?.name, expected, query);
  }
  assert.deepEqual(names(await search.matchingSuggestions(rows, "rsby")), ["Somersby"]);
  assert.ok(names(await fuzzySuggestions(rows, "rsby")).includes("Raby"));
  assert.deepEqual(names(await search.matchingSuggestions(rows, "par，gosford")), []);
  assert.deepEqual(names(await fuzzySuggestions(rows, "par")), []);
});

test("similar spellings remain optional when a literal substring matches", async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = new Map(); this.dataset = {}; }
    append(child) { this.children.push(...(child.tag === "fragment" ? child.children : [child])); }
    replaceChildren(...children) { this.children = []; for (const child of children) this.append(child); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
  }
  const document = {createElement: tag => new Element(tag), createDocumentFragment: () => new Element("fragment")};
  const add = (parent, tag, {text, className} = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    parent.append(node);
    return node;
  };
  const render = vm.runInNewContext(`const names = new Intl.Collator("en-AU");\n${source}\nshowSuggestions`,
    {Intl, SuburbSearch: {canSearch, fuzzySuggestions}, document, add, t: (_zh, en) => en});
  const container = new Element("div");
  const view = {search: {value: "rsby"}, population: {value: "0"}, region: {value: ""}, display: "list",
    comparison: {updateButton() {}}, showArea() {}};
  render(container, rows, view);
  const button = container.children.find(child => child.className === "link similar-toggle");
  const more = container.children.find(child => child.id === "similar-suggestions");
  const status = container.children.find(child => child.getAttribute("role") === "status");
  assert.ok(button);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(more.hidden, true);
  await button.onclick();
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(more.hidden, false);
  assert.equal(more.children[0].children[0].children[0].textContent, "Raby");
  assert.match(status.textContent, /similar spellings found/u);
  await button.onclick();
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(more.hidden, true);

  const pending = [];
  const delayed = vm.runInNewContext(`const names = new Intl.Collator("en-AU");\n${source}\nshowSuggestions`,
    {Intl, SuburbSearch: {canSearch, fuzzySuggestions: () => new Promise(resolve => pending.push(resolve))},
      document, add, t: (_zh, en) => en});
  view.search.value = "parramata";
  delayed(container, rows, view);
  view.search.value = "chatswod";
  delayed(container, rows, view);
  assert.equal(pending.length, 2);
  pending[1]([rows.find(row => row.name === "Chatswood")]);
  await new Promise(resolve => setTimeout(resolve, 0));
  pending[0]([rows.find(row => row.name === "Parramatta")]);
  await new Promise(resolve => setTimeout(resolve, 0));
  const result = container.children.find(child => child.className === "suggestion-row");
  assert.equal(result.children[0].children[0].textContent, "Chatswood");
});

test("single-character errors across the complete dataset retain high recall", async () => {
  const exact = new Map();
  for (const row of rows) {
    for (const value of [row.name, row.source, row.name.replace(/\s*\(.*/u, "")].filter(Boolean)) {
      const key = value.trim().toLowerCase();
      if (!exact.has(key)) exact.set(key, new Set());
      exact.get(key).add(row.code);
    }
  }
  const keyboard = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const neighbor = character => {
    const line = keyboard.find(value => value.includes(character));
    const index = line.indexOf(character);
    return line[index === line.length - 1 ? index - 1 : index + 1];
  };
  for (const kind of ["deletion", "insertion", "substitution", "transpose"]) {
    let cases = 0;
    let found = 0;
    for (const row of rows) {
      const name = row.name.replace(/\s*\(.*/u, "").toLowerCase();
      const positions = [];
      for (let i = 0; i < name.length; i++) {
        if (!/[a-z]/u.test(name[i])) continue;
        if (kind === "transpose" && (!/[a-z]/u.test(name[i + 1] ?? "") || name[i] === name[i + 1])) continue;
        positions.push(i);
      }
      for (const i of new Set([positions[0], positions[Math.floor((positions.length - 1) / 2)], positions.at(-1)])) {
        if (i === undefined) continue;
        let query;
        if (kind === "deletion") query = name.slice(0, i) + name.slice(i + 1);
        else if (kind === "insertion") query = name.slice(0, i) + name[i] + name.slice(i);
        else if (kind === "substitution") query = name.slice(0, i) + neighbor(name[i]) + name.slice(i + 1);
        else query = name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2);
        if (exact.has(query) && [...exact.get(query)].some(code => code !== row.code)) continue;
        cases++;
        if ((await search.matchingSuggestions(rows, query)).some(candidate => candidate.code === row.code)) found++;
      }
    }
    assert.ok(cases >= rows.length * 2, `${kind}: only generated ${cases} cases`);
    assert.ok(found / cases >= 0.99, `${kind}: found intended suburb in ${found}/${cases} cases`);
  }
});
