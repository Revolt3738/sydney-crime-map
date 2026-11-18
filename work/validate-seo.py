from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree
from calendar import month_name
import json
import re

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "outputs" / "sydney-crime-seo"
ORIGIN = "https://sydcrime.xdxo.top"
DATA = json.loads((ROOT / "work" / "crime_data.json").read_text(encoding="utf-8"))
LABELS = json.loads((ROOT / "work" / "suburb_chinese_labels.json").read_text(encoding="utf-8"))
PERIOD = json.loads((ROOT / "work" / "crime_period.json").read_text(encoding="utf-8"))
LEADERS = (
    ("blacktown", "Blacktown", 50961), ("castle-hill", "Castle Hill", 40874),
    ("auburn", "Auburn", 39333), ("baulkham-hills", "Baulkham Hills", 37415),
    ("bankstown", "Bankstown", 34933), ("merrylands", "Merrylands", 32472),
    ("ryde", "Ryde", 31907), ("hurstville", "Hurstville", 31162),
    ("liverpool", "Liverpool", 31078), ("maroubra", "Maroubra", 30722),
)
EXTRAS = (("chatswood", "Chatswood"), ("kingsford", "Kingsford"), ("gosford", "Gosford"))
PLACES = {slug: name for slug, name, _ in LEADERS} | dict(EXTRAS)
KEYS = ("non_dv", "burglary", "assault", "violent")


class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.headings, self.visible, self.rows, self.offences = [], [], [], [], []
        self.skip = 0
        self.lang = ""
        self.in_heading = False
        self.in_body = False
        self.current_row = None
        self.current_cell = None
        self.offence = None
        self.in_list = False
        self.canonical = []
        self.alternates = {}
        self.in_title = False
        self.title = ""
        self.description = ""
        self.in_population_list = False
        self.population_entries = []
        self.current_population_entry = None

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if tag == "html":
            self.lang = attr.get("lang", "")
        if tag == "title":
            self.in_title = True
        if tag == "meta" and attr.get("name") == "description":
            self.description = attr.get("content", "")
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "a":
            self.links.append(attr.get("href", ""))
        if tag == "link" and attr.get("rel") == "canonical":
            self.canonical.append(attr.get("href"))
        if tag == "link" and attr.get("rel") == "alternate":
            self.alternates[attr.get("hreflang")] = attr.get("href")
        if tag == "h1":
            self.in_heading = True
        if tag == "tbody":
            self.in_body = True
        if tag == "tr" and self.in_body:
            self.current_row = []
        if tag in ("th", "td") and self.current_row is not None:
            self.current_cell = ""
        if tag == "dl":
            self.in_list = True
        if tag == "ol":
            self.in_population_list = True
        if tag == "li" and self.in_population_list:
            self.current_population_entry = ""
        if tag in ("dt", "dd") and self.in_list:
            self.offence = ""

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1
        if tag == "h1":
            self.in_heading = False
        if tag == "title":
            self.in_title = False
        if tag in ("th", "td") and self.current_cell is not None:
            self.current_row.append(self.current_cell.strip())
            self.current_cell = None
        if tag == "tr" and self.current_row is not None:
            self.rows.append(self.current_row)
            self.current_row = None
        if tag == "tbody":
            self.in_body = False
        if tag in ("dt", "dd") and self.offence is not None:
            self.offences.append(self.offence.strip())
            self.offence = None
        if tag == "dl":
            self.in_list = False
        if tag == "li" and self.current_population_entry is not None:
            self.population_entries.append(self.current_population_entry.strip())
            self.current_population_entry = None
        if tag == "ol":
            self.in_population_list = False

    def handle_data(self, value):
        if not self.skip:
            self.visible.append(value.strip())
        if self.in_heading:
            self.headings.append(value.strip())
        if self.in_title:
            self.title += value
        if self.current_cell is not None:
            self.current_cell += value
        if self.offence is not None:
            self.offence += value
        if self.current_population_entry is not None:
            self.current_population_entry += value


def document(relative):
    result = Document()
    result.feed((SITE / relative).read_text(encoding="utf-8"))
    return result


def verify_internal_links(doc):
    for link in doc.links:
        parsed = urlsplit(link)
        assert not re.search(r"\.(?:csv|xlsx|zip)$", parsed.path, re.I), link
        if parsed.netloc or not parsed.path.startswith("/"):
            continue
        target = SITE / parsed.path.lstrip("/")
        if parsed.path.endswith("/"):
            target /= "index.html"
        assert target.is_file(), f"Broken internal link: {link}"


def verify_metadata(doc, relative):
    current = "/" if relative == "index.html" else "/" + relative.removesuffix("index.html")
    home = current in ("/", "/zh/", "/en/")
    zh = "/zh/" if home else (current.removeprefix("/en") if current.startswith("/en/") else current)
    en = "/" if home else "/en" + zh
    assert doc.canonical == [ORIGIN + current]
    assert doc.alternates == {"zh-Hans": ORIGIN + zh, "en": ORIGIN + en, "x-default": ORIGIN + ("/" if home else zh)}


def weighted_rate(key):
    rows = [row for row in DATA["rows"] if row[key][1] is not None and row["pop"] > 0]
    return sum(row[key][0] for row in rows) / sum(row["pop"] for row in rows) * 100_000


def expected_period(language):
    start_year, start_month = map(int, PERIOD["start"].split("-"))
    end_year, end_month = map(int, PERIOD["end"].split("-"))
    if language == "en":
        return f"{month_name[start_month]} {start_year} to {month_name[end_month]} {end_year}"
    return f"{start_year} 年 {start_month} 月至 {end_year} 年 {end_month} 月"


def verify_suburb(slug, name, language):
    prefix = "en/" if language == "en" else ""
    relative = f"{prefix}suburbs/{slug}/index.html"
    doc = document(relative)
    row = next(row for row in DATA["rows"] if row["source"] == name)
    assert doc.lang == ("en-AU" if language == "en" else "zh-Hans")
    assert name in doc.headings[0]
    assert (f"{name} Crime Rate" if language == "en" else f"{name} 犯罪率") in doc.title
    assert (f"{name} crime rates" if language == "en" else f"{name} 犯罪率") in doc.description
    assert expected_period(language) in " ".join(doc.visible)
    assert expected_period(language) in doc.description
    assert len(doc.rows) == 4 and len(doc.offences) == 124
    for index, key in enumerate(KEYS):
        cells = doc.rows[index]
        assert int(cells[1].replace(",", "")) == row[key][0]
        assert abs(float(cells[2].replace(",", "")) - row[key][1]) < 0.051
        assert abs(float(cells[3].replace(",", "")) - weighted_rate(key)) < 0.051
        assert int(cells[4].split(" /")[0].replace(",", "")) == row[key][2]
    for index, offence in enumerate(DATA["labels"]):
        label = offence if language == "en" else LABELS["offences"][offence]
        assert doc.offences[index * 2] == label
        assert int(doc.offences[index * 2 + 1].replace(",", "")) == row["counts"][offence]
    verify_internal_links(doc)
    verify_metadata(doc, relative)


def main():
    ranked = sorted(DATA["rows"], key=lambda row: -(row["pop"] or 0))[:len(LEADERS)]
    assert [(row["source"], row["pop"]) for row in ranked] == [(name, population) for _, name, population in LEADERS]
    root = ElementTree.parse(SITE / "sitemap.xml").getroot()
    urls = [element.text for element in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert len(urls) == len(set(urls)) == 3 + 2 * len(PLACES)
    expected_files = {urlsplit(url).path.lstrip("/") + "index.html" for url in urls} | {"sitemap.xml"}
    assert {path.relative_to(SITE).as_posix() for path in SITE.rglob("*") if path.is_file()} == expected_files
    for url in urls:
        assert url.startswith(ORIGIN + "/")
        assert (SITE / urlsplit(url).path.lstrip("/") / "index.html").is_file()
    for relative, expected in (("index.html", "en-AU"), ("zh/index.html", "zh-Hans"), ("en/index.html", "en-AU")):
        doc = document(relative)
        assert doc.lang == expected and len(doc.headings) == 1
        assert doc.population_entries == [f"{name} {population:,}" for _, name, population in LEADERS]
        keyword = "Sydney Crime Rates by Suburb" if expected == "en-AU" else "悉尼犯罪率"
        assert keyword in doc.title
        assert ("Sydney crime rates by suburb" if expected == "en-AU" else "悉尼犯罪率") in doc.description
        assert expected_period("en" if expected == "en-AU" else "zh") in " ".join(doc.visible)
        verify_internal_links(doc)
        verify_metadata(doc, relative)
        if expected == "en-AU":
            assert not [item for item in doc.visible if re.search(r"[\u4e00-\u9fff]", item) and item != "中文"]
    for slug, name in PLACES.items():
        for language in ("zh", "en"):
            verify_suburb(slug, name, language)
    print(f"Validated top 10 population entries, sitemap, bilingual links and all 62 categories on {2 * len(PLACES)} suburb pages.")


if __name__ == "__main__":
    main()
