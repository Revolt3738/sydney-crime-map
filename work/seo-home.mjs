import assert from "node:assert/strict";

export const ORIGIN = "https://sydcrime.xdxo.top";

function translateText(text, translations) {
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const [, before, value, after] = match;
  return Object.hasOwn(translations, value) ? before + translations[value] + after : text;
}

function translateTag(tag, translations) {
  return tag.replace(/aria-label="([^"]+)"/g, (full, label) =>
    Object.hasOwn(translations, label) ? `aria-label="${translations[label]}"` : full);
}

export function makeEnglishHome(chineseHome, translations, descriptions) {
  assert.equal(chineseHome.split(descriptions.zh).length - 1, 2);
  let html = chineseHome.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>|[^<]+/gi, token => {
    if (/^<(?:script|style)\b/i.test(token)) return token;
    if (token.startsWith("<")) return translateTag(token, translations);
    return translateText(token, translations);
  });
  html = html.replace('<html lang="zh-Hans">', '<html lang="en-AU">');
  html = html.replace(`<meta name="description" content="${descriptions.zh}">`, `<meta name="description" content="${descriptions.en}">`);
  html = html.replace('data-language="zh" lang="zh-Hans" aria-current="page"', 'data-language="zh" lang="zh-Hans"');
  html = html.replace('data-language="en" lang="en-AU"', 'data-language="en" lang="en-AU" aria-current="page"');
  html = html.replaceAll('href="/suburbs/', 'href="/en/suburbs/');
  assert.match(html, /<h1>Sydney and Central Coast Crime Rates<\/h1>/);
  assert.match(html, /data-language="en" lang="en-AU" aria-current="page"/);
  return html;
}
