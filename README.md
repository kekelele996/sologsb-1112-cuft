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
| 存储 | IndexedDB（Dexie，库名 `gbbirdring-db`） |
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
│       ├── types/             # ring-record / morphometrics / bird-site / session / source（+ ui.ts）
│       ├── stores/            # ringStore / measureStore / siteStore / sessionStore / mergeStore
│       ├── components/common/ # SiteMap / MeasureInput / RingCodeInput / SpeciesPicker / StatBadge / FilterBar / EmptyPanel
│       ├── hooks/             # useSiteFilter / useAmap
│       ├── pages/             # RingBoard / RingList / MeasureEntry / SiteList / SessionList / MergeCenter
│       ├── router/index.ts    # 路由表
│       └── utils/             # stats.ts / geo.ts / db.ts / export.ts / merge.ts（+ seed.ts / id.ts / plain.ts / format.ts）
```

## 功能与路由

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | 统计台 | 鸟种数、初捕/重捕比、鸟点分布图、鸟种计数与生境分布 |
| `/rings` | 环志记录 | 金属环号 + 彩环双段录入与自动查重，重复时提示并跳转历史记录 |
| `/measure` | 量度测量 | 6 项量度带单位与范围校验，与同鸟种历史均值比对给出偏离提示 |
| `/sites` | 鸟点台账 | 地图 / SVG 网格双模式切换，表单拾取坐标即时落点，点位间距提示 |
| `/sessions` | 调查批次 | 观测条件录入，关闭批次后统计鸟种数、初捕数与重捕数 |
| `/merge` | 摘录合并 | 野外小组离线登记后回站合并摘录包；两版冲突保留并标来源待站里裁定，新鸟点挂待确认不进统计 |

## 野外摘录合并流程

环志记录在站里电脑（主台账）录入；野外小组在无网点位用同一套应用离线登记，回站后把**摘录包**合并进主台账。

1. **导出摘录包**：野外端在「摘录合并」页填来源设备 / 小组名，点「导出摘录包」得到一份 JSON（只含本站录入、`source='local'` 的记录）。
2. **导入摘录包**：站里在「摘录合并」页点「导入摘录包」选择该 JSON。合并在一个事务内完成，失败整体回滚，可安全重试；已并入的记录按业务字段去重，**不会重复记两次**。
3. **冲突裁决**：同一只鸟（环号相同）两边都改过时，保留两版并标来源（本站录入 / 野外摘录），站里在「待裁决冲突」里定用哪版；未裁定前两版都可见但只计本站版，裁定后采用版有效、另一版废弃。
4. **待确认鸟点**：合并来的新鸟点在鸟点台账无对应点位时挂「待确认」，**不进正式统计**（地图、生境分布、网位合计、鸟点选择都排除）；站里确认后才纳入统计，也可删除。
5. **统计与导出**：环志记录、调查批次统计、量度均值与导出备份都按合并后的有效版本计算。

每条记录都有来源标记（`source`：local / merge）与摘录包 id（`mergeId`）；历史数据升级时自动补 `source='local'`。

## 数据存储说明

- 全部数据存于浏览器 IndexedDB（Dexie，库名 `gbbirdring-db`），表：`rings`、`morphs`、`sites`、`sessions`、`meta`。
- `db.version(1)` 建表声明索引；`db.version(2).upgrade(...)` 为环志表增加 `[speciesCn+ringDate]` 复合索引并回填历史彩环字段；`db.version(3).upgrade(...)` 为全部记录回填来源标记（`source='local'`）、为鸟点补待确认标记、为环志 / 批次补冲突裁决状态。升级前可用顶栏「导出备份」导出全量 JSON。
- 合并相关字段：`source`（来源）、`mergeId`（摘录包 id）、`conflictGroup`（冲突组）、`conflictStatus`（active/pending/superseded）、`pending`（鸟点待确认）。统计只取有效版本（`isEffectiveRing` / `isEffectiveSite` / `isEffectiveSession`，见 `utils/stats.ts`）。
- 首次打开且表为空时写入示例数据（6 个鸟点、4 个调查批次、18 条环志记录与 14 条量度）。
- 容器无状态：不使用数据库服务、不挂载命名卷，`docker compose down` 后数据仍留在浏览器中。
