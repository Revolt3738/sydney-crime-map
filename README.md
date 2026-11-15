# Sydney Crime Map · 悉尼犯罪地图

中英文静态网站，用于查询大悉尼和中央海岸 suburb 的警方记录案件数、记录率和地图。网站包含互动首页和若干地区详情页。

## 数据与口径

- 案件统计期：2025 年 7 月至 2026 年 6 月。
- 人口分母及 suburb 边界：澳大利亚统计局（ABS）2021 年数据。
- 人口标准化记录率按每 10 万名居民计算；记录率不代表个人遭遇犯罪的概率。
- 原始案件来源：[NSW BOCSAR 犯罪数据页面](https://bocsar.nsw.gov.au/statistics-dashboards/open-datasets/criminal-offences-data.html)。
- 人口与边界来源：[ABS 2021 年人口普查](https://www.abs.gov.au/census/find-census-data)及 [ABS 地理边界说明](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files)。

`work/crime_data.json` 和 `work/suburb_shapes.json` 是已经处理的快照。重新生成新统计期的数据需要另行取得原始数据并更新处理流程；本项目不会自动更新官方数据。使用或再发布数据时请遵守相应发布机构的条款。

## 构建与验证

构建脚本使用 Node.js 内置模块，不需要安装 npm 依赖。本项目在 Node.js 26 和 Python 3 环境中验证过。

```sh
node work/build_suburb_view.mjs
node work/build-seo.mjs
node work/test-seo-language.mjs
python work/validate-seo.py
```

完整的静态发布文件位于 `outputs/sydney-crime-seo/`，包含首页、英文页面、地区页面和站点地图。以文件夹整体上传到 Cloudflare Workers 静态资源时，应保持内部目录结构。

## 项目结构

- `work/suburb_view.html`、`work/suburb_*.js` 和 `work/suburb_map.css`：互动网站的模板、脚本及样式。
- `work/seo-*.mjs` 和 `work/seo-pages.css`：中英文地区页面与站点地图生成逻辑。
- `work/crime_data.json`、`work/suburb_shapes.json`：整理后的统计和地图数据。
- `outputs/sydney-crime-seo/`：生成的静态网站。

项目不包含自动部署配置；如需连接 Cloudflare 自动构建与发布，请按实际托管方式另行配置。
