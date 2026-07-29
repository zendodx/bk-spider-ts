# 贝壳找房爬虫（bk_spider_ts）

基于 **Next.js + TypeScript + Playwright + SQLite** 打造的桌面/本地 Web 应用，用于采集贝壳找房二手房挂牌数据，并在此基础上提供房价预测、贷款计算、价格统计、失效房源追踪、小区维度分析、日照采光模拟等一整套看房辅助工具。

## 技术栈

- **前端 / 全栈框架**：Next.js 14（App Router）+ React 18 + TypeScript
- **样式**：Tailwind CSS
- **浏览器自动化**：Playwright（+ `playwright-extra` / `puppeteer-extra-plugin-stealth` 反爬虫指纹检测）
- **数据库**：SQLite（`better-sqlite3`）
- **图表**：Recharts、自研 SVG 折线图
- **3D 渲染**：Three.js（用于采光分析的 3D 场景与阴影模拟）
- **导出**：ExcelJS / xlsx、`@react-pdf/renderer`

## 快速开始

```bash
# 安装依赖
npm install

# 首次使用需要让 better-sqlite3 匹配本机 Node 版本
npm run rebuild:system

# 启动开发服务器（默认端口 3799）
npm run dev
```

浏览器打开 `http://localhost:3799` 即可使用。

可选环境变量（复制 `.env.local.example` 为 `.env.local` 按需修改）：

```bash
# 数据目录（未设置时使用默认路径）
DATA_DIR=/path/to/采集数据
RESOURCES_DIR=/path/to/resources
```

其他脚本：

```bash
npm run build   # 生产构建
npm run start   # 生产模式启动
```

## 功能模块

应用以顶部 Tab 的形式组织各功能面板（`src/components/`），所有面板始终挂载、切换时不丢失状态：

| Tab | 面板 | 说明 |
|---|---|---|
| 🕷️ 爬虫采集 | `SpiderPanel` | 配置城市 / 小区 / 爬取页数 / 速度模式等参数后一键启动采集，SSE 实时推送日志和进度；遇到验证码自动暂停等待人工处理；数据自动入库，支持导出 CSV。 |
| 🏠 房价预测 | `PredictPanel` | 基于"以租定价"模型，按月租金或单位面积租金两种口径，结合资金利率、折旧率、风险赔率等参数反推合理房价、年化收益率、租售比。 |
| 🏦 贷款计算 | `LoanPanel` | 商业贷款 / 公积金贷款 / 组合贷 + 等额本息 / 等额本金计算器，实时输出月供、总利息，并展示逐月还款明细表。 |
| 📊 价格统计 | `StatsPanel` | 按城市 / 区域 / 户型筛选，自研 SVG 图表展示单价、总价、挂牌量随时间变化的趋势曲线。 |
| 🏘️ 房源列表 | `ListingsPanel` | 系统核心数据入口：多维度筛选与排序，展示房源详情、与上次采集的价格变动趋势、单套房源历史价格曲线，支持跳转收藏 / 采光分析。 |
| 🏚️ 失效房源 | `ExpiredListingsPanel` | 追踪已下架房源，展示首次/最后出现时间、历史上架天数，辅助判断市场成交/撤牌情况。 |
| 🗺️ 小区信息 | `CommunityPanel` | 以小区为维度聚合统计挂牌数、均价/中位数/极值、数据新鲜度徽章，可一键跳转至该小区的采光分析。 |
| ☀️ 采光分析 | `SunlightPanel` / `SunlightEditorPanel` / `SunlightViewerPanel` | 在小区规划图上标注楼栋轮廓与参数（层数、层高、朝向、户型占比等），基于 Three.js 生成 3D 场景，模拟太阳轨迹计算逐户日照时长并以热力图展示；规划底图与分析结果均持久化到数据库，支持随时恢复。 |
| ⭐ 房源收藏 | `FavoritesPanel` | 收藏感兴趣的房源并填写结构化备注（装修/抵押/学区/优缺点等模板），支持导出 Excel / PDF。 |
| 🧹 数据清洗 | `CleanerPanel` | 按小区 + 日期范围预览并批量清理数据库中的房源数据，二次确认防止误删。 |
| ⚙️ 系统设置 | `SettingsPanel` | 配置爬虫默认参数、导出格式偏好、小区名称与小区 ID 映射、城市与站点 HOST 映射等全局设置。 |
| 💾 数据备份 | `BackupPanel` | 支持直接复制 / 无加密 ZIP / 加密 ZIP 三种方式备份数据库，并管理已有备份文件的下载与删除。 |

## 采光分析模块说明

采光分析功能的 3D 日照模拟能力基于开源项目 [Building Sunlight Simulator](https://github.com/seanwong17/building-simulator)（作者 seanwong17，MIT License，曾被「科技爱好者周刊」第 382 期推荐）进行 React 化重构与深度集成，主要改造点：

- 原始项目为独立静态页面（`building-sunlight-simulator/` 目录，作为参考保留），本项目将其编辑器与查看器能力重写为 React 组件并与后端数据库打通；
- 规划底图上传后会做浏览器端压缩（JPEG、0.85 质量、最长边 2400px）后持久化保存，支持标注方案与分析结果的完整状态恢复；
- 基于球面三角学计算太阳轨迹，支持按时间轴 / 季节预设模拟，Web Worker 后台计算逐户日照时长并生成热力图，分析结果可缓存复用。

## 项目结构

```
src/
  app/
    api/            # 后端 API 路由（爬虫、房源、小区、收藏、采光、备份、设置等）
    page.tsx        # 主页面（Tab 容器）
  components/       # 各功能面板组件
  lib/
    spider/         # 爬虫核心逻辑（driver / auth / parser / speed-controller 等）
    db/             # SQLite 数据库封装与初始化
    sunlight/       # 采光分析相关工具函数
    pdf/            # PDF 导出
building-sunlight-simulator/  # 采光模拟第三方开源工具原始代码（参考/复用）
docs/
  schema.sql        # 数据库表结构
```

## 主要 API 路由

| 分组 | 路径 | 说明 |
|---|---|---|
| 爬虫 | `POST /api/spider/run` | 启动/停止爬虫任务，SSE 推送实时日志 |
| 房源 | `/api/listings/query`、`/dates`、`/expired`、`/note`、`/price-history` | 房源查询、采集日期、失效房源、备注、价格历史 |
| 小区 | `/api/community/search`、`/api/stats/community` | 小区搜索联想、小区聚合统计 |
| 收藏 | `/api/favorite`、`/[id]`、`/check`、`/export-excel`、`/export-pdf` | 收藏 CRUD 与导出 |
| 预测 | `/api/predict` | 房价预测计算 |
| 采光 | `/api/sunlight/plan`、`/plan/analysis`、`/image` | 规划方案（含底图）读写、日照分析结果缓存、图片代理 |
| 数据清洗 | `/api/cleaner/listings` | 按条件批量删除房源数据 |
| 备份 | `/api/backup` | 备份文件创建/列表/下载/删除 |
| 系统 | `/api/settings`、`/api/mapping` | 全局设置、小区名称-ID 映射管理 |

## 爬虫技术说明

爬虫模块（`src/lib/spider/`）基于 Playwright 实现浏览器自动化，并采取以下反爬虫策略：

- 使用 `playwright-extra` + `puppeteer-extra-plugin-stealth` 规避 20+ 项自动化指纹检测；
- 注入反指纹启动参数（如禁用 `AutomationControlled` 标记）；
- 高斯随机延迟模拟真人操作节奏，支持慢速/正常/快速三档速度模式，并根据连续成功/失败自动升降速；
- Cookie 持久化到 SQLite 并自动恢复登录态，遇到登录拦截时弹出浏览器窗口交由人工接管；
- 可选屏蔽图片/字体等资源以提升采集速度。

## 性能与数据库维护

- 房源列表相关查询在设计索引时刻意避免在索引列上包裹函数（如用区间比较代替 `date(created_at) = ?`），以保证 SQLite 能命中索引；
- 数据库初始化时会自动执行一次 `ANALYZE` 建立统计信息（`sqlite_stat1`），并在每次爬虫抓取完成、数据量发生较大变化后自动刷新，避免查询优化器因统计信息过期而选择低效执行计划。
