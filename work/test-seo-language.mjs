import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import {periodCopy, translatePeriod} from "./period-copy.mjs";

const rawScript = await fs.readFile(new URL("./suburb_language.js", import.meta.url), "utf8");
const period = periodCopy(JSON.parse(await fs.readFile(new URL("./crime_period.json", import.meta.url), "utf8")));
const descriptions = translatePeriod(JSON.parse(await fs.readFile(new URL("./seo-descriptions.json", import.meta.url), "utf8")), period);
const script = rawScript.replace("__SUBURB_DESCRIPTIONS__", JSON.stringify(descriptions));
const translations = translatePeriod(JSON.parse(await fs.readFile(new URL("./suburb_english.json", import.meta.url), "utf8")), period);

function mockElement(dataset = {}, attributes = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    dataset,
    setAttribute(key, value) { values.set(key, value); },
    getAttribute(key) { return values.get(key); },
    removeAttribute(key) { values.delete(key); },
  };
}

function runScenario(initial) {
  const english = initial === "en";
  const nodes = [
    {data: english ? "Sydney and Central Coast Crime Rates" : "悉尼犯罪率与中央海岸统计"},
    {data: english ? "  10 suburbs with the largest populations\n" : "  人口最多的 10 个 suburb\n"},
    {data: english ? "Sydney Crime Rates by Suburb | Crime Map and Statistics" : "悉尼犯罪率及中央海岸｜各区犯罪地图与统计"},
    {data: english ? period.en : period.zh},
  ];
  const aria = mockElement({}, {"aria-label": english ? "Page language" : "页面语言"});
  const zh = mockElement({language: "zh"});
  const en = mockElement({language: "en"});
  const suburb = mockElement({suburbLink: "chatswood"});
  const canonical = {href: ""};
  const description = {content: ""};
  const location = {protocol: "https:", href: `https://sydcrime.xdxo.top/${english ? "en/" : ""}?q=Chatswood`};
  const window = {location, history: {replaceState(_a, _b, url) { location.href = String(url); }}};
  const document = {
    documentElement: {lang: english ? "en-AU" : "zh-Hans"},
    getElementById: () => ({textContent: JSON.stringify(translations)}),
    createTreeWalker() {
      let index = -1;
      return {nextNode() { this.currentNode = nodes[++index]; return index < nodes.length; }};
    },
    querySelectorAll(selector) {
      return {"[aria-label]": [aria], "[data-language]": [zh, en], "[data-suburb-link]": [suburb]}[selector];
    },
    querySelector(selector) { return selector.includes("canonical") ? canonical : description; },
  };
  const context = {document, window, URL, NodeFilter: {SHOW_TEXT: 4}, renders: 0};
  vm.runInNewContext(`${script}\npageLanguage = ${JSON.stringify(initial)}; configureLanguage(() => renders++);`, context);
  let prevented = 0;
  const event = {preventDefault() { prevented++; }};
  const first = english ? zh : en;
  const second = english ? en : zh;
  first.onclick(event);
  assert.equal(document.documentElement.lang, english ? "zh-Hans" : "en-AU");
  assert.equal(nodes[0].data, english ? "悉尼犯罪率与中央海岸统计" : "Sydney and Central Coast Crime Rates");
  assert.equal(nodes[1].data, english ? "  人口最多的 10 个 suburb\n" : "  10 suburbs with the largest populations\n");
  assert.equal(nodes[2].data, english ? "悉尼犯罪率及中央海岸｜各区犯罪地图与统计" : "Sydney Crime Rates by Suburb | Crime Map and Statistics");
  assert.equal(nodes[3].data, english ? period.zh : period.en);
  assert.equal(aria.getAttribute("aria-label"), english ? "页面语言" : "Page language");
  assert.equal(first.getAttribute("aria-current"), "page");
  assert.equal(new URL(location.href).searchParams.get("q"), "Chatswood");
  assert.equal(new URL(location.href).pathname, english ? "/" : "/en/");
  assert.equal(suburb.href, english ? "/suburbs/chatswood/" : "/en/suburbs/chatswood/");
  assert.equal(canonical.href, `https://sydcrime.xdxo.top${english ? "/" : "/en/"}`);
  assert.equal(description.content, descriptions[english ? "zh" : "en"]);
  second.onclick(event);
  assert.equal(document.documentElement.lang, english ? "en-AU" : "zh-Hans");
  assert.equal(context.renders, 2);
  assert.equal(prevented, 2);
}

runScenario("zh");
runScenario("en");
console.log("Verified language switching in both directions, preserved query, metadata and suburb links.");
