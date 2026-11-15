import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import {selectPlaces} from "./seo-places.mjs";

const directory = new URL("./", import.meta.url);
const [template, script, raw, rawShapes, mapScript, mapCss, englishCopy, languageScript, gesturesScript, compareScript, detailsScript, chineseCopy, descriptionCopy] = await Promise.all(
  ["suburb_view.html", "suburb_view.js", "crime_data.json", "suburb_shapes.json",
    "suburb_map.js", "suburb_map.css", "suburb_english.json", "suburb_language.js",
    "suburb_gestures.js", "suburb_compare.js", "suburb_details.js", "suburb_chinese_labels.json", "seo-descriptions.json"].map(
    name => fs.readFile(new URL(name, directory), "utf8"),
  ),
);
const data = JSON.parse(raw);
const faviconPng = await fs.readFile(new URL("suburb_favicon_user.png", directory));
assert.equal(faviconPng.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
const shapes = JSON.parse(rawShapes);
const english = JSON.parse(englishCopy);
const chineseDataLabels = JSON.parse(chineseCopy);
const pageDescriptions = JSON.parse(descriptionCopy);
assert.deepEqual(Object.keys(pageDescriptions).sort(), ["en", "zh"]);
for (const description of Object.values(pageDescriptions)) assert.doesNotMatch(description, /["<>]/);
const resolvedLanguageScript = languageScript.replace("__SUBURB_DESCRIPTIONS__", JSON.stringify(pageDescriptions));
const {leaders, extras} = selectPlaces(data.rows);
const safeText = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const suburbLink = place => `<a data-suburb-link="${place.slug}" href="/suburbs/${place.slug}/">${safeText(place.source)}</a>`;
const populationLinks = leaders.map(place => `<li>${suburbLink(place)} <span class="muted">${place.population.toLocaleString("en-AU")}</span></li>`).join("");
const extraLinks = extras.map(suburbLink).join(" · ");
assert.deepEqual(Object.keys(chineseDataLabels.offences).sort(), Object.keys(data.labels).sort());
assert.deepEqual(Object.keys(chineseDataLabels.regions).sort(), [...new Set(data.rows.map(row => row.region))].sort());
for (const copy of [...Object.values(chineseDataLabels.offences), ...Object.values(chineseDataLabels.regions)]) {
  assert.match(copy, /\p{Script=Han}/u);
}
const staticMarkup = template.replace(/<style>[^]*?<\/style>/, "");
const staticText = [
  ...Array.from(staticMarkup.matchAll(/>([^<>]+)</g), match => match[1].trim()),
  ...Array.from(staticMarkup.matchAll(/aria-label="([^"]+)"/g), match => match[1]),
];
for (const chinese of staticText.filter(copy => /\p{Script=Han}/u.test(copy) && copy !== "中文")) {
  assert.ok(Object.hasOwn(english, chinese), `Missing English text: ${chinese}`);
}
const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
const html = template.replace("__SUBURB_DATA__", () => payload)
  .replace("__SUBURB_META_DESCRIPTION__", () => pageDescriptions.zh)
  .replace("__SUBURB_POPULATION_LINKS__", () => populationLinks)
  .replace("__SUBURB_EXTRA_LINKS__", () => extraLinks)
  .replace("__SUBURB_FAVICON_PNG__", () => faviconPng.toString("base64"))
  .replace("__SUBURB_SHAPES__", () => JSON.stringify(shapes))
  .replace("__SUBURB_MAP_CSS__", () => mapCss)
  .replace("__SUBURB_ENGLISH__", () => JSON.stringify(english).replaceAll("<", "\\u003c"))
  .replace("__SUBURB_ZH_LABELS__", () => JSON.stringify(chineseDataLabels).replaceAll("<", "\\u003c"))
  .replace("__SUBURB_LANGUAGE_SCRIPT__", () => resolvedLanguageScript)
  .replace("__SUBURB_MAP_SCRIPT__", () => mapScript)
  .replace("__SUBURB_GESTURES_SCRIPT__", () => gesturesScript)
  .replace("__SUBURB_COMPARE_SCRIPT__", () => compareScript)
  .replace("__SUBURB_DETAILS_SCRIPT__", () => detailsScript)
  .replace("__SUBURB_SCRIPT__", () => script);
const embedded = html.match(/<script type="application\/json" id="dataset">([^]*?)<\/script>/)[1];
assert.deepEqual(JSON.parse(embedded), data);
assert.equal(data.rows.length, 926);
assert.equal(new Set(data.rows.map(row => row.code)).size, 926);
assert.equal(data.rows.filter(row => row.violent[2] !== null).length, 910);
assert.equal(Object.keys(data.labels).length, 62);
assert.deepEqual(Object.keys(shapes).sort(), data.rows.map(row => row.code).sort());
for (const [path, box] of Object.values(shapes)) {
  assert.match(path, /^M[\d., MZ-]+Z$/);
  assert.ok(box.every(Number.isFinite) && box[0] < box[2] && box[1] < box[3]);
}
assert.doesNotMatch(html, /__SUBURB_[A-Z_]+__/);

const start = 'start(JSON.parse(document.getElementById("dataset").textContent));';
assert.ok(script.trimEnd().endsWith(start));
const routines = script.trimEnd().slice(0, -start.length);
vm.runInNewContext(resolvedLanguageScript + mapScript + gesturesScript + compareScript + detailsScript + routines + `
  const compare = filterRows(data.rows, "Blacktown， Kingsford", "");
  assert.equal(compare.length, 2);
  assert.equal(filterRows(data.rows, "", "Central Coast").length, 152);
  assert.equal(filterRows(data.rows, "", "", 2000).length, 602);
  assert.equal(filterRows(data.rows, "Moore Park", "", 2000)[0].name, "Moore Park");
  const gosford = matchingSuggestions(data.rows, "Gosford", []);
  assert.equal(gosford[0].name, "Gosford");
  assert.ok(gosford.some(row => row.name === "West Gosford"));
  const chatswood = matchingSuggestions(data.rows, "Chatswood");
  assert.deepEqual(Array.from(chatswood, row => row.name), ["Chatswood", "Chatswood West"]);
  assert.equal(filterRows(data.rows, "Chatswood", "", 2000).length, 1);
  assert.equal(filterRows(data.rows, "Chatswood West", "", 2000)[0].pop, 1521);
  const choices = new Map([...chatswood, ...gosford].map(row => [row.code, row]));
  const selection = comparisonSelection(new URL("https://example.com/").searchParams, choices);
  for (const code of choices.keys()) {
    selection.add(code);
    selection.add(code);
  }
  assert.equal(selection.values().length, 4);
  selection.remove(chatswood[0].code);
  assert.equal(selection.values().length, 3);
  assert.ok(!selection.has(chatswood[0].code));
  const nodes = new Map();
  const compareControls = [];
  function makeElement() {
    return {
      children: [], dataset: {}, attributes: new Map(), textContent: "",
      setAttribute(key, value) { this.attributes.set(key, value); },
      getAttribute(key) { return this.attributes.get(key); },
      replaceChildren(...children) { this.children = children; },
      append(child) { this.children.push(child); },
      addEventListener(name, callback) { this[name] = callback; },
      focus() { this.focused = true; },
    };
  }
  globalThis.document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, makeElement());
      return nodes.get(id);
    },
    createElement: makeElement,
    createDocumentFragment: makeElement,
    querySelectorAll: () => compareControls,
  };
  const lookup = {search:{value:"Chatswood"}, region:{value:""}, population:{value:"2000"},
    metric:{value:"non_dv"}, display:"list", showArea(row) { this.opened = row; }};
  lookup.comparison = configureComparison(data.rows, lookup, new URL("https://example.com").searchParams);
  const suggestions = makeElement();
  showSuggestions(suggestions, data.rows, lookup);
  const [first, second] = suggestions.children[0].children;
  assert.match(second.children[0].children[1].textContent, /低于人口门槛/);
  second.children[1].children[0].onclick();
  assert.equal(lookup.opened.name, "Chatswood West");
  const compareControl = first.children[1].children[1];
  compareControls.push(compareControl);
  document.getElementById("explorer").click({target:{closest:() => compareControl}});
  assert.equal(lookup.search.value, "Chatswood");
  assert.equal(lookup.population.value, "2000");
  assert.equal(document.getElementById("compare-count").textContent, "对比 1/4");
  assert.equal(compareControl.getAttribute("aria-disabled"), "true");
  document.getElementById("explorer").click({target:{closest:() => compareControl}});
  assert.equal(document.getElementById("compare-count").textContent, "对比 1/4");
  const mapStub = {
    svg: makeElement(), summary: makeElement(), actions: makeElement(), shapes,
    byCode: new Map(chatswood.map(row => [row.code,row])),
    paths: new Map(chatswood.map(row => [row.code,{classList:{add(name) {this.mark = name;}, remove() {this.mark = "";}}}])),
    comparison: lookup.comparison, metric:"non_dv", minPopulation:2000, selected:"",
  };
  configureMapActions(mapStub, box => { mapStub.box = box; });
  mapStub.focusArea(chatswood[1].code);
  assert.equal(mapStub.selected, chatswood[1].code);
  assert.equal(mapStub.paths.get(chatswood[1].code).classList.mark, "selected");
  assert.match(mapStub.summary.textContent, /Chatswood West.*低于当前人口门槛/);
  assert.equal(mapStub.box.join(","), paddedExtent([shapes[chatswood[1].code][1]]).join(","));
  assert.equal(mapStub.actions.children[1].dataset.compare, chatswood[1].code);
  assert.ok(rateBaseline(data.rows, "non_dv") > 0);
  const mapLink = new URL("https://example.com/?q=Gosford&area=Central%20Coast&metric=burglary&pop=500&sort=rateLow&view=map&box=10,20,100,80");
  mapLink.searchParams.set("pin", gosford[0].code);
  assert.equal(mapSnapshot(mapLink.searchParams, data.rows).box.join(","), "10,20,100,80");
  assert.equal(mapSnapshot(mapLink.searchParams, data.rows).pin, gosford[0].code);
  const restore = {search:{value:""}, population:{options:[{value:"500"}],value:"2000"},
    region:{options:[{value:"Central Coast"}]}, metric:{options:[{value:"burglary"}]}, order:{options:[{value:"rateLow"}]}};
  restoreQuery(restore, mapLink.searchParams);
  assert.equal(restore.search.value, "Gosford");
  assert.equal(restore.population.value, "500");
  assert.equal(filterRows(data.rows, "Kingsford", "Central Coast").length, 0);
  assert.equal(sortedRows(compare, "burglary", "rateHigh")[0].name, "Kingsford (NSW)");
  assert.equal(sortedRows(compare, "burglary", "countHigh")[0].name, "Blacktown");
  assert.equal(sortedRows(compare, "burglary", "rateLow")[0].name, "Blacktown");
  assert.equal(sortedRows(compare, "violent", "name")[0].name, "Blacktown");
  assert.equal(sortedRows(data.rows, "non_dv", "rateHigh")[0].name, "Moore Park");
  assert.equal(sortedRows(data.rows, "burglary", "rateHigh")[0].name, "Crangan Bay");
  assert.equal(sortedRows(data.rows, "violent", "rateLow").slice(-16).every(r => r.violent[1] === null), true);
  assert.equal(compare.find(r => r.name === "Blacktown").counts["Break and enter dwelling"], 99);
  assert.equal(compare.find(r => r.name.startsWith("Kingsford")).counts["Break and enter dwelling"], 37);
  const populationFiltered = filterRows(data.rows, "", "", 2000);
  assert.ok(populationFiltered.length < data.rows.length && populationFiltered.length > 500);
  assert.ok(populationFiltered.every(row => row.pop >= 2000));
  assert.equal(filterRows([{pop: 1999}, {pop: 2000}], "", "", 2000).length, 1);
  assert.equal(populationFiltered.find(row => row.name === "Blacktown").violent[2], 100);
  for (const key of Object.keys(metrics)) {
    const limits = crimeBreaks(data.rows, key);
    assert.equal(limits.length, 5);
    assert.ok(limits.every((value, index) => value > (limits[index - 1] ?? 0)));
    assert.equal(crimeColour(0, limits, false), mapColours.zero);
    assert.equal(crimeColour(null, limits, false), mapColours.missing);
    assert.equal(crimeColour(50, limits, true), mapColours.excluded);
    assert.equal(crimeColour(limits[0], limits, false), colourSteps[0]);
    assert.equal(crimeColour(limits.at(-1) + 1, limits, false), colourSteps.at(-1));
  }
  const full = paddedExtent(Object.values(shapes).map(shape => shape[1]));
  assert.ok(full[2] > 100 && full[3] > 100);
  assert.equal(centeredZoom(full, zoomStep)[2], full[2] / zoomStep);
  assert.equal(minimumMapZoom(centeredZoom(full, 0.9), full, 864, 450), full);
  const closer = centeredZoom(full, 1.1);
  assert.equal(minimumMapZoom(closer, full, 864, 450), closer);
  for (const code of landmarkCodes) {
    assert.ok(shapes[code] && data.rows.some(row => row.code === code && row.source));
  }
  const anchor = [37, 58];
  const original = [10, 20, 100, 80];
  const zoomed = zoomAt(original, 2, anchor);
  assert.equal((anchor[0] - original[0]) / original[2], (anchor[0] - zoomed[0]) / zoomed[2]);
  assert.equal((anchor[1] - original[1]) / original[3], (anchor[1] - zoomed[1]) / zoomed[3]);
  assert.ok(wheelZoomFactor(-120) > 1 && wheelZoomFactor(120) < 1);
  assert.equal(wheelZoomFactor(0), 1);
  const single = gestureFrame(new Map([[1, {x: 40, y: 20}]]));
  const dragged = gestureExtent([0, 0, 100, 80], single, {x: 50, y: 40, span: 0}, [20, 10], 2);
  assert.equal(dragged.join(","), "-5,-10,100,80");
  const pair = gestureFrame(new Map([[1, {x: 30, y: 40}], [2, {x: 70, y: 40}]]));
  assert.equal(pair.span, 40);
  const pinched = gestureExtent([0, 0, 100, 80], pair, {x: 60, y: 50, span: 80}, [25, 20], 2);
  assert.equal(pinched.join(","), "10,7.5,50,40");
  const events = new Map();
  const captures = [];
  const selected = [];
  const svg = {
    clientWidth: 100, clientHeight: 80,
    addEventListener: (name, fn) => events.set(name, fn),
    setPointerCapture: id => captures.push(id),
    getScreenCTM: () => ({inverse: () => ({})}),
  };
  const shape = {closest: () => ({dataset: {code: "10396"}})};
  const map = {svg, box: [0, 0, 100, 80]};
  configureMapGestures(map, box => { map.box = box; }, code => selected.push(code));
  function fire(type, id, x, y, target = svg) {
    events.get(type)({pointerId: id, clientX: x, clientY: y, button: 0, target});
  }
  fire("pointerdown", 1, 20, 40, shape);
  fire("lostpointercapture", 1, 20, 40, shape);
  fire("pointermove", 1, 30, 40);
  assert.equal(map.box[0], -10);
  fire("pointerup", 1, 30, 40);
  fire("pointerdown", 2, 25, 40, shape);
  fire("pointerdown", 3, 75, 40, shape);
  fire("lostpointercapture", 2, 25, 40, shape);
  fire("lostpointercapture", 3, 75, 40, shape);
  fire("pointermove", 3, 100, 40);
  assert.ok(map.box[2] < 100);
  fire("pointerup", 2, 25, 40);
  fire("pointerup", 3, 100, 40);
  assert.equal(selected.length, 0);
  fire("pointerdown", 4, 20, 40, shape);
  fire("pointerup", 4, 20, 40);
  assert.equal(selected.join(","), "10396");
  assert.equal(captures.join(","), "1,2,3,4");
  const blacktown = data.rows.find(row => row.name === "Blacktown");
  assert.match(describeArea(blacktown, "burglary", 2000), /99 件.*194\.3.*250/);
  pageLanguage = "en";
  assert.match(describeArea(blacktown, "burglary", 2000),
    /Residential break-ins 99 incidents.*194[.]3 incidents per 100,000 residents.*Rate rank 250 in Greater Sydney and Central Coast/);
  assert.match(detailSummary(blacktown), /2021 Census population 50,961/);
  assert.equal(offenceLabel("Murder *"), "Murder *");
  assert.equal(regionLabel("Sydney - City and Inner South"), "Sydney - City and Inner South");
  pageLanguage = "zh";
  assert.match(detailSummary(blacktown), /2021 年普查人口 50,961/);
  assert.equal(regionLabel("Sydney - City and Inner South"), "悉尼 — 市中心及内南区");
  assert.equal(offenceLabel("Murder *"), "谋杀 *");
  assert.notEqual(offenceLabel("Break and enter dwelling"), offenceLabel("Steal from dwelling"));
`, {data, shapes, assert, URL, chineseDataLabels, DOMPoint: class {
  constructor(x, y) { this.x = x; this.y = y; }
  matrixTransform() { return this; }
}});

const output = new URL("../outputs/大悉尼及中央海岸_Suburb犯罪查询.html", directory);
await fs.writeFile(output, html, "utf8");
console.log("Verified data, bilingual labels, search and comparison actions, rankings, and map location and gestures.");
