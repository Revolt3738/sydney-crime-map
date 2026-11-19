const svgNamespace = "http://www.w3.org/2000/svg";
const colourSteps = ["#fff1b2", "#fed078", "#f99b50", "#e86743", "#bb3545", "#741c3b"];
const ratePercentiles = [.2, .4, .6, .8, .95];
const landmarkCodes = ["13730", "11728", "12085", "13167", "10779", "13375", "14464", "13195", "11943", "13716", "14362"];
const overviewLabelMaxZoom = 1.8;
const labelPixels = 12;
const labelCharacterWidth = 7;
const labelSpacing = 10;
const mapColours = {zero: "#fff", missing: "#aab8c0", excluded: "url(#small-area)"};
const paddingRatio = 0.045;
const zoomStep = 1.5;
const wheelSensitivity = 120;
const wheelLinePixels = 16;
const mapMovePixels = 4;
const panFraction = 0.25;
const mapRateFormat = new Intl.NumberFormat("en-AU", {maximumFractionDigits: 1, useGrouping: false});

function crimeBreaks(rows, key) {
  const rates = rows.map(row => row[key][1]).filter(rate => rate > 0).sort((a, b) => a - b);
  return ratePercentiles.map(percentile => Number(mapRateFormat.format(rates[Math.ceil(percentile * rates.length) - 1])));
}

function crimeColour(rate, limits, excluded) {
  if (excluded) return mapColours.excluded;
  if (rate === null) return mapColours.missing;
  if (rate === 0) return mapColours.zero;
  const displayed = Number(mapRateFormat.format(rate));
  return colourSteps[limits.filter(limit => displayed > limit).length];
}

function paddedExtent(boxes) {
  const minX = Math.min(...boxes.map(box => box[0]));
  const minY = Math.min(...boxes.map(box => box[1]));
  const width = Math.max(...boxes.map(box => box[2])) - minX;
  const height = Math.max(...boxes.map(box => box[3])) - minY;
  const pad = Math.max(width, height) * paddingRatio;
  return [minX - pad, minY - pad, width + 2 * pad, height + 2 * pad];
}

function zoomAt(box, factor, anchor) {
  const [x, y, width, height] = box;
  const [anchorX, anchorY] = anchor;
  return [anchorX + (x - anchorX) / factor, anchorY + (y - anchorY) / factor,
    width / factor, height / factor];
}

function centeredZoom(box, factor) {
  const [x, y, width, height] = box;
  return zoomAt(box, factor, [x + width / 2, y + height / 2]);
}

function wheelZoomFactor(pixels) {
  return Math.exp(-pixels / (wheelSensitivity + Math.abs(pixels)));
}

function extentScale(box, width, height) {
  return Math.min(width / box[2], height / box[3]);
}

function minimumMapZoom(box, full, width, height) {
  return extentScale(box, width, height) < extentScale(full, width, height) ? full : box;
}

function overviewLabels(map) {
  const {svg, box, full} = map;
  const width = svg.clientWidth;
  const height = svg.clientHeight;
  if (!width || !height) return;
  const scale = extentScale(box, width, height);
  map.labels.hidden = scale / extentScale(full, width, height) >= overviewLabelMaxZoom;
  map.labels.style.display = map.labels.hidden ? "none" : "";
  if (map.labels.hidden) return;
  const placed = [];
  for (const label of map.labels.children) {
    const x = Number(label.getAttribute("x")) * scale;
    const y = Number(label.getAttribute("y")) * scale;
    const half = label.textContent.length * labelCharacterWidth / 2;
    const overlaps = placed.some(other =>
      Math.abs(x - other.x) < half + other.half + labelSpacing &&
      Math.abs(y - other.y) < labelPixels + labelSpacing);
    label.style.display = overlaps ? "none" : "";
    label.setAttribute("font-size", labelPixels / scale);
    if (!overlaps) placed.push({x, y, half});
  }
}

function addMapLandmarks(map) {
  for (const code of landmarkCodes) {
    const [x1, y1, x2, y2] = map.shapes[code][1];
    const label = document.createElementNS(svgNamespace, "text");
    label.setAttribute("x", (x1 + x2) / 2);
    label.setAttribute("y", (y1 + y2) / 2);
    label.textContent = map.byCode.get(code).source;
    map.labels.append(label);
  }
}

function configurePointerZoom(map, update) {
  const {svg} = map;
  const zoom = (event, factor) => {
    const point = new DOMPoint(event.clientX, event.clientY)
      .matrixTransform(svg.getScreenCTM().inverse());
    update(zoomAt(map.box, factor, [point.x, point.y]));
  };
  svg.addEventListener("wheel", event => {
    const mode = event.deltaMode;
    if (event.deltaY === 0 || event.ctrlKey || event.metaKey || !svg.contains(document.activeElement) ||
        (event.deltaY > 0 && map.box === map.full)) return;
    event.preventDefault();
    const pixelsPerUnit = [1, wheelLinePixels, svg.clientHeight][mode];
    zoom(event, wheelZoomFactor(event.deltaY * pixelsPerUnit));
  }, {passive: false});
  svg.addEventListener("dblclick", event => {
    event.preventDefault();
    zoom(event, event.shiftKey ? 1 / zoomStep : zoomStep);
  });
}

function addLegendItem(legend, label, fill) {
  const item = add(legend, "span", {className: "legend-item"});
  const swatch = add(item, "span", {className: "legend-swatch"});
  swatch.setAttribute("aria-hidden", "true");
  if (fill === mapColours.excluded) swatch.classList.add("excluded");
  else swatch.style.backgroundColor = fill;
  add(item, "span", {text: label});
}

function drawLegend(map) {
  const {legend, limits, minPopulation, metric} = map;
  const fragment = document.createDocumentFragment();
  add(fragment, "strong", {text: `${t(...metrics[metric])} · ${rateUnit()}`, className: "legend-heading"});
  const boundaryFormat = new Intl.NumberFormat("en-AU", {maximumFractionDigits: 1});
  const bounds = [0, ...limits[metric]].map(value => boundaryFormat.format(value));
  addLegendItem(fragment, "0", mapColours.zero);
  colourSteps.forEach((fill, index) => {
    const high = bounds[index + 1];
    const top = t("有正记录率地区的最高约 5%", "Top ~5% among suburbs with positive rates");
    const label = high === undefined ? `>${bounds[index]} · ${top}` : `>${bounds[index]} ${t("至", "to")} ${high}`;
    addLegendItem(fragment, label, fill);
  });
  addLegendItem(fragment, t("无案件率", "Rate unavailable"), mapColours.missing);
  if (minPopulation) addLegendItem(fragment, `${t("人口不足", "Population under")} ${formatted(minPopulation)}`, mapColours.excluded);
  legend.replaceChildren(fragment);
}

function mapPath(row, geometry, group) {
  const path = document.createElementNS(svgNamespace, "path");
  path.dataset.code = row.code;
  path.setAttribute("d", geometry[0]);
  path.setAttribute("role", "option");
  path.setAttribute("aria-label", row.name);
  path.setAttribute("aria-selected", "false");
  path.setAttribute("tabindex", "-1");
  const title = document.createElementNS(svgNamespace, "title");
  title.textContent = row.name;
  path.append(title);
  group.append(path);
  return path;
}

function describeArea(row, key, minPopulation) {
  if (!row) return t("点击地图或在搜索候选中定位地区。",
    "Select a suburb on the map or locate it from search.");
  const [count, rate, rank] = row[key];
  const status = (row.pop ?? 0) < minPopulation ? t(" · 低于当前人口门槛", " · Below population threshold") : "";
  const measure = t(...metrics[key]);
  const incidentLabel = t(`${formatted(count)} 件`, `${formatted(count)} ${count === 1 ? "incident" : "incidents"}`);
  const ranking = rank == null ? t("未排名", "Unranked") : rateRank(rank);
  return `${row.name} · ${t("普查人口", "Census population")} ${formatted(row.pop)} · ${measure} ${incidentLabel}` +
    ` · ${formatted(rate, decimals)} ${rateUnit()} · ${ranking}${status}`;
}

function configureMapActions(map, update) {
  const {svg, shapes} = map;
  document.getElementById("map-reset").onclick = () => update(map.full);
  document.getElementById("map-in").onclick = () => update(centeredZoom(map.box, zoomStep));
  document.getElementById("map-out").onclick = () => update(centeredZoom(map.box, 1 / zoomStep));
  document.getElementById("map-fit").onclick = () => {
    if (map.filtered.length) update(paddedExtent(map.filtered.map(row => shapes[row.code][1])));
  };
  for (const [id, x, y] of [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]]) {
    document.getElementById(`map-${id}`).onclick = () => {
      const [left, top, width, height] = map.box;
      update([left + x * width * panFraction, top + y * height * panFraction, width, height]);
    };
  }
  map.focusArea = code => {
    selectMapArea(map, code);
    update(paddedExtent([shapes[code][1]]));
    map.summary.focus();
  };
  configureMapGestures(map, update, code => {
    selectMapArea(map, code);
    map.paths.get(code).focus({preventScroll: true});
  });
  configurePointerZoom(map, update);
  configureMapKeyboard(map);
}

function selectMapArea(map, code) {
  const oldPath = map.paths.get(map.keyboardCode);
  if (oldPath) {
    oldPath.classList.remove("selected");
    oldPath.setAttribute("aria-selected", "false");
    oldPath.setAttribute("tabindex", "-1");
  }
  map.selected = code;
  map.keyboardCode = code || map.filtered[0]?.code;
  const activePath = map.paths.get(map.keyboardCode);
  if (activePath) {
    activePath.setAttribute("tabindex", "0");
    if (code) {
      activePath.classList.add("selected");
      activePath.setAttribute("aria-selected", "true");
    }
  }
  const row = map.byCode.get(code);
  map.summary.textContent = describeArea(row, map.metric, map.minPopulation);
  map.actions.replaceChildren();
  if (!row) return;
  const details = add(map.actions, "button", {text: t("查看详情", "View details"), className: "link suburb"});
  details.type = "button";
  details.onclick = () => map.showDetails(row);
  compareButton(map.actions, row, map.comparison);
}

async function loadMapShapes(rows) {
  const source = document.getElementById("map-shapes");
  let shapes;
  if (source.dataset.src) {
    const response = await fetch(source.dataset.src);
    if (!response.ok) throw new Error(`Map data request failed: HTTP ${response.status}`);
    shapes = await response.json();
  } else {
    shapes = JSON.parse(source.textContent);
  }
  for (const row of rows) {
    const shape = shapes[row.code];
    if (!Array.isArray(shape) || typeof shape[0] !== "string" || !Array.isArray(shape[1]) ||
        shape[1].length !== 4 || !shape[1].every(Number.isFinite)) {
      throw new Error(`Invalid map geometry for ${row.code}`);
    }
  }
  return shapes;
}

function initCrimeMap({rows, snapshot, view, shapes}) {
  const svg = document.getElementById("map-svg");
  const group = document.getElementById("map-areas");
  const map = {
    svg, shapes,
    labels: document.getElementById("map-landmarks"),
    comparison: view.comparison,
    showDetails: view.showDetails,
    summary: document.getElementById("map-summary"),
    actions: document.getElementById("map-summary-actions"),
    legend: document.getElementById("map-legend"),
    paths: new Map(rows.map(row => [row.code, mapPath(row, shapes[row.code], group)])),
    byCode: new Map(rows.map(row => [row.code, row])),
    limits: Object.fromEntries(Object.keys(metrics).map(key => [key, crimeBreaks(rows, key)])),
    full: paddedExtent(Object.values(shapes).map(shape => shape[1])),
    selected: snapshot.pin,
  };
  addMapLandmarks(map);
  const update = box => {
    map.box = minimumMapZoom(box, map.full, svg.clientWidth, svg.clientHeight);
    svg.setAttribute("viewBox", map.box.join(" "));
    document.getElementById("map-out").disabled = map.box === map.full;
    overviewLabels(map);
  };
  update(snapshot.box ?? map.full);
  new ResizeObserver(() => overviewLabels(map)).observe(svg);
  configureMapActions(map, update);
  return map;
}

function renderCrimeMap({map, rows, filtered, metric, minPopulation}) {
  const {limits, paths} = map;
  const current = limits[metric];
  map.metric = metric;
  map.minPopulation = minPopulation;
  map.filtered = filtered;
  const filteredCodes = new Set(filtered.map(row => row.code));
  for (const row of rows) {
    const path = paths.get(row.code);
    const excluded = (row.pop ?? 0) < minPopulation;
    path.setAttribute("fill", crimeColour(row[metric][1], current, excluded));
    path.classList.toggle("outside-filter", !excluded && !filteredCodes.has(row.code));
  }
  drawLegend(map);
  selectMapArea(map, map.selected);
  document.getElementById("map-fit").disabled = filtered.length === 0;
}
