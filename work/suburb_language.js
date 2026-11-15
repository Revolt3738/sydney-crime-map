let pageLanguage = "zh";
const siteOrigin = "https://sydcrime.xdxo.top";
const pageDescriptions = __SUBURB_DESCRIPTIONS__;

function t(chinese, english) {
  return pageLanguage === "en" ? english : chinese;
}

function offenceLabel(offence) {
  return t(chineseDataLabels.offences[offence], offence);
}

function regionLabel(region) {
  return t(chineseDataLabels.regions[region], region);
}

function languageText(nodes, translations, reverse) {
  const pairs = [];
  for (const node of nodes) {
    const match = node.data.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const [, before, value, after] = match;
    const chinese = Object.hasOwn(translations, value) ? value : reverse.get(value);
    if (chinese) pairs.push([node, before + chinese + after, before + translations[chinese] + after]);
  }
  return pairs;
}

function languageLabels(translations, reverse) {
  return Array.from(document.querySelectorAll("[aria-label]"), node => {
    const value = node.getAttribute("aria-label");
    const chinese = Object.hasOwn(translations, value) ? value : reverse.get(value);
    return [node, chinese, translations[chinese]];
  }).filter(([, chinese]) => chinese);
}

function syncLanguageMetadata() {
  const pathname = t("/", "/en/");
  document.querySelector('link[rel="canonical"]').href = siteOrigin + pathname;
  document.querySelector('meta[name="description"]').content = pageDescriptions[pageLanguage];
  for (const link of document.querySelectorAll("[data-suburb-link]")) {
    link.href = `${pathname}suburbs/${link.dataset.suburbLink}/`;
  }
  if (window.location.protocol !== "file:") {
    const url = new URL(window.location.href);
    url.pathname = pathname;
    url.searchParams.delete("lang");
    window.history.replaceState(null, "", url);
  }
}

function configureLanguage(render) {
  const translations = JSON.parse(document.getElementById("english-copy").textContent);
  const reverse = new Map(Object.entries(translations).map(([chinese, english]) => [english, chinese]));
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const text = languageText(nodes, translations, reverse);
  const labels = languageLabels(translations, reverse);
  const buttons = document.querySelectorAll("[data-language]");
  for (const button of buttons) {
    button.onclick = event => {
      event.preventDefault();
      if (pageLanguage === button.dataset.language) return;
      pageLanguage = button.dataset.language;
      document.documentElement.lang = t("zh-Hans", "en-AU");
      for (const [node, chinese, english] of text) node.data = t(chinese, english);
      for (const [node, chinese, english] of labels) node.setAttribute("aria-label", t(chinese, english));
      for (const item of buttons) {
        if (item === button) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      }
      syncLanguageMetadata();
      render();
    };
  }
}
