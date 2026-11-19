const maxComparison = 4;
const suggestionLimit = 8;
const rateDenominator = 100_000;

function suburbMatches(row, term) {
  return row.name.toLowerCase().includes(term) || row.source?.toLowerCase() === term;
}

function exactSuburb(row, term) {
  return row.name.toLowerCase() === term || row.source?.toLowerCase() === term;
}

function suggestionRelevance(row, term) {
  if (exactSuburb(row, term)) return 0;
  const name = row.name.toLowerCase();
  if (name.startsWith(term)) return 1;
  for (let index = name.indexOf(term); index > 0; index = name.indexOf(term, index + 1)) {
    if (/[^\p{L}\p{N}]/u.test(name[index - 1])) return 2;
  }
  return 3;
}

function rateBaseline(rows, key) {
  let cases = 0;
  let population = 0;
  for (const row of rows) {
    if (row[key][1] == null || !(row.pop > 0)) continue;
    cases += row[key][0];
    population += row.pop;
  }
  return cases / population * rateDenominator;
}

function matchingSuggestions(rows, query) {
  const term = query.trim().toLowerCase();
  if (!term || /[,，]/.test(term)) return [];
  return rows.filter(row => suburbMatches(row, term))
    .sort((a, b) => suggestionRelevance(a, term) - suggestionRelevance(b, term) || names.compare(a.name, b.name))
    .slice(0, suggestionLimit);
}

function renderCompareCard(container, row, {key, baseline}) {
  const [count, rate, rank] = row[key];
  const card = add(container, "article");
  add(card, "h3", {text: row.name});
  add(card, "span", {text: `${t("普查人口", "Census population")} ${formatted(row.pop)}`, className: "cell-note"});
  if (row.pop < smallPopulation) add(card, "span", {text: t("小人口，记录率易波动", "Small population, rates can fluctuate"), className: "cell-note small-pop"});
  add(card, "p", {text: `${t(...metrics[key])} · ${formatted(count)} ${t("件", count === 1 ? "incident" : "incidents")}`});
  add(card, "strong", {text: `${formatted(rate, decimals)} ${rateUnit()}`});
  if (rate != null) add(card, "span", {text: t(`基准的 ${formatted(rate / baseline, decimals)} 倍`,
    `${formatted(rate / baseline, decimals)}× benchmark`), className: "cell-note"});
  if (rank != null) add(card, "span", {text: rateRank(rank), className: "cell-note"});
}

function mapSnapshot(params, rows) {
  const box = params.get("box")?.split(",").map(Number);
  const validBox = box?.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
  const pin = params.get("pin");
  return {box: validBox ? box : undefined, pin: rows.some(row => row.code === pin) ? pin : ""};
}

function restoreQuery(view, params) {
  view.search.value = params.get("q") ?? "";
  for (const [param, id] of Object.entries({area:"region", metric:"metric", pop:"population", sort:"order"})) {
    const value = params.get(param);
    if (Array.from(view[id].options).some(option => option.value === value)) view[id].value = value;
  }
}

function comparisonSelection(params, byCode) {
  let selected = [...new Set((params.get("suburbs") ?? "").split(","))]
    .filter(code => byCode.has(code)).slice(0, maxComparison);
  const has = code => selected.includes(code);
  const full = () => selected.length >= maxComparison;
  return {
    values: () => selected,
    has, full,
    add(code) {
      if (!byCode.has(code) || full() || has(code)) return;
      selected = [...selected, code];
    },
    remove: code => { selected = selected.filter(value => value !== code); },
    reset: () => { selected = []; },
  };
}

function compareButton(container, row, comparison) {
  const button = add(container, "button", {text: "", className: "compare-add"});
  button.type = "button";
  button.dataset.compare = row.code;
  comparison.updateButton(button);
}

function showSuggestions(container, rows, view) {
  const fragment = document.createDocumentFragment();
  for (const row of matchingSuggestions(rows, view.search.value)) {
    const item = add(fragment, "div", {className: "suggestion-row"});
    const name = add(item, "div", {className: "suggestion-name"});
    add(name, "strong", {text: row.name});
    if ((row.pop ?? 0) < Number(view.population.value)) {
      add(name, "small", {text: t("低于人口门槛，仍可查看或对比", "Below population filter · available to view or compare"), className: "cell-note"});
    }
    if (view.region.value && row.region !== view.region.value) {
      add(name, "small", {text: t("不在所选统计区内", "Outside the selected statistical area"), className: "cell-note"});
    }
    const actions = add(item, "div", {className: "area-actions"});
    const inspect = add(actions, "button", {text: view.display === "map" ? t("地图定位", "Locate on map") :
      t("查看详情", "View details"), className: "link suburb"});
    inspect.type = "button";
    inspect.setAttribute("aria-label", `${inspect.textContent} · ${row.name}`);
    inspect.onclick = () => view.showArea(row);
    compareButton(actions, row, view.comparison);
  }
  container.replaceChildren(fragment);
}

function configureComparison(rows, view, params) {
  const byCode = new Map(rows.map(row => [row.code, row]));
  const selection = comparisonSelection(params, byCode);
  const baselines = Object.fromEntries(Object.keys(metrics).map(key => [key, rateBaseline(rows, key)]));
  const panel = document.getElementById("compare-panel");
  const count = document.getElementById("compare-count");
  const chips = document.getElementById("compare-chips");
  const cards = document.getElementById("compare-cards");
  const baselineLabel = document.getElementById("compare-baseline");

  const updateButton = button => {
    const row = byCode.get(button.dataset.compare);
    const included = selection.has(row.code);
    button.textContent = included ? t("已对比", "Added") : t("＋ 对比", "+ Compare");
    button.setAttribute("aria-disabled", String(included || selection.full()));
    button.setAttribute("aria-label", `${button.textContent} · ${row.name}`);
  };
  const render = () => {
    const selected = selection.values();
    panel.hidden = !selected.length;
    if (!selected.length) panel.open = false;
    const label = t(`对比 ${selected.length}/${maxComparison}`, `Compare ${selected.length}/${maxComparison}`);
    if (count.textContent !== label) count.textContent = label;
    chips.replaceChildren();
    cards.replaceChildren();
    const key = view.metric.value;
    const baseline = baselines[key];
    baselineLabel.textContent = t(
      `固定基准：${formatted(baseline, decimals)} ${rateUnit()}。以大悉尼及中央海岸榜单中有可用比率的地区计算：案件总数除以人口总数。筛选和选区不改变基准。`,
      `Fixed benchmark: ${formatted(baseline, decimals)} ${rateUnit()}. Total incidents divided by total population for suburbs with available rates across Greater Sydney and the Central Coast. Filters and selections leave it unchanged.`);
    for (const code of selected) {
      const row = byCode.get(code);
      const chip = add(chips, "button", {text: `${row.name} ×`});
      chip.setAttribute("aria-label", `${t("移除", "Remove")} ${row.name}`);
      chip.onclick = () => {
        selection.remove(code);
        render();
        (chips.querySelector("button") ?? view.search).focus();
      };
      renderCompareCard(cards, row, {key, baseline});
    }
    document.querySelectorAll("button[data-compare]").forEach(updateButton);
  };
  document.getElementById("explorer").addEventListener("click", event => {
    const trigger = event.target.closest("button[data-compare]");
    if (!trigger || trigger.getAttribute("aria-disabled") === "true") return;
    selection.add(trigger.dataset.compare);
    render();
  });
  return {render, updateButton, reset: selection.reset};
}
