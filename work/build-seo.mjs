import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {makeEnglishHome, ORIGIN} from "./seo-home.mjs";
import {suburbPage} from "./seo-pages.mjs";
import {selectPlaces} from "./seo-places.mjs";
import {periodCopy, translatePeriod} from "./period-copy.mjs";

const work = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(work, "../outputs/sydney-crime-seo");
const read = name => fs.readFile(path.join(work, name), "utf8");
const [raw, rawLabels, rawEnglish, rawDescriptions, rawPeriod, css, faviconBytes, home] = await Promise.all([
  read("crime_data.json"), read("suburb_chinese_labels.json"), read("suburb_english.json"),
  read("seo-descriptions.json"), read("crime_period.json"), read("seo-pages.css"), fs.readFile(path.join(work, "suburb_favicon_user.png")),
  fs.readFile(path.resolve(work, "../outputs/大悉尼及中央海岸_Suburb犯罪查询.html"), "utf8"),
]);
const data = JSON.parse(raw);
const labels = JSON.parse(rawLabels);
const period = JSON.parse(rawPeriod);
const dates = periodCopy(period);
const translations = translatePeriod(JSON.parse(rawEnglish), dates);
const descriptions = translatePeriod(JSON.parse(rawDescriptions), dates);
const places = selectPlaces(data.rows).all;
const favicon = faviconBytes.toString("base64");
const schema = JSON.parse(home.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
assert.equal(schema["@type"], "WebSite");
assert.equal(schema.url, `${ORIGIN}/`);
const englishHome = makeEnglishHome(home, translations, descriptions);
const chineseHome = home.replace(`<link rel="canonical" href="${ORIGIN}/">`, `<link rel="canonical" href="${ORIGIN}/zh/">`);
const assets = new Map([["index.html", englishHome], ["zh/index.html", chineseHome], ["en/index.html", englishHome.replace(`<link rel="canonical" href="${ORIGIN}/">`, `<link rel="canonical" href="${ORIGIN}/en/">`)]]);

for (const place of places) {
  for (const lang of ["zh", "en"]) {
    const prefix = lang === "en" ? "en/" : "";
    assets.set(`${prefix}suburbs/${place.slug}/index.html`, suburbPage({data, labels, place, lang, css, favicon, period}));
  }
}

const urls = [...assets.keys()].map(name => ORIGIN + (name === "index.html" ? "/" : `/${name.replace(/index\.html$/, "")}`));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
assets.set("sitemap.xml", sitemap);

for (const [name, html] of assets) {
  if (!name.endsWith(".html")) continue;
  const canonical = urls.find(url => name === "index.html" ? url === ORIGIN + "/" : url === ORIGIN + "/" + name.replace(/index\.html$/, ""));
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `Bad canonical: ${name}`);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /hreflang="zh-Hans"/);
  assert.match(html, /hreflang="en"/);
  assert.doesNotMatch(html, /__(?:SUBURB|CRIME)_[A-Z_]+__/);
}
assert.equal(urls.length, 3 + places.length * 2);
assert.equal(new Set(urls).size, urls.length);
assert.equal(data.rows.length, 926);
assert.equal(Object.keys(data.labels).length, 62);
assert.doesNotMatch([...assets.values()].join("\n"), /(?:href|src)="[^"]+\.(?:csv|xlsx|zip)(?:[?#"][^\s]*)/i);

await fs.mkdir(target, {recursive: true});
for (const [name, contents] of assets) {
  const destination = path.join(target, ...name.split("/"));
  await fs.mkdir(path.dirname(destination), {recursive: true});
  await fs.writeFile(destination, contents, "utf8");
}
await fs.writeFile(path.resolve(work, "../outputs/index.html"), englishHome, "utf8");
console.log(`Generated ${assets.size} assets, including ${urls.length} indexable bilingual pages.`);
console.log(`Deployment directory: ${target}`);
