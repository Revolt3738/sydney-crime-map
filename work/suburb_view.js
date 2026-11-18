const metrics = {
  non_dv: ["非家暴袭击", "Non-domestic assault"],
  burglary: ["住宅入室盗窃", "Residential break-ins"],
  assault: ["袭击合计", "Total assault"],
  violent: ["暴力犯罪", "Violent crime"],
};
const tableColumns = 2 + Object.keys(metrics).length;
const smallPopulation = 2000;
const rowsPerBatch = 50;
const integers = new Intl.NumberFormat("en-AU");
const decimals = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 1, maximumFractionDigits: 1,
});
const names = new Intl.Collator("en-AU");
const absent = "—";

function formatted(value, formatter = integers) {
  return value == null ? absent : formatter.format(value);
}

function filterRows(rows, query, region, minPopulation = 0) {
  const terms = query.toLowerCase().split(/[,，]/).map(term => term.trim()).filter(Boolean);
  return rows.filter(row =>
    ((row.pop ?? 0) >= minPopulation || terms.some(term => exactSuburb(row, term))) &&
    (!region || row.region === region) &&
    (!terms.length || terms.some(term => suburbMatches(row, term))),
  );
}

function compareOptional(first, second, sign) {
  if (first == null) return second == null ? 0 : 1;
  if (second == null) return -1;
  return sign * (first - second);
}

function sortedRows(rows, metric, order) {
  const index = order === "countHigh" ? 0 : 1;
  const direction = order === "rateLow" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const byMetric = order === "name" ? 0 : compareOptional(a[metric][index], b[metric][index], direction);
    return byMetric || names.compare(a.name, b.name);
  });
}

function add(parent, tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function rateRank(rank) {
  return t(`大悉尼及中央海岸记录率第 ${formatted(rank)}`, `Rate rank ${formatted(rank)} in Greater Sydney and Central Coast`);
}

function rateUnit() {
  return t("件 / 10 万居民", "incidents per 100,000 residents");
}

function addMetric(tr, row, key, activeMetric) {
  const [count, rate, rank] = row[key];
  const cell = add(tr, "td", undefined, key === activeMetric ? "active" : undefined);
  cell.setAttribute("role", "cell");
  add(cell, "span", t(...metrics[key]), "metric-label").setAttribute("aria-hidden", "true");
  add(cell, "span", formatted(rate, decimals), "metric");
  if (rate != null) add(cell, "span", rateUnit(), "mobile-unit");
  const countLabel = count == null ? t("无匹配记录", "No matched records") :
    t(`${formatted(count)} 件`, `${formatted(count)} ${count === 1 ? "incident" : "incidents"}`);
  const rankLabel = rank == null ? t("未排名", "Unranked") : rateRank(rank);
  add(cell, "span", `${countLabel} · ${rankLabel}`, "cell-note");
}

function addRow(fragment, row, view) {
  const tr = add(fragment, "tr");
  tr.setAttribute("role", "row");
  const place = add(tr, "td", undefined, "place");
  place.setAttribute("role", "cell");
  const button = add(place, "button", row.name, "link suburb");
  button.type = "button";
  button.dataset.suburb = row.code;
  button.setAttribute("aria-expanded", "false");
  add(place, "span", regionLabel(row.region), "area");
  compareButton(place, row, view.comparison);
  const pop = add(tr, "td", undefined, "population");
  pop.setAttribute("role", "cell");
  add(pop, "span", t("普查人口", "Census population"), "metric-label").setAttribute("aria-hidden", "true");
  add(pop, "span", formatted(row.pop), "metric");
  if (row.pop > 0 && row.pop < smallPopulation) add(pop, "span", t("小人口", "Small population"), "cell-note small-pop");
  if (row.pop === 0) add(pop, "span", t("无正人口分母", "Zero Census population"), "cell-note");
  for (const key of Object.keys(metrics)) addMetric(tr, row, key, view.metric.value);
}

function addEmpty(fragment) {
  const message = add(add(fragment, "tr"), "td", t("未找到匹配的 suburb。请检查拼写或切换至全部区域。",
    "No matching suburbs. Check the spelling or select All areas."), "empty");
  message.colSpan = tableColumns;
}

function renderResults(filtered, view) {
  const ordered = sortedRows(filtered, view.metric.value, view.order.value);
  const more = view["load-more"];
  let visible = 0;
  const appendBatch = () => {
    const fragment = document.createDocumentFragment();
    for (const row of ordered.slice(visible, visible + rowsPerBatch)) addRow(fragment, row, view);
    if (!ordered.length) addEmpty(fragment);
    view.results.append(fragment);
    visible += rowsPerBatch;
    more.hidden = visible >= ordered.length;
  };
  view.results.replaceChildren();
  more.onclick = appendBatch;
  appendBatch();
  for (const th of document.querySelectorAll("[data-column]")) {
    th.classList.toggle("active", th.dataset.column === view.metric.value);
  }
}

function configureRegion(rows, select) {
  const regions = new Set(rows.map(row => row.region));
  for (const region of Array.from(regions).sort(names.compare)) {
    add(select, "option", regionLabel(region)).value = region;
  }
}

function configureControls(view, render, resetComparison) {
  view.search.addEventListener("input", () => {
    view.lookup = undefined;
    render();
  });
  for (const key of ["region", "metric", "population", "order"]) view[key].addEventListener("change", render);
  view.reset.addEventListener("click", () => {
    view.search.value = "";
    view.region.selectedIndex = 0;
    view.metric.selectedIndex = 0;
    view.population.value = String(smallPopulation);
    view.order.selectedIndex = 0;
    view.lookup = undefined;
    resetComparison();
    render();
    view.search.focus();
  });
  for (const button of document.querySelectorAll("[data-metric]")) {
    button.addEventListener("click", () => {
      view.metric.value = button.dataset.metric;
      view.order.value = "rateHigh";
      render();
      view.metric.focus();
    });
  }
}

function updateRegionLabels(view) {
  for (const option of view.region.options) {
    if (option.value) option.textContent = regionLabel(option.value);
  }
}

function setupViews(rows, view, params) {
  const switches = document.querySelectorAll("[data-view]");
  const panels = Object.fromEntries(["list", "map"].map(key => [key, document.getElementById(`${key}-view`)]));
  const render = () => {
    const minimum = Number(view.population.value);
    const filtered = filterRows(rows, view.search.value, view.region.value, minimum);
    const total = `${formatted(filtered.length)} / ${formatted(rows.length)}`;
    view.result.textContent = t(`符合条件 ${total} 个 suburb`, `${total} suburbs match`);
    if (view.display === "list") renderResults(filtered, view);
    else {
      view.map ??= initCrimeMap(rows, mapSnapshot(params, rows), view);
      renderCrimeMap(view.map, rows, filtered, view.metric.value, minimum);
    }
  };
  const setDisplay = display => {
    view.display = display;
    for (const item of switches) item.setAttribute("aria-pressed", String(item.dataset.view === display));
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== display;
    view.order.disabled = display === "map";
  };
  for (const button of switches) {
    button.onclick = () => {
      setDisplay(button.dataset.view);
      view.render();
    };
  }
  setDisplay(params.get("view") === "map" ? "map" : "list");
  return render;
}

function configureViewLanguage(view, rows, byCode) {
  const ranked = rows.filter(row => row.violent[2] !== null).length;
  const renderCoverage = () => {
    view.coverage.textContent = t(`${formatted(rows.length)} 个 suburb · ${formatted(ranked)} 个可排名`,
      `${formatted(rows.length)} suburbs · ${formatted(ranked)} ranked`);
  };
  configureLanguage(() => {
    const expanded = Array.from(view.results.querySelectorAll('[aria-expanded="true"]'),
      button => button.dataset.suburb);
    renderCoverage();
    view.render();
    for (const code of expanded) {
      const button = view.results.querySelector(`[data-suburb="${code}"]`);
      if (button?.getAttribute("aria-expanded") === "false") toggleDetail(button, byCode.get(code), view);
    }
  });
  renderCoverage();
}

function start(data) {
  pageLanguage = document.documentElement.lang === "en-AU" ? "en" : "zh";
  const ids = ["coverage", "search", "region", "metric", "population", "order", "results", "result",
    "reset", "load-more", "suggestions", "lookup-detail"];
  const view = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const {rows, labels} = data;
  view.labels = labels;
  const byCode = new Map(rows.map(row => [row.code, row]));
  configureRegion(rows, view.region);
  const params = new URLSearchParams(window.location.search);
  restoreQuery(view, params);
  view.comparison = configureComparison(rows, view, params);
  const renderView = setupViews(rows, view, params);
  view.showDetails = row => {
    view.lookup = row;
    renderLookup(view).focus();
  };
  view.showArea = row => {
    if (view.display === "map") {
      view.map.focusArea(row.code);
      return;
    }
    view.showDetails(row);
  };
  const render = () => {
    updateRegionLabels(view);
    showSuggestions(view.suggestions, rows, view);
    renderView();
    renderLookup(view);
    view.comparison.render();
  };
  view.render = render;
  configureControls(view, render, view.comparison.reset);
  configureViewLanguage(view, rows, byCode);
  view.results.addEventListener("click", event => {
    const trigger = event.target.closest("button[data-suburb]");
    if (trigger) toggleDetail(trigger, byCode.get(trigger.dataset.suburb), view);
  });
  render();
  if (params.get("lang") === "en") document.querySelector('[data-language="en"]').click();
}

start(JSON.parse(document.getElementById("dataset").textContent));
