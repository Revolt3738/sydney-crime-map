<p align="center">
  <img src="work/suburb_favicon_user.png" width="88" alt="Sydney Crime Map icon">
</p>

<h1 align="center">Sydney Crime Map</h1>

<p align="center">
  <strong>A clearer view of recorded crime across Greater Sydney and the Central Coast.</strong>
</p>

<p align="center">
  Search suburbs, explore the map and compare the numbers in context.
</p>

<p align="center">
  <a href="https://sydcrime.xdxo.top/"><strong>Explore the live site &rarr;</strong></a>
  &nbsp;&nbsp;&middot;&nbsp;&nbsp;
  <a href="#features">Features</a>
  &nbsp;&nbsp;&middot;&nbsp;&nbsp;
  <a href="#data-and-methodology">Data and methodology</a>
  &nbsp;&nbsp;&middot;&nbsp;&nbsp;
  <a href="#getting-started">Getting started</a>
</p>

<p align="center">
  <code>926 suburbs</code> &nbsp; <code>62 offence categories</code> &nbsp; <code>English + Chinese</code>
</p>

---

Sydney Crime Map is an independent, bilingual tool for exploring police-recorded crime statistics at suburb level. It brings together incident counts, population-based rates and an interactive map to make public data easier to explore.

> [!IMPORTANT]
> A recorded crime rate is **not** an individual's probability of experiencing crime. Read the counts, population and context together.

## Features

| | |
| --- | --- |
| **Search and explore** | Find a suburb, browse rankings and inspect the recorded counts behind each area. |
| **Interactive map** | Explore colour-coded suburb boundaries, with zoom and drag controls for desktop and touchscreens. |
| **Side-by-side comparison** | Compare up to four selected suburbs against a fixed regional benchmark. |
| **Flexible filters** | Choose a crime measure, region, minimum population and sort order. |
| **Bilingual experience** | Switch between English and Chinese throughout the site. |

## Data and methodology

| | |
| --- | --- |
| **Crime data period** | Latest processed 12 months; see `work/crime_period.json` |
| **Population and boundaries** | Australian Bureau of Statistics (ABS), 2021 Census and geography |
| **Geographic coverage** | Greater Sydney and the Central Coast; 926 suburbs |
| **Offence categories** | 62 recorded offence categories |
| **Rate** | Recorded incidents ÷ 2021 Census population × 100,000 |

Crime figures are derived from data published by the NSW Bureau of Crime Statistics and Research (BOCSAR). Population figures and suburb boundaries are based on ABS data. The project is not affiliated with BOCSAR or the ABS.

### Interpreting the statistics

- A small resident population can make a suburb's rate change sharply after only a few incidents.
- The population denominator is from 2021; growth and other changes since the Census can affect comparisons.
- Incidents may involve visitors, workers and other non-residents who are not counted in the resident population.
- Rankings describe recorded incident rates across the covered suburbs. They are not a complete measure of safety or an assessment of individual risk.

The repository contains processed snapshots. Once enabled on GitHub, the update workflow can refresh them from BOCSAR; publishing the updated site also requires Cloudflare setup described in [the automation guide](docs/automation.md).

### Official sources

- [BOCSAR Crime Mapping Tool](https://crimetool.bocsar.nsw.gov.au/bocsar)
- [BOCSAR criminal incident data](https://bocsar.nsw.gov.au/statistics-dashboards/open-datasets/criminal-offences-data.html)
- [ABS Census data](https://www.abs.gov.au/census/find-census-data)
- [ABS 2021 geographic boundary files](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files)

Please follow the relevant source agencies' attribution and reuse terms when using or redistributing their data.

## Getting started

The site is built with HTML, CSS and vanilla JavaScript. The build scripts use Node.js built-in modules, so there are no npm packages to install. The project was checked with Node.js 26 and Python 3.

```bash
git clone https://github.com/Revolt3738/sydney-crime-map.git
cd sydney-crime-map

node work/build_suburb_view.mjs
node work/build-seo.mjs
```

To run the complete validation and build:

```bash
python work/check_site.py
```

To check the official data without changing the snapshot:

```bash
python work/update_crime_data.py --dry-run
```

To preview the generated site locally:

```bash
python -m http.server 8000 --bind 127.0.0.1 --directory outputs/sydney-crime-seo
```

Open `http://127.0.0.1:8000/` in a browser. To run the existing validation checks:

```bash
node work/test-seo-language.mjs
python work/validate-seo.py
```

## Project structure

```text
work/
  suburb_view.html          Interactive page template
  suburb_*.js, *.css        Interface, map and language modules
  crime_data.json           Processed crime and population snapshot
  crime_period.json         Reporting period of the current snapshot
  suburb_shapes.json        Processed suburb boundaries
  update_crime_data.py      Download and process BOCSAR suburb data
  build_suburb_view.mjs     Interactive page builder
  build-seo.mjs             Bilingual pages and sitemap builder
outputs/sydney-crime-seo/   Ready-to-publish static site
```

## Deployment

Publish the contents of `outputs/sydney-crime-seo/` as static assets. The [automation guide](docs/automation.md) describes the GitHub workflow, the Cloudflare scheduler, deployment prerequisites, and verification.
