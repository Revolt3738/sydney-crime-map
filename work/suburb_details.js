function detailSummary(row) {
  const share = new Intl.NumberFormat("en-AU", { style: "percent", maximumFractionDigits: 1 });
  const parts = [regionLabel(row.region), t("2021 年普查人口", "2021 Census population") + ` ${formatted(row.pop)}`];
  if (row.share < 0.99999) parts.push(t("位于大悉尼范围内的面积", "Area within Greater Sydney") + ` ${share.format(row.share)}`);
  if (!row.source) parts.push(t("未匹配到警方记录", "No matching police records"));
  return parts.join(" · ");
}

function fillAreaDetail(container, row, view) {
  const title = add(container, "h3", {text: `${row.name} · ${t("犯罪明细", "Offence details")}`});
  title.tabIndex = -1;
  add(container, "p", {text: detailSummary(row), className: "muted detail-meta"});
  compareButton(container, row, view.comparison);
  const list = add(container, "dl", {className: "detail-list"});
  for (const offence of Object.keys(view.labels)) {
    const item = add(list, "div");
    add(item, "dt", {text: offenceLabel(offence)});
    add(item, "dd", {text: formatted(row.counts[offence])});
  }
  add(container, "p", {text: t("* 谋杀和误杀按受害者人数统计，其余类别按警方记录的事件数统计。",
    "* Murder and manslaughter are counted by victim. Other categories count police-recorded incidents."), className: "cell-note"});
  return title;
}

function buildDetail(row, view) {
  const detail = document.createElement("tr");
  detail.className = "detail-row";
  detail.id = `detail-${row.code}`;
  detail.setAttribute("role", "row");
  const cell = add(detail, "td", {className: "detail-content"});
  cell.colSpan = tableColumns;
  cell.setAttribute("role", "cell");
  fillAreaDetail(cell, row, view);
  return detail;
}

function toggleDetail(trigger, row, view) {
  const expanded = trigger.getAttribute("aria-expanded") === "true";
  if (expanded) {
    document.getElementById(trigger.getAttribute("aria-controls")).remove();
    trigger.removeAttribute("aria-controls");
  } else {
    const detail = buildDetail(row, view);
    trigger.closest("tr").after(detail);
    trigger.setAttribute("aria-controls", detail.id);
  }
  trigger.setAttribute("aria-expanded", String(!expanded));
}

function renderLookup(view) {
  const container = view["lookup-detail"];
  container.replaceChildren();
  container.hidden = !view.lookup;
  if (!view.lookup) return;
  const close = add(container, "button", {text: t("收起详情", "Close details"), className: "secondary"});
  close.type = "button";
  close.onclick = () => {
    view.lookup = undefined;
    renderLookup(view);
    view.search.focus();
  };
  return fillAreaDetail(container, view.lookup, view);
}
