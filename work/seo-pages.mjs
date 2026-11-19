import assert from "node:assert/strict";
import {ORIGIN} from "./seo-home.mjs";
import {periodCopy} from "./period-copy.mjs";

const KEYS = ["non_dv", "burglary", "assault", "violent"];
const LABELS = {
  zh: ["非家暴袭击", "住宅入室盗窃", "袭击合计", "暴力犯罪"],
  en: ["Non-domestic assault", "Residential break-ins", "Total assault", "Violent crime"],
};
const TEXT = {
  zh: {
    title: "犯罪率与案件统计", home: "返回互动地图与完整排名", population: "2021 年普查人口",
    period: "警方记录案件", category: "类别", incidents: "案件数",
    rate: "每 10 万居民记录案件数", baseline: "大悉尼及中央海岸加权记录率", rank: "全区记录率排名",
    overview: "案件与记录率", detail: "62 类警方记录案件", sources: "口径与来源",
    note: "记录率使用 2021 年普查人口计算，并非个人遭遇犯罪的概率。人口变化、游客和商业活动可能影响比较；小人口地区的比率尤其容易波动。排名覆盖大悉尼及中央海岸全部可计算的 suburb，不随首页人口筛选改变。",
    methods: "案件由新州犯罪统计与研究局（BOCSAR）发布；人口来自澳大利亚统计局（ABS）2021 年人口普查。加权记录率以全区有记录率的 suburb 的案件总数除以对应人口总数计算。袭击合计包括家暴及非家暴袭击；暴力犯罪还包括袭警、性犯罪及抢劫等类别。袭击数据无法拆分受伤人数或伤势。",
    bocsar: "BOCSAR 犯罪数据页面", abs: "ABS 2021 年人口普查", compare: "在地图及排名中查看此地区",
  },
  en: {
    title: "Crime Rates and Statistics", home: "Interactive map and full rankings", population: "2021 Census population",
    period: "Police-recorded incidents", category: "Offence", incidents: "Incidents",
    rate: "Recorded incidents per 100,000 residents", baseline: "Greater Sydney and Central Coast weighted rate", rank: "Overall rate rank",
    overview: "Incidents and recorded rates", detail: "62 police-recorded offence categories", sources: "Methods and sources",
    note: "Rates use 2021 Census populations and are not an individual’s probability of experiencing crime. Population change, visitors and commercial activity can affect comparisons; rates for small populations are particularly volatile. Ranks include all suburbs with calculable rates across Greater Sydney and the Central Coast and do not change with the home page population filter.",
    methods: "Incident data were published by the NSW Bureau of Crime Statistics and Research (BOCSAR); populations are from the Australian Bureau of Statistics (ABS) 2021 Census. The weighted rate divides total incidents by total population across suburbs with calculable rates. Total assault includes domestic and non-domestic assault; violent crime also includes assaults on police, sexual offences and robbery. These assault data do not separate injuries or their severity.",
    bocsar: "BOCSAR crime data", abs: "ABS 2021 Census", compare: "Find this suburb on the map and in the rankings",
  },
};

const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const integer = value => new Intl.NumberFormat("en-AU").format(value);
const decimal = value => new Intl.NumberFormat("en-AU", {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(value);
const pathFor = (slug, lang) => `${lang === "en" ? "/en" : ""}/suburbs/${slug}/`;

function baseline(rows, key) {
  const available = rows.filter(row => row[key][1] !== null && row.pop > 0);
  return available.reduce((sum, row) => sum + row[key][0], 0) /
    available.reduce((sum, row) => sum + row.pop, 0) * 100_000;
}

function meta(row, place, {lang, dates}) {
  const en = lang === "en";
  const title = en ? `${row.source} Crime Rate and Statistics | Sydney Crime Map` : `${row.source} 犯罪率与统计｜悉尼犯罪地图`;
  const description = en
    ? `${row.source} crime rates: ${integer(row.non_dv[0])} non-domestic assaults and ${integer(row.burglary[0])} residential break-ins recorded ${dates.en}. Compare incident rates and population.`
    : `${row.source} 犯罪率与案件统计：${dates.zh}记录非家暴袭击 ${integer(row.non_dv[0])} 件、住宅入室盗窃 ${integer(row.burglary[0])} 件。查看人口及统计口径。`;
  const zhUrl = ORIGIN + pathFor(place.slug, "zh");
  const enUrl = ORIGIN + pathFor(place.slug, "en");
  const url = lang === "en" ? enUrl : zhUrl;
  return `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}"><link rel="alternate" hreflang="zh-Hans" href="${zhUrl}">
<link rel="alternate" hreflang="en" href="${enUrl}"><link rel="alternate" hreflang="x-default" href="${zhUrl}">`;
}

function overview(data, row, lang) {
  const text = TEXT[lang];
  const headings = [text.category, text.incidents, text.rate, text.baseline, text.rank];
  const head = headings.map(value => `<th scope="col">${escapeHtml(value)}</th>`).join("");
  const body = KEYS.map((key, index) => {
    const [count, rate, rank] = row[key];
    const ranked = data.rows.filter(candidate => candidate[key][1] !== null).length;
    const cells = [integer(count), decimal(rate), decimal(baseline(data.rows, key)), `${integer(rank)} / ${integer(ranked)}`];
    return `<tr><th scope="row">${LABELS[lang][index]}</th>${cells.map((value, cell) => `<td data-label="${escapeHtml(headings[cell + 1])}">${value}</td>`).join("")}</tr>`;
  }).join("");
  return `<section><h2>${text.overview}</h2><div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><p>${escapeHtml(text.note)}</p></section>`;
}

function offenceDetails(data, row, {lang, labels}) {
  const items = Object.keys(data.labels).map(offence => {
    assert.ok(Object.hasOwn(row.counts, offence));
    const label = lang === "en" ? offence : labels.offences[offence];
    return `<div><dt>${escapeHtml(label)}</dt><dd>${integer(row.counts[offence])}</dd></div>`;
  }).join("");
  return `<section><h2>${TEXT[lang].detail}</h2><dl>${items}</dl></section>`;
}

function navigation(place, lang) {
  const text = TEXT[lang];
  const home = lang === "en" ? "/" : "/zh/";
  return `<nav><a href="${home}">${text.home}</a><span class="languages"><a href="${pathFor(place.slug, "zh")}" lang="zh-Hans">中文</a> <a href="${pathFor(place.slug, "en")}" lang="en-AU">English</a></span></nav>`;
}

export function suburbPage({data, labels, place, lang, css, favicon, period}) {
  const row = data.rows.find(candidate => candidate.source === place.source);
  assert.ok(row && KEYS.every(key => row[key][1] !== null));
  const text = TEXT[lang];
  const dates = periodCopy(period);
  const periodLabel = `${text.period}${lang === "en" ? ": " : "："}${dates[lang]}`;
  const region = lang === "en" ? row.region : labels.regions[row.region];
  const home = lang === "en" ? "/" : "/zh/";
  const homeSearch = `${home}?q=${encodeURIComponent(place.source)}`;
  const body = `${navigation(place, lang)}<header><p class="kicker">${escapeHtml(region)}</p><h1>${escapeHtml(row.source)} · ${text.title}</h1><p>${escapeHtml(periodLabel)}</p><p>${text.population}：<strong>${integer(row.pop)}</strong></p><p><a class="action" href="${homeSearch}">${text.compare} →</a></p></header>${overview(data, row, lang)}${offenceDetails(data, row, {lang, labels})}<footer><h2>${text.sources}</h2><p>${text.methods}</p><p><a href="https://bocsar.nsw.gov.au/statistics-dashboards/open-datasets/criminal-offences-data.html">${text.bocsar}</a> · <a href="https://www.abs.gov.au/census/find-census-data/datapacks">${text.abs}</a></p></footer>`;
  return `<!doctype html><html lang="${lang === "en" ? "en-AU" : "zh-Hans"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${meta(row, place, {lang, dates})}<link rel="icon" type="image/png" href="data:image/png;base64,${favicon}"><style>${css}</style></head><body><main>${body}</main></body></html>`;
}
