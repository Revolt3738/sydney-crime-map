import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mapScript = await fs.readFile(new URL("../work/suburb_map.js", import.meta.url), "utf8");
const keyboardScript = await fs.readFile(new URL("../work/suburb_map_keyboard.js", import.meta.url), "utf8");

function contextFor({source, fetch}) {
  const context = vm.createContext({
    document: {getElementById: () => source, activeElement: {}},
    fetch,
    DOMPoint: class { matrixTransform() { return {x: 0, y: 0}; } },
  });
  vm.runInContext(mapScript + keyboardScript, context);
  return context;
}

test("map geometry loads on demand and rejects failed or invalid responses", async () => {
  const source = {dataset: {src: "/map-shapes.json"}};
  const shape = {"1": ["M0 0Z", [0, 0, 1, 1]]};
  let requests = 0;
  const context = contextFor({source, fetch: async () => {
    requests++;
    return {ok: true, json: async () => shape};
  }});
  context.rows = [{code: "1"}];
  assert.equal(requests, 0);
  assert.equal(await vm.runInContext("loadMapShapes(rows)", context), shape);
  assert.equal(requests, 1);
  context.fetch = async () => ({ok: false, status: 404});
  await assert.rejects(vm.runInContext("loadMapShapes(rows)", context), /HTTP 404/);
  context.fetch = async () => ({ok: true, json: async () => ({"1": ["bad", [0]]})});
  await assert.rejects(vm.runInContext("loadMapShapes(rows)", context), /Invalid map geometry/);
  source.dataset = {};
  source.textContent = JSON.stringify(shape);
  assert.equal(JSON.stringify(await vm.runInContext("loadMapShapes(rows)", context)), JSON.stringify(shape));
});

test("legend bands use the same displayed precision as the selected rate", () => {
  const context = contextFor({source: {}, fetch: undefined});
  assert.equal(vm.runInContext("crimeColour(288.6994775914215, [103.5,181.7,288.7,487,1657.9], false)", context), "#f99b50");
});

test("map wheel preserves browser zoom and ordinary page scrolling", () => {
  const context = contextFor({source: {}, fetch: undefined});
  const handlers = {};
  const svg = {clientHeight: 500, contains: () => false,
    addEventListener: (name, callback) => { handlers[name] = callback; }};
  context.map = {svg, box: [0, 0, 100, 100], full: [0, 0, 100, 100]};
  context.update = () => assert.fail("The map must not zoom");
  vm.runInContext("configurePointerZoom(map, update)", context);
  for (const ctrlKey of [false, true]) {
    svg.contains = () => ctrlKey;
    const event = {deltaMode: 0, deltaY: -1, ctrlKey, preventDefault: () => assert.fail("Browser action was blocked")};
    handlers.wheel(event);
  }
});
