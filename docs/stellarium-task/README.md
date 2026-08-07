# Stellarium 星图引擎嵌入 React Native — 任务说明书

> 实习生任务 | 2025-07-21

---

## 一、背景：我们在做什么

### 1.1 产品

**HXY Cam** 是一台 WiFi 天文相机。它接在望远镜后面替代目镜，用户通过手机 APP 无线控制拍摄星空。

- **硬件**：RV1106B 主控 + IMX662 传感器，256MB DDR，WiFi AP 自建热点
- **APP**：React Native，同时打包 iOS 和 Android
- **三种拍摄模式**：风光（白天/月亮）、行星（木星/土星）、**深空（星云/星系）**

### 1.2 星图要解决什么问题

**深空模式**下，用户需要知道望远镜当前指向哪个天区。望远镜指向哪里，星图就应该显示哪里的星空。

工作流程：
```
用户按「解析」按钮
  → 相机拍一张照片
  → astrometry.net 算法识别星点 → 算出精确坐标 (RA/Dec)
  → 坐标传到 APP → 星图自动跳到对应天区
```

没有星图 = 深空模式废了一半。**这是核心功能，不是装饰。**

### 1.3 为什么选 Stellarium

Stellarium 是天文圈最知名的开源星图软件（桌面版下载量超千万）。它有一个 **Web Engine 版本**：

- C 语言写的星空渲染内核 → 通过 Emscripten 编译成 JavaScript + WebAssembly
- 在浏览器/WebView 里用 WebGL 渲染星空
- 可以离线运行（星表数据预置在本地）
- 开源（AGPLv3 许可证）

方案：**把 Stellarium Web Engine 编译产物塞进 React Native 的 WebView 里**，通过 postMessage 双向通信。

---

## 二、你的任务

### 一句话

**将 Stellarium Web Engine 嵌入 HXY Cam 的 React Native APP，实现离线星图功能。**

### 具体交付物

1. **编译** Stellarium Web Engine → 产出 `.js` + `.wasm` + 星表数据
2. **编写** HTML 壳（`index.html`），初始化引擎 + 处理 postMessage 指令
3. **编写** `StellariumView.tsx` React Native 组件（WebView 封装）
4. **编写** `StellariumService.ts`（postMessage TypeScript 封装）
5. **集成**到深空拍摄页面（`DeepSpaceScreen.tsx`），星图作为覆盖层
6. **修复** Stellarium 源码中的 iOS 触摸兼容问题（canvas.js 5 行修改）
7. **验证** iOS + Android 真机都能正常跑

### 不在范围内

- 不需要写任何 Java/Kotlin/Swift 原生代码
- 不需要修改 Stellarium 的 C 核心代码（只改 JS 胶水层的一个文件）
- 不需要做星图本身的渲染优化（Stellarium 已经做好了）
- 不需要管相机端——相机通信是另一个同事负责的

---

## 三、技术架构

```
┌─────────────────────────────────────────────────┐
│  React Native APP                                │
│                                                  │
│  DeepSpaceScreen.tsx                             │
│  ├── 拍摄状态：相机预览 + 控件                     │
│  └── 星图状态：StellariumOverlay (全屏覆盖)        │
│       ├── StellariumView.tsx (WebView 封装)       │
│       │   └── WebView 加载本地 index.html         │
│       │       └── Stellarium Web Engine (WASM)    │
│       │           └── WebGL Canvas 星空渲染       │
│       ├── 返回按钮 (RN TouchableOpacity)          │
│       └── 底部工具栏 (星座/搜索/FOV)              │
│                                                  │
│  StellariumService.ts                            │
│  └── postMessage 封装：gotoRaDec/zoomTo/search    │
│                                                  │
│  CameraContext (已有)                             │
│  └── currentRaDec → StellariumOverlay 自动跟踪    │
└─────────────────────────────────────────────────┘
```

**关键设计决策**：星图是**覆盖层**而非独立页面。因为 WebView + WASM 初始化要 1-3 秒，用覆盖层只需初始化一次，后续切星图瞬间显示。

**数据流**：
```
相机 Linux → TCP → CameraService → CameraContext
  → useEffect → StellariumView.gotoRaDec(ra, dec)
  → WebView.postMessage → HTML 内 stel.lookAt(pos)
  → WebGL 渲染星图
```

---

## 四、文件清单

你需要创建/修改的文件：

| 文件 | 类型 | 说明 |
|------|------|------|
| `stellar/index.html` | 🆕 新建 | HTML 壳，引擎初始化 + postMessage 处理 |
| `stellar/stellarium-web-engine.js` | 🆕 编译产物 | 从 Stellarium 源码编译 |
| `stellar/stellarium-web-engine.wasm` | 🆕 编译产物 | 同上 |
| `stellar/data/` | 🆕 准备 | 星表 + 星座 + 深空天体数据 |
| `components/stellar/StellariumView.tsx` | 🆕 新建 | WebView 封装组件 |
| `components/stellar/StellariumOverlay.tsx` | 🆕 新建 | 深空页星图覆盖层 |
| `services/StellariumService.ts` | 🆕 新建 | postMessage TS 封装 |
| `screens/DeepSpaceScreen.tsx` | ✏️ 修改 | 增加星图按钮 + Overlay |
| `contexts/CameraContext.tsx` | ✏️ 修改 | 增加 showStellarium 字段 |
| `stellarium-web-engine/src/js/canvas.js` | ✏️ 修改 | 修复 iOS 触控兼容（见 §7） |

平台配置：

| 操作 | 说明 |
|------|------|
| `android/app/src/main/assets/stellar/` | 复制全部 stellar/ 文件 |
| iOS Xcode 项目 | 将 stellar/ 加入 Bundle Resources |
| `package.json` | 增加 `react-native-webview` 依赖 + 复制脚本 |

---

## 五、开发阶段

### Phase 0 — 环境搭建 & 可行性验证（预计 1-2 天）

**目标**：手机屏幕看到星空。

1. 安装 Emscripten SDK
2. Clone + 编译 Stellarium Web Engine (`make js`)
3. 桌面浏览器打开 `apps/simple-html/` → 确认能跑
4. 创建空白 RN 项目 + `npm install react-native-webview`
5. 把编译产物放入 assets，WebView 加载 → **手机看到星空**

**Phase 0 通过标准**：iOS 或 Android 真机上 WebView 渲染出星空。

### Phase 1 — HTML 壳 + JS Bridge（预计 2-3 天）

**目标**：RN 端能通过 postMessage 控制星图指向。

1. 修改 `canvas.js` 的 iOS 触控问题（5 行，见 §7）
2. 重编译
3. 编写 `index.html`（引擎初始化 + postMessage 处理 + asset hook）
4. 编写 `StellariumView.tsx`（WebView 封装，暴露 ref API）
5. 编写 `StellariumService.ts`（postMessage 封装）
6. 准备星表数据（裁剪只保留需要的模块）
7. 硬编码一组 RA/Dec → 验证星图正确跳转

### Phase 2 — 集成到 APP（预计 1-2 天）

**目标**：在 HXY Cam 的深空页面里使用星图。

1. `DeepSpaceScreen` 增加 `view` 状态：shooting / stellarium / plan
2. 底部按钮增加「🌐 星图」
3. `StellariumOverlay` 实现（返回按钮 + 工具栏）
4. 对接 CameraContext（解析结果 → 自动 gotoRaDec）
5. 预加载策略（进入深空模式时后台初始化）
6. iOS + Android 双平台文件配置

### Phase 3 — 体验打磨（预计 1 天）

**目标**：好用、稳定。

1. 冷启动 loading 动画
2. 天体搜索功能
3. 前后台切换测试（WebGL context lost 处理）
4. 双平台真机验收

---

## 六、参考文档

本目录附带以下参考文档，遇到问题时查阅：

| 文档 | 用来看什么 |
|------|-----------|
| [技术方案详析](./参考-技术方案.md) | RN 架构集成点的逐层分析、组件树、数据流 |
| [触控与平台适配](./参考-触控适配.md) | **必读** — iOS/Android 触摸差异、canvas.js 修改原因 |
| [Stellarium 引擎 API](./参考-引擎API.md) | Stellarium 的 JS API 速查（lookAt/zoomTo/pointAndLock...） |
| [集成全景 HTML](./Stellarium-RN-集成全景.html) | 可视化总览，浏览器打开 |

---

## 七、重要：iOS 触控兼容性

Stellarium 源码有一个 bug 会导致 iOS 上无法正常拖拽星图。

**原因**：`src/js/canvas.js` 第 106 行，`touchstart` 事件用了 `{passive: true}`。iOS WKWebView 下 passive 监听器无法阻止浏览器默认手势，导致拖拽星图时页面同时滚动。

**修复**（3 处，共 5 行）：

```javascript
// 修改1: L106 — touchstart
// 改前: }, {passive: true});
// 改后:
    e.preventDefault();  // ← 新增
}, {passive: false});   // ← 改为 false

// 修改2: L117 — touchend  
// 增加: e.preventDefault(); + {passive: false}

// 修改3: HTML 壳 CSS
// 增加: canvas { touch-action: none; }
//       html,body { overscroll-behavior: none; overflow: hidden; }
```

修改后需要**重新编译**（`make js`）才能生效。

**同时**，RN 端 WebView 需要以下 props：
```tsx
<WebView
    scrollEnabled={false}
    bounces={false}
    overScrollMode="never"
    allowsBackForwardNavigationGestures={false}
/>
```

---

## 八、关键数据：Stellarium JS API 速查

引擎通过 `StelWebEngine({...})` 工厂函数创建，`onReady` 回调拿到 `stel` 对象后可以调用：

```javascript
// 视图控制
stel.lookAt([x, y, z], duration);        // 指向 3D 方向（OBSERVED 坐标系）
stel.pointAndLock(obj, duration);        // 锁定天体，自动跟踪
stel.zoomTo(fov_radians, duration);      // 设置视场角
stel.setValue('core.observer.fov', val); // 直接设置 FOV 属性

// 坐标转换
stel.s2c(ra, dec);                       // 球坐标 → 笛卡尔
stel.convertFrame(obs, 'ICRF', 'OBSERVED', v);

// 天体查询
stel.getObj('M42');                      // 搜索天体
obj.getInfo('radec', obs);               // 获取天体坐标
obj.designations();                      // 获取名称列表

// 模块开关
stel.core.stars.visible = true;
stel.core.constellations.lines_visible = true;
stel.core.atmosphere.visible = false;
stel.core.landscapes.visible = false;

// 数据源加载
stel.core.stars.addDataSource({ url: 'path/to/stars' });
stel.core.dsos.addDataSource({ url: 'path/to/dso' });
```

---

## 九、碰到问题找谁

| 问题类型 | 找谁 |
|----------|------|
| 产品功能定义、和相机协议的对接 | 项目负责人 |
| Stellarium 引擎架构、JS API 细节 | 参考本目录附带的参考文档 |
| React Native 工程问题 | RN 项目已有代码/文档 |
| 相机端解析算法、RA/Dec 数据格式 | Linux 应用组 |

---

## 十、时间线

| 节点 | 预计 | 内容 |
|------|------|------|
| Day 1-2 | Phase 0 | 环境搭建 + 编译 + 手机看到星空 |
| Day 3-5 | Phase 1 | HTML 壳 + JS Bridge + 双向通信 |
| Day 6-7 | Phase 2 | 集成到 HXY Cam APP |
| Day 8 | Phase 3 | 打磨 + 双平台验收 |
| **总计** | **5-9 天** | |
