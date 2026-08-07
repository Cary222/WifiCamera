# Stellarium Web Engine 源码架构分析

> 基于 `stellarium-web-engine` 仓库实际源码 | 2025-07-21
> 源码已 clone 到本地，以下结论全部来自实际代码，非推测

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────┐
│  浏览器 / WebView                                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  JavaScript 层                                      │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐  │  │
│  │  │ pre.js  │ │ obj.js   │ │canvas.js│ │geojson.js│  │  │
│  │  │ 引擎初始化│ │ 对象模型  │ │ 输入处理│ │ 矢量图层 │  │  │
│  │  │ 核心API │ │ 属性绑定  │ │ 触摸手势│ │         │  │  │
│  │  └─────────┘ └──────────┘ └────────┘ └─────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↕ ccall/cwrap/embind             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  WebAssembly 层 (C → Emscripten)                    │  │
│  │  ┌──────┐ ┌────────┐ ┌────────┐ ┌─────────────┐   │  │
│  │  │ core │ │observer│ │painter │ │ modules/     │   │  │
│  │  │ 核心 │ │ 观测者  │ │ 渲染器 │ │ 25个功能模块  │   │  │
│  │  └──────┘ └────────┘ └────────┘ └─────────────┘   │  │
│  │  WebGL 2.0 渲染管线                                  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**构建产物**：
- `stellarium-web-engine.js` — JS API 层（pre.js + obj.js + canvas.js + geojson.js + Emscripten 胶水）
- `stellarium-web-engine.wasm` — C 编译产物（核心引擎 + 25 个模块 + 内置 assets）

---

## 二、初始化流程（来自 pre.js 源码）

```javascript
// 1. 创建引擎实例 —— MODULARIZE=1, EXPORT_NAME=StelWebEngine
StelWebEngine({
    wasmFile: 'stellarium-web-engine.wasm',   // wasm 文件路径
    canvas: document.getElementById('canvas'), // canvas 元素
    translateFn: function(domain, str) {       // 可选：翻译回调
        return str;
    },
    onReady: function(stel) {                  // 引擎就绪回调
        // stel 就是 Module 对象，包含所有 API
    }
});
```

**初始化顺序**（pre.js L16-L66）：
1. WASM 模块加载
2. 创建 WebGL context（WebGL 2.0, `USE_WEBGL2=1`）
3. `_core_init(0, 0, 1)` → 初始化核心引擎
4. `Module.core = Module.getModule('core')` → 获取核心单例
5. `Module.observer = Module.core.observer` → 获取观测者
6. 调用 `onReady(Module)` → 用户代码入口

**关键参数（SConstruct）**：
```python
MODULARIZE=1           # 工厂模式，StelWebEngine() 创建实例
EXPORT_NAME=StelWebEngine
FILESYSTEM=0           # ⚠️ 无虚拟文件系统！
USE_WEBGL2=1           # WebGL 2.0
NO_EXIT_RUNTIME=1      # 运行时不退出
ALLOW_MEMORY_GROWTH=1  # 动态内存增长
```

---

## 三、完整的 JavaScript API（来自源码）

### 3.1 视图控制

```javascript
// 移动视图到指定方向（OBSERVED 坐标系 3D 向量）
stel.lookAt([x, y, z], duration_seconds);

// 锁定到天体对象，自动跟踪
stel.pointAndLock(targetObj, duration_seconds);

// 缩放 FOV（弧度）
stel.zoomTo(fov_radians, duration_seconds);

// 坐标系转换
stel.convertFrame(observer, 'ICRF', 'OBSERVED', [x, y, z, w]);

// 坐标格式转换
stel.a2tf(angle_rad);   // 弧度 → {sign, hours, minutes, seconds, fraction}
stel.a2af(angle_rad);   // 弧度 → {sign, degrees, arcminutes, arcseconds, fraction}

// 坐标工具
stel.c2s([x, y, z]);   // 笛卡尔 → 球坐标 [theta, phi]
stel.s2c(theta, phi);  // 球坐标 → 笛卡尔 [x, y, z]
stel.anp(angle);       // 规范化到 [0, 2π)
stel.anpm(angle);      // 规范化到 [-π, π)
```

### 3.2 事件监听

```javascript
// 点击事件
stel.on('click', function(event) {
    event.point  // {x, y} — 在 canvas 上的像素坐标
});

// 矩形选择事件
stel.on('rectSelection', function(event) {
    event.rect   // [{x1, y1}, {x2, y2}]
});
```

### 3.3 对象操作

```javascript
// 获取模块
var stars = stel.getModule('stars');
var dsos = stel.getModule('dsos');
var planets = stel.getModule('planets');
var constellations = stel.getModule('constellations');

// 搜索天体
var m42 = stel.getObj('M42');

// 创建对象
var layer = stel.createLayer({name: 'my-layer'});
var marker = stel.createObj('circle', {radec: [ra, dec], radius: 0.1});

// 属性读写（会自动 notify C 层）
var fov = stel.core.observer.fov;          // 读
stel.core.observer.fov = 0.5 * Math.PI/180; // 写
// 或者用 setValue/getValue
stel.setValue('core.observer.fov', 0.01);
var fov = stel.getValue('core.observer.fov');

// 监听属性变化
stel.onValueChanged(function(path, value) {
    console.log(path, value);  // 'observer.fov', 0.01
});

// 天体信息
var info = m42.getInfo('radec', stel.observer);  // 获取坐标
var names = m42.designations();                   // 获取所有名称
var vis = m42.computeVisibility({obs, startTime, endTime}); // 升落时间

// 列出可见天体
var visibleStars = stars.listObjs(observer, maxMag, function(star) {
    return star.getInfo('vmag') < 6.0;
});
```

### 3.4 数据源加载

```javascript
// 为模块添加数据源 —— 使用 HiPS 格式
stel.core.stars.addDataSource({url: 'path/to/stars'});
stel.core.dsos.addDataSource({url: 'path/to/dso'});
stel.core.landscapes.addDataSource({url: 'path/to/landscapes/guereins', key: 'guereins'});
stel.core.skycultures.addDataSource({url: 'path/to/skycultures/western', key: 'western'});
stel.core.milkyway.addDataSource({url: 'path/to/surveys/milkyway'});
stel.core.planets.addDataSource({url: 'path/to/surveys/sso/moon', key: 'moon'});
```

### 3.5 模块可见性控制

```javascript
// 每个模块都有 visible 属性，直接设置即可
stel.core.stars.visible = true;
stel.core.constellations.lines_visible = true;
stel.core.atmosphere.visible = false;
stel.core.landscapes.visible = false;
stel.core.dsos.visible = true;
stel.core.milkyway.visible = false;
stel.core.lines.equatorial.visible = true;
stel.core.lines.azimuthal.visible = false;
```

### 3.6 字体加载

```javascript
stel.setFont('regular', 'path/to/Roboto-Regular.ttf');
stel.setFont('bold', 'path/to/Roboto-Bold.ttf');
```

---

## 四、数据加载机制（关键发现）

### 4.1 三层加载策略（assets.c）

```
资产请求 URL
    │
    ├─ asset://xxx  → 从 WASM 二进制中读取（编译时嵌入）
    │                 字体/着色器/行星数据等基础资源
    │
    ├─ asset_set_hook() → JavaScript 拦截（离线方案入口！）
    │   返回值 ≠ -1 → 使用 JS 提供的数据
    │   返回值 = -1 → 继续下一层
    │
    └─ HTTP fetch → 在线 URL 加载
```

### 4.2 `asset_set_hook` — 离线化的关键

```javascript
// 拦截所有数据请求，从本地提供数据
Module._asset_set_hook(
    Module.addFunction(function(user, url, sizePtr, codePtr) {
        var urlStr = Module.UTF8ToString(url);
        var data = myLocalDataStore[urlStr]; // 从本地获取数据
        if (data) {
            Module.setValue(sizePtr, data.length, 'i32');
            Module.setValue(codePtr, 200, 'i32');
            return data; // 返回数据指针
        }
        Module.setValue(codePtr, -1, 'i32'); // 让引擎自己处理
        return 0;
    }, 'iiiii'),
    0
);
```

### 4.3 内置资产（编译进 WASM）

`make-assets.py` 将 `data/` 目录下的文件编译为 C 数组，通过 `ASSET_REGISTER` 宏注册：

| 资产 | 内容 |
|------|------|
| `asset://font/NotoSans-Regular.ttf` | 默认字体 |
| `asset://font/NotoSans-Bold.ttf` | 粗体字体 |
| `asset://planets.ini` | 行星轨道数据 |
| `asset://shaders/*.glsl` | WebGL 着色器 |
| `asset://textures/*.png` | 行星表面纹理 |
| `asset://symbols.png` | 图标精灵图 |

### 4.4 外部数据（需独立加载）

**星表使用 HiPS 格式**（Hierarchical Progressive Survey），是一个瓦片树：

```
test-skydata/stars/
├── properties          # 元数据（包含星等范围等）
├── Norder0/           # HEALPix order 0（整个天球 12 个 tile）
│   ├── Npix0.fits.gz
│   ├── Npix1.fits.gz
│   └── ...
└── Norder1/           # HEALPix order 1（细分）
    └── ...
```

其他数据源同理：
- `dso/` — 深空天体（NGC/IC 星表）
- `skycultures/western/` — 星座文化数据
- `landscapes/` — 地平线景观
- `mpcorb.dat` — 小行星轨道
- `CometEls.txt` — 彗星数据
- `tle_satellite.jsonl.gz` — 人造卫星 TLE

---

## 五、引擎的 25 个模块

| 模块 | 文件 | 功能 |
|------|------|------|
| `stars` | stars.c | 恒星渲染（HiPS 星表） |
| `dsos` | dso.c | 深空天体渲染 |
| `planets` | planets.c | 太阳系行星（含纹理） |
| `constellations` | constellations.c | 星座连线/名称 |
| `atmosphere` | atmosphere.c | 大气散射模拟 |
| `landscape` | landscape.c | 地平线景观 |
| `milkyway` | milkyway.c | 银河光带 |
| `skycultures` | skycultures.c | 多文化星座体系 |
| `satellites` | satellites.c | 人造卫星（TLE） |
| `minorplanets` | minorplanets.c | 小行星 |
| `comets` | comets.c | 彗星 |
| `meteors` | meteors.c | 流星雨 |
| `lines` | lines.c | 坐标网格线 |
| `labels` | labels.c | 标签渲染 |
| `pointer` | pointer.c | 鼠标/触摸指针 |
| `cardinal` | cardinal.c | 方位标记 |
| `circle` | circle.c | 圆形叠加层 |
| `coordinates` | coordinates.c | 坐标显示 |
| `movements` | movements.c | 视图移动动画 |
| `geojson` | geojson.c | GeoJSON 矢量图层 |
| `drag_selection` | drag_selection.c | 拖拽选择 |
| `debug` | debug.c | 调试辅助 |
| `dss` | dss.c | DSS 巡天底图 |
| `photos` | photos.c | 照片叠加 |
| `hips` | hips.c | HiPS 瓦片加载引擎 |

---

## 六、关键架构特性

| 特性 | 实际情况 |
|------|----------|
| **FILESYSTEM** | ❌ 关闭 — 不能放文件到虚拟 FS |
| **离线资产** | ✅ `asset://` URL + `ASSET_REGISTER` 宏编译进 WASM |
| **外部数据** | ✅ `addDataSource({url})` + `asset_set_hook` 拦截 |
| **星表格式** | ✅ HiPS 格式（HEALPix 瓦片树） |
| **Canvas 接管** | ✅ canvas.js 全权处理鼠标/触摸/滚轮 |
| **WebGL** | ✅ WebGL 2.0，`core_render()` 每帧渲染 |
| **模块系统** | ✅ 可插拔，每个模块有自己的数据源 |
| **属性绑定** | ✅ obj.js 自动为 C 对象创建 JS 属性 getter/setter |

---

## 七、对 WiFi 相机 APP 的影响

### 7.1 好消息

1. **离线运行完全可行**。`asset_set_hook()` 提供了完美的拦截点——所有数据请求都可以从预置的本地数据中返回。

2. **引擎 100% 自包含**。所有渲染、计算、交互都在 WASM 内完成，不依赖任何外部服务。

3. **API 足够丰富**。`lookAt()`、`zoomTo()`、`pointAndLock()`、`getObj()`、`getInfo()`、`setValue()` 等完全满足我们的需求。

4. **模块可控**。不需要的模块可以设为 `visible = false`（大气、地平线等），干净整洁。

5. **无 Render Loop 冲突**。引擎自己通过 `requestAnimationFrame` 驱动，不需要我们从外部控制帧率。切换页面时只要隐藏 canvas，浏览器会自动暂停 RAF。

### 7.2 需要做的事

1. **定制星表**。需要生成一个精简的 HiPS 格式星表（Hipparcos 12万星足够），替代 demo 里用的 Gaia 全量数据。可以用桌面版 Stellarium 的工具链。

2. **编写 asset_set_hook**。在 HTML 壳里实现数据拦截，从 RN 端注入预打包的二进制数据。

3. **不需要的模块不加载数据源**。只在 `addDataSource` 时加我们需要的（stars, dsos, constellations），其余的不用加载，省空间。

4. **WebView 需要支持 WebGL 2.0**。iOS A12+、Android 中端以上都支持。

### 7.3 体积估算

| 组件 | 大小 |
|------|------|
| stellarium-web-engine.js | ~2-5 MB |
| stellarium-web-engine.wasm | ~5-15 MB |
| 内置 assets（字体/着色器/纹理） | ~2 MB（已编译进 wasm） |
| Hipparcos 星表（HiPS 格式） | ~5-10 MB |
| NGC/IC 深空天体 | ~1 MB |
| 星座数据 | ~500 KB |
| **APP 端总计** | **~15-30 MB** |

---

## 八、最终的集成方案

```
APP 端                          WebView 内
┌──────────┐    postMessage     ┌─────────────────────────┐
│ RN Native│◄──────────────────►│ HTML 壳                   │
│          │                    │                          │
│ - 接收    │  gotoRaDec(ra,dec)│ StelWebEngine({...})     │
│   相机    │  setFov(fov)      │   ├── asset_set_hook()   │
│   RA/Dec  │  searchTarget()   │   │   └── 从注入数据中获取  │
│          │                    │   ├── core.stars         │
│ - 用户    │  onReady, coords  │   ├── core.dsos         │
│   UI      │                   │   ├── core.constellations│
│          │                    │   └── canvas → WebGL渲染  │
└──────────┘                    └─────────────────────────┘
```

**初始化代码**：
```javascript
// 1. RN 通过 injectJavaScript 注入数据
window.starData = {
  'stars/properties': base64Str,
  'stars/Norder0/Npix0.fits.gz': base64Str, 
  // ...
};

// 2. 启动引擎
StelWebEngine({
  wasmFile: 'stellarium-web-engine.wasm',
  canvas: document.getElementById('sky'),
  onReady: function(stel) {
    // 3. 设置 asset hook 拦截数据请求
    // 4. addDataSource 加载星表等
    // 5. 配置视图（关掉不需要的模块）
    // 6. 通知 RN 就绪
  }
});
```

---

## 九、结论

源码分析证实了 Stellarium Web Engine 的架构非常干净：

- ✅ **纯渲染引擎**（不是 API 服务），C→WASM，完全在本地运行
- ✅ **离线可用的数据加载机制**已经内置（`asset_set_hook`）
- ✅ **JS API 完善**，可编程控制一切
- ✅ **WebGL 渲染**，性能有保障
- ✅ **模块化架构**，不用的模块不影响性能
- ⚡ **唯一的外部依赖**：需要自己准备 HiPS 格式的精简星表数据集

**下一步**：编译验证 → 准备 HiPS 星表数据 → 编写 asset hook → RN 集成测试。
