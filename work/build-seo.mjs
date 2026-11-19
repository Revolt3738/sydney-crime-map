import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {makeEnglishHome, ORIGIN} from "./seo-home.mjs";
import {suburbPage} from "./seo-pages.mjs";
import {selectPlaces} from "./seo-places.mjs";
import {periodCopy, translatePeriod} from "./period-copy.mjs";
import {readSnapshot} from "./snapshot.mjs";

const work = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(work, "../outputs/sydney-crime-seo");
const read = name => fs.readFile(path.join(work, name), "utf8");
const [rawLabels, rawEnglish, rawDescriptions, css, faviconBytes, home] = await Promise.all([
  read("suburb_chinese_labels.json"), read("suburb_english.json"),
  read("seo-descriptions.json"), read("seo-pages.css"), fs.readFile(path.join(work, "suburb_favicon_user.png")),
  fs.readFile(path.resolve(work, "../outputs/大悉尼及中央海岸_Suburb犯罪查询.html"), "utf8"),
]);
const [raw, rawPeriod] = await readSnapshot(new URL("./", import.meta.url));
const data = JSON.parse(raw);
const labels = JSON.parse(rawLabels);
const period = JSON.parse(rawPeriod);
const dates = periodCopy(period);
const translations = translatePeriod(JSON.parse(rawEnglish), dates);
const descriptions = translatePeriod(JSON.parse(rawDescriptions), dates);
const places = selectPlaces(data.rows).all;
const favicon = faviconBytes.toString("base64");
const embeddedData = home.match(/<script type="application\/json" id="dataset">([^]*?)<\/script>/);
assert.ok(embeddedData, "Standalone home page does not contain crime data");
assert.deepEqual(JSON.parse(embeddedData[1]), data, "Crime data changed since the home page was built");
assert.ok(home.includes(dates.zh), "Crime data period changed since the home page was built");
const schema = JSON.parse(home.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
assert.equal(schema["@type"], "WebSite");
assert.equal(schema.url, `${ORIGIN}/`);
const shapeElement = /<script type="application\/json" id="map-shapes">([^]*?)<\/script>/;
const shapeMatch = home.match(shapeElement);
assert.ok(shapeMatch, "Map geometry is missing from the standalone home page");
const webHome = home.replace(shapeElement, '<script type="application/json" id="map-shapes" data-src="/map-shapes.json"></script>');
const englishHome = makeEnglishHome(webHome, translations, descriptions);
const chineseHome = webHome.replace(`<link rel="canonical" href="${ORIGIN}/">`, `<link rel="canonical" href="${ORIGIN}/zh/">`);
const assets = new Map([["index.html", englishHome], ["zh/index.html", chineseHome]]);

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
assert.equal(urls.length, 2 + places.length * 2);
assert.equal(new Set(urls).size, urls.length);
assert.equal(data.rows.length, 926);
assert.equal(Object.keys(data.labels).length, 62);
assert.doesNotMatch([...assets.values()].join("\n"), /(?:href|src)="[^"]+\.(?:csv|xlsx|zip)(?:[?#"][^\s]*)/i);

assets.set("en/index.html", await read("seo-legacy-home.html"));
assets.set("map-shapes.json", shapeMatch[1]);
await fs.mkdir(target, {recursive: true});
for (const [name, contents] of assets) {
  const destination = path.join(target, ...name.split("/"));
  await fs.mkdir(path.dirname(destination), {recursive: true});
  await fs.writeFile(destination, contents, "utf8");
}
await fs.writeFile(path.resolve(work, "../outputs/index.html"), makeEnglishHome(home, translations, descriptions), "utf8");
console.log(`Generated ${assets.size} assets, including ${urls.length} indexable bilingual pages.`);
console.log(`Deployment directory: ${target}`);
