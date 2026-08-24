# 深空模块开发计划：对齐 Stellarium

## 宗旨

以 `D:\app\stellarium-base-unpacked`（Stellarium Plus 官方 APK 解包）为唯一视觉与功能基准，逐屏对齐深空模块。凡有分歧，以参考包实际表现为准，不做自创设计。

本文件记录**已完成的部分**、**实测到的差距**、以及**后续要做的事**。

---

## 一、参考包实测结构

解包后的资产分布（`assets/data`，共 93 MB）：

| 目录 | 体积 | 内容 |
|---|---|---|
| `surveys/` | 19 MB | `dss`（13 MB 深空巡天底图）、`milkyway`、`sso`（6.7 MB 太阳系天体贴图） |
| `landscapes/` | 15 MB | 7 套地景 + `index.json` |
| `i18n/` | 12 MB | 四类目录 `gui` / `sky` / `otypes` / `skycultures`，各 17–18 种语言 |
| `models/` | 6.8 MB | 26 个 `.glb` 三维模型（ISS、Starlink、哈勃、各卫星与小行星）+ `env.ktx2` |
| `skycultures/` | 6.4 MB | 34 种天空文化 |
| `packs/` | 6.1 MB | `base`（3 MB 星表 + 1 MB DSO）、`minimal`（2.1 MB 精简星表） |
| `fonts/` | 552 KB | 字体 |
| `guide/` | 436 KB | 18 种语言的 HTML 用户指南 |
| 单文件 | — | `cities.db`（25 MB 城市库）、`mpcorb.dat`（4.7 MB 小行星轨道）、`meteor-showers.json`、`planetary-features.json`（行星地貌名录） |

我们当前 `src/assets/stellar/data`（约 14 MB）：

| 目录 | 我们 | 参考 | 差距 |
|---|---|---|---|
| `skycultures` | 6.4 MB / 35 项 | 6.4 MB / 34 项 | 基本齐平 |
| `landscapes` | 5.1 MB / **1 套**（guereins） | 15 MB / **7 套** | 缺 6 套 |
| `surveys` | 1.3 MB | 19 MB | 缺 DSS 巡天与 SSO 贴图 |
| `stars` | 366 KB | 3 MB | 星表深度远低于参考 |
| `dso` | 513 KB | 1002 KB | 深空天体约为一半 |
| `i18n` | 1 个 `.qm` | 71 个 `.qm` | 仅有天空文化中文 |
| `models` | 无 | 6.8 MB | 完全缺失 |
| `cities.db` | 无 | 25 MB | 无城市库，观测地写死 4 城 |
| `planetary-features.json` | 无 | 12 KB | 无行星地貌名录 |
| `guide` | 无 | 436 KB | 无用户指南 |

---

## 二、已完成

### 星图主视图
- WebView 承载 `stellarium-web-engine`，中文星名注入
- 图层开关：地平线、大气、星座图、星座连线
- 观测工具：地平网格、赤道网格、子午线
- 罗盘方位显示、搜索天体、回到当前时间

### 星空述语（天空文化）
- 全屏列表 + 全屏详情，按参考重构
- 本地缩略图解析与无图回退
- 切换天空文化、恢复默认

### 日历（本轮重点，已对齐参考截图）
- 全屏骨架：返回箭头 + 标题 + 今晚/活动 Tab
- 今晚页：日期标题、日落日出大字
- **太阳系甘特图**：真实天体图标（月相明暗、土星带环）、昼/晨昏/夜三段背景、整点与半点虚线网格、彩色时段条 + 条首时刻
- **有卫星经过**：卫星名 + 时间 / 星等 / 高程三列表格
- 活动页：月份分组、事件图标、完整本地时刻

### 卫星过境（实时数据）
- **不使用**仓库内 2020-01-29 的过期 TLE 做轨道推算
- 轨道来自 CelesTrak `GROUP=visual&FORMAT=json`（实测 120 颗，epoch 当日）
- `satellite.js` SGP4 传播 + 地影遮挡比例计算
- 本地目录只抽取静态星等（300 条，脚本 `scripts/extract-satellite-photometry.mjs`）
- MMKV 缓存：6 小时新鲜期，网络失败可回退 7 天内缓存，超 7 天的轨道丢弃
- 过滤规则：最高高度 ≥ 10°、非本影、预计星等 ≤ 6.5
- 测试覆盖缓存策略、过滤、排序、星等换算

---

## 三、已知差距与后续计划

按「用户可感知程度」排序。

### P0：星表与深空天体深度

现象：我们的星表仅 366 KB，参考 `packs/base/stars` 为 3 MB，暗星与深空天体明显偏少。

- 评估 `packs/base` 与 `packs/minimal` 的格式是否与当前引擎数据源兼容
- 若兼容，替换 `data/stars`、`data/dso` 并验证加载性能与 APK 体积
- 若不兼容，记录原因，改为分级加载（先 minimal，后台补 base）

### P0：地景只有 1 套

参考有 `champagne_castle`、`garching`、`guereins`、`kloppenheim`、`ocean`、`winterfield`、`zero` 共 7 套并带 `index.json`。

- 引入其余 6 套地景资产
- 在「观测工具」或新增「地景」面板中提供切换（参考包有 `index.json` 描述结构，照抄其分类与命名）
- 注意 APK 体积：评估按需下载而非全量内置

### P1：太阳系天体贴图与三维模型

参考 `surveys/sso`（6.7 MB）+ `models/*.glb`（26 个）让行星、ISS、哈勃等有真实外观。我们目前缺失，行星只能以色点呈现。

- 先引入 `surveys/sso` 贴图，让行星表面可见
- 再评估 `.glb` 模型是否被当前 wasm 构建支持（需实测，不假设）

### P1：观测地点写死 4 个城市

参考带 25 MB `cities.db`，可搜索任意城市。

- 现状：`OBSERVER_CITIES` 只有北京/上海/深圳/乌鲁木齐
- 计划：引入城市库 + 搜索选择；若 25 MB 体积不可接受，改为内置省会 + 手动经纬度输入

### P1：星图内多语言缺失

参考 `i18n` 下 `gui` / `sky` / `otypes` / `skycultures` 各 17–18 语言；我们只有 `skycultures-zh_Hans.qm`。

- 现状：中文星名靠 `names-zh.json` 手工注入，覆盖有限
- 计划：评估 `.qm` 能否被当前引擎直接消费；不能则扩充 `names-zh.json` 覆盖面

### P2：DSS 深空巡天底图

参考 `surveys/dss` 13 MB，缩放到深空目标时有真实照片背景。属体积敏感项，建议按需联网加载而非内置。

### P2：小行星与彗星

参考 `mpcorb.dat` 4.7 MB，我们仅 112 KB；`CometEls.txt` 我们有 144 KB。需确认引擎是否真正加载并显示。

### P2：行星地貌名录

参考 `planetary-features.json`（12 KB，含月面与火星地名）。体积极小，收益直观，可优先做。

### P3：用户指南

参考 `guide/guide-zh_Hans.html`。可作为设置页入口，属锦上添花。

---

## 四、纪律（本轮踩过的坑，务必遵守）

1. **不用过期数据冒充真实功能**
   仓库内 `tle_satellite.jsonl.gz` 全部为 2020-01-29 epoch，用它推算 2026 年过境是天级误差。已改为实时拉取；后续任何星历数据同此原则。

2. **不假设引擎能力，先验证符号表**
   本轮实测：wasm 导出的 `core.*` 只有 8 个（`atmosphere` / `c` / `constellations` / `dsos` / `dss` / `landscapes` / `lines` / `stars`），`core.satellites` 与 `calendar_*` 均被裁剪。引入任何新功能前先确认对应模块存在。

3. **dev-client 不读 APK 内的 bundle**
   本轮曾误判「已更新」——实际 app 从 Metro 拉 JS。验证 UI 变更时必须确认 dev client 连的是当前项目的 Metro 端口，而非其他项目占用的 8081。

4. **改 WebView 资产必须同步拷贝**
   `android/app/src/main/assets/stellar/` 与 `src/assets/stellar/` 是两份独立副本，Metro 不同步。

5. **第三方库先验证打包兼容性**
   `satellite.js@7` 入口连带导出 WASM，`import.meta` 在 Hermes 下打包失败；已降级到纯 JS 的 `6.0.2`，地影公式在项目内自实现。测试通过 ≠ 真机可打包。

6. **改动前先跑参考包比对**
   任何「觉得更好看」的自创改动都要先对照参考截图。本轮删掉了自创的「±1天/±1小时」按钮区，因为参考页没有。

---

## 五、验证清单

每次深空改动都要过：

```bash
corepack pnpm run type-check
corepack pnpm run lint            # 注意：仓库存量文件有历史 lint 错误，至少保证改动文件干净
corepack pnpm run lint:translations
corepack pnpm run test
```

真机验证：

```bash
npx expo export:embed --platform android --dev false \
  --entry-file node_modules/expo-router/entry.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
cd android && JAVA_HOME="D:/app/jdk17/jdk-17.0.2" ./gradlew assembleDebug
adb -s 127.0.0.1:16384 install -r D:/b/app/outputs/apk/debug/app-debug.apk
```

dev client 连当前项目 Metro（避免连到旧 bundle）：

```bash
npx expo start --dev-client --port 8082 --localhost
adb -s 127.0.0.1:16384 reverse tcp:8082 tcp:8082
adb -s 127.0.0.1:16384 shell am start -a android.intent.action.VIEW \
  -d 'exp+skysense://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082'
```

最后与参考截图并排逐项核对：字号、间距、颜色、图标、网格、表格列宽。
