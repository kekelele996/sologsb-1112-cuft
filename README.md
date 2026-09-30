# 鸟类环志记录与鸟点地图（gbbirdring）

面向环志站与鸟类监测志愿者：登记环志编号、鸟种与量度（喙/翅/尾/体重）、鸟点生境与调查批次，并在地图上查看鸟点分布。地图使用高德地图 JS API（key 走 `VITE_AMAP_KEY`），**未配置 key 时自动退化为本地 SVG 网格视图，构建与运行均不依赖该 key**。纯前端单页应用，数据全部保存在浏览器本地。

## Docker 一键启动

```bash
cp .env.example .env
docker compose up -d --build
```

启动后访问：<http://localhost:21812>

停止并清理：

```bash
docker compose down
```

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | Vue 3 + TypeScript（`<script setup>`） |
| 构建 | Vite 6（`npm run build` 含 `vue-tsc --noEmit` 类型检查） |
| UI | Element Plus 2 |
| 路由 | Vue Router 4（5 条业务路由 + 404） |
| 状态 | Pinia（ringStore / measureStore / siteStore / sessionStore） |
| 地图 | 高德地图 JS API（可选，按需动态加载）+ 本地 SVG 网格退化视图 |
| 存储 | IndexedDB（Dexie，库名 `gbbirdring-db`，schema v3） |
| 离线协作 | 摘录包导入/导出、冲突留版定版、待确认鸟点（单事务幂等合并） |
| 托管 | nginx:alpine（多阶段构建，SPA try_files + gzip） |

## 地图 key 说明（可选）

- 未配置 `VITE_AMAP_KEY`：`<SiteMap>` 渲染本地 SVG 网格视图，标记按生境配色落在对应格位，表单拾取坐标即落到格位中心；**构建与运行都不依赖该 key**。
- 配置后：`.env` 里填 `VITE_AMAP_KEY=<你的 key>`，再 `docker compose up -d --build`（compose 通过 build args 传入，Dockerfile 用 `ARG VITE_AMAP_KEY` 注入 Vite）。高德控制台需为该访问域名开启 JS API。

## 本地开发

```bash
cd frontend
npm install
npm run dev      # http://localhost:21812
npm run build    # 类型检查 + 生产构建
```

## 目录结构

```
.
├── docker-compose.yml         # 顶层 name / COMPOSE_PROJECT_NAME 容器名 / 端口映射 / 可选 VITE_AMAP_KEY build arg
├── .env.example               # COMPOSE_PROJECT_NAME、FRONTEND_PORT、可选 VITE_AMAP_KEY
├── frontend/
│   ├── Dockerfile             # node:20-alpine 构建 → nginx:alpine 托管
│   ├── nginx.conf             # try_files SPA 回退 + gzip
│   ├── public/favicon.svg
│   └── src/
│       ├── types/             # ring-record / morphometrics / bird-site / session（+ ui.ts）
│       ├── stores/            # ringStore / measureStore / siteStore / sessionStore
│       ├── components/common/ # SiteMap / MeasureInput / RingCodeInput / SpeciesPicker / StatBadge / FilterBar / EmptyPanel
│       ├── hooks/             # useSiteFilter / useAmap
│       ├── pages/             # RingBoard / RingList / MeasureEntry / SiteList / SessionList / MergeCenter
│       ├── router/index.ts    # 路由表
│       └── utils/             # stats.ts / geo.ts / db.ts / export.ts / merge.ts / merge-core.ts（+ seed.ts / id.ts / plain.ts / format.ts）
```

## 功能与路由

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | 统计台 | 鸟种数、初捕/重捕比、鸟点分布图、鸟种计数与生境分布 |
| `/rings` | 环志记录 | 金属环号 + 彩环双段录入与自动查重，重复时提示并跳转历史记录 |
| `/measure` | 量度测量 | 6 项量度带单位与范围校验，与同鸟种历史均值比对给出偏离提示 |
| `/sites` | 鸟点台账 | 地图 / SVG 网格双模式切换，表单拾取坐标即时落点，点位间距提示 |
| `/sessions` | 调查批次 | 观测条件录入，关闭批次后统计鸟种数、初捕数与重捕数 |
| `/merge` | 离线合并 | 野外摘录包导入/导出、冲突留版定版、待确认鸟点确认、合并历史 |

## 野外离线登记与回站合并

野外小组在无网点位离线登记（数据仍存本机 IndexedDB），回站后在「离线合并」页协作：

1. **生成摘录包**：在野外设备上填来源名（如「野外一组」），点「生成摘录包」下载 JSON（`app=gbbirdring-extract`，含唯一 `packageId`）。
2. **回站合并**：在主台账电脑选择摘录包。整包在**单个 IndexedDB 事务**内写入，任何一步失败整体回滚、不写脏数据，可直接重试；`mergeLogs` 按 `packageId` 去重，**已并进去的包不会重复记两次**。
3. **冲突留版**：同一只鸟（同环号、同一捕捉事件）两边都改过内容时，两版都保留并标注来源（站里 / 野外·小组名），默认采用站里版、野外版置为「留档」；站里在「冲突留版」区点「采用此版」定版，采用版进入统计与导出，留档版不参与。同环号的不同事件（如初捕后的重捕）按「环号+日期+网号+网次+状态」指纹区分，不会误判为冲突。
4. **待确认鸟点**：摘录包里台账没有的陌生点位（按点位编号 `siteNo` 判定）先挂「待确认」，**不进正式统计/地图正式分布**；在鸟点台账或合并页确认后，其关联环志才计入。
5. **统一口径**：环志记录、调查批次统计、统计台与导出 CSV 一律按**合并后的正式结果**（采用版 + 已确认鸟点）。环志记录页可勾选查看留档版/待确认记录，但它们不计入统计。


## 数据存储说明

- 全部数据存于浏览器 IndexedDB（Dexie，库名 `gbbirdring-db`），表：`rings`、`morphs`、`sites`、`sessions`、`mergeLogs`、`meta`。
- `db.version(1)` 建表声明索引；`db.version(2).upgrade(...)` 为环志表增加 `[speciesCn+ringDate]` 复合索引并回填历史彩环字段；`db.version(3).upgrade(...)` 为四张表统一补 `source` / `origin` 来源标记（**已有数据没有来源标记，升级时统一回填为「站里」**），环志表增加 `conflictGroup` / `superseded` 版本字段，鸟点表增加 `status`（台账既有点位回填为「已确认」），并新增 `mergeLogs` 表做导入幂等。升级前可用顶栏「导出备份」导出全量 JSON。
- 首次打开且表为空时写入示例数据（6 个鸟点、4 个调查批次、18 条环志记录与 14 条量度，均带来源标记）。
- 容器无状态：不使用数据库服务、不挂载命名卷，`docker compose down` 后数据仍留在浏览器中。
