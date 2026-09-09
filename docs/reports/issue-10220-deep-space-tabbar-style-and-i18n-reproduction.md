# #10220: 深空 Tab 底栏样式回退缺陷复现与星图多语言体系完整适配报告

## 一、问题背景与现象 (Issue Summary)

- **单号**: `#10220`
- **关联功能模块**:
  - 根 Tab 布局导航器: `src/app/(app)/_layout.tsx`
  - 深空主屏幕与全屏同步: `src/features/deep-space/deep-space-map-screen.tsx`
  - 星图多语言与位置格式化: `src/features/deep-space/ui/location-format.ts` 及各深空子组件
  - 国际化字典: `src/translations/{zh,en,ar}.json`
- **缺陷表现**:
  1. **底栏样式异常回退**: 当用户从首页或设置切换到深空 Tab 时，底部导航栏样式发生突变：
     - 高度从规范的 `72px` (64 + insets) 骤降至 `49px`；
     - 背景色从沉浸黑 `#0A0B0D` (`rgb(10, 11, 13)`) 变成 React Navigation 默认卡片灰 `rgb(46, 46, 46)` (`#2e2e2e`)；
     - 顶部分隔线从 `0.5px rgba(255, 255, 255, 0.08)` 变为粗糙的灰线 `1px rgb(125, 125, 125)`；
     - 底部与顶部内边距均被重置为 `0`，图标挤压变形。切回首页后底栏虽恢复，但每次进入深空必复现。
  2. **星图浮层多语言缺失**: App 语言切换为英文或阿拉伯语时，星图内部 WebView 引擎虽然能跟随 `?lang=` 切换，但整个 React Native 浮层（抽屉菜单、指南针、设置面板、5 大细分布局、天体详情卡、观测工具、日历、城市与星座数据名）全部硬编码为中文。

---

## 二、测试环境与设备 (Environment)

- **开发宿主**: macOS 15.x / Apple Silicon
- **Node 环境**: Node.js v22.23.2, pnpm 10.12.3
- **浏览器与运行时**:
  - Headless Chrome 152 (CDP Port 9222, SwiftShader / WebGL 模拟)
  - React Native for Web (~0.21.2) + React 19 + Expo SDK 54
- **真机/模拟器链路**:
  - USB 板端 Relay: `127.0.0.1:18787` (ready: true)
  - ADB 物理板子: `2765467eaf19e2f8`

---

## 三、根本原因深度分析 (Root Cause Analysis)

### 1. 底栏样式回退根因：命令式 `setOptions({ tabBarStyle: undefined })` 覆写

在最近提交 `5e0d522` 中，深空主页面为了实现“全屏沉浸”功能，新增了 `useDeepSpaceFullscreenSync` 钩子：

```tsx
function useDeepSpaceFullscreenSync(fullscreen: boolean) {
  const navigation = useNavigation();

  React.useEffect(() => {
    try {
      navigation.getParent()?.setOptions({
        tabBarStyle: fullscreen ? { display: 'none' } : undefined,
      });
    }
    catch {}
    if (Platform.OS !== 'web') {
      StatusBar.setHidden(fullscreen, 'fade');
    }
    return () => {
      try {
        navigation.getParent()?.setOptions({ tabBarStyle: undefined });
      }
      catch {}
      if (Platform.OS !== 'web') {
        StatusBar.setHidden(false, 'fade');
      }
    };
  }, [navigation, fullscreen]);
}
```

- **执行路径**:
  1. 用户处于普通非全屏模式进入深空 Tab，此时 `fullscreen` 为 `false`。
  2. `useDeepSpaceFullscreenSync` 在挂载时立即执行 `navigation.getParent()?.setOptions({ tabBarStyle: undefined })`。
  3. 在 React Navigation 的底层机制中，`navigation.setOptions(...)` 的权重大于 Navigator 的 `screenOptions`。当传入 `{ tabBarStyle: undefined }` 时，底栏描述符中的 `options.tabBarStyle` 被显式赋值为 `undefined`。
  4. `BottomTabBar` 组件在渲染时执行 `style: [{ ...defaultStyle }, tabBarStyle]`，因为 `tabBarStyle` 为 `undefined`，导致完全丢失了在 `_layout.tsx` 中定义的 `height: 72px`、`backgroundColor: '#0A0B0D'` 等定制样式，直接暴露出 React Navigation 的内置回退样式（高 49px、背景灰）。

### 2. 星图多语言缺失根因：浮层中缺少统一的 i18n 规范绑定

1. **硬编码文本繁多**: 整个深空模块包含 254 处独立中文字面量，涵盖组件属性（`title="设置"`）、JSX 文本节点、提示文本与枚举数组。
2. **模块作用域求值隐患**: 部分常量数组（如方位角标签 `BEARING_LABELS`、暗空级别 `BORTLE_LEVELS`、月份 `MONTHS_ZH`）如果在模块顶层直接调用 `translate()`，会因为初始化时序与缓存导致语言不切换或无法热更。
3. **测试 Mock 脱节**: 原先 `deep-space-map-screen.test.tsx` 与 `calendar-panel.test.tsx` 中对 `@/lib/i18n` 的 mock 使用了静态字面量映射字典，且对未匹配 key 默认直接返回原始 key 字符串，阻碍了浮层文本正向接入 i18n。

---

## 四、修复与重构方案 (Implementation Details)

### 1. 声明式底栏控制重构 (架构规范统一)

遵循项目既有的声明式路由架构（在 `src/app/(app)/_layout.tsx` 声明隐藏相机/相册底栏的惯例）：

- **`src/app/(app)/_layout.tsx`**:
  使用 `useMMKVBoolean` 响应式监听 `DEEP_SPACE_SETTINGS_FULLSCREEN`，并在 `(deep-space)` 的路由选项中声明：
  ```tsx
  const [deepSpaceFullscreen] = useMMKVBoolean(STORAGE_KEYS.DEEP_SPACE_SETTINGS_FULLSCREEN, storage);

  // (deep-space) Screen options:
  const hideTabs = routeName === 'star-map' || Boolean(deepSpaceFullscreen);
  return {
    // ...
    tabBarStyle: hideTabs ? { display: 'none' } : screenOptions.tabBarStyle,
  };
  ```
- **`src/features/deep-space/deep-space-map-screen.tsx`**:
  彻底剔除 `useDeepSpaceFullscreenSync` 内对 `navigation.getParent()?.setOptions` 的调用，移除无用的 `useNavigation` 导入，仅保留原生系统的状态栏沉浸切换，从根源上杜绝底栏样式污染。

### 2. 星图多语言体系全量适配

- **字典扩充与冲突规避**:
  - 在 `src/translations/{zh,en,ar}.json` 中扩充 258 个多语言词条，涵盖抽屉、设置、5 大细分布局、天体卡、日历、观测工具等。
  - 为避免与 `deep_space` 下已有的单段字符串 key（如 `atmosphere`、`time`、`fov`、`constellations`）发生层级命名冲突，新建专用命名空间（`atmosphere_panel`、`constellation_panel`、`time_panel`、`fov_panel`）。
  - 避免纯数字 key 导致 JavaScript 对象键自动按数字升序重排而触发 eslint `i18n-json/sorted-keys` 报错，将月份与 Bortle 等级重构为语义 key（如 `deep_space.month.m1`、`deep_space.bortle.b1`）。
- **规范数据与动态本地化**:
  - 城市列表、星座映射、当前位置哨兵等核心业务数据保留中文标识符以维持系统契约与状态稳定。
  - 新增 `src/features/deep-space/ui/location-format.ts` 中的 `cityLabel()`，在 UI 渲染层将数据名转换为目标语言呈现，自定/反查地名透传。
  - 修复英文/阿拉伯语模式下天体卡行星头像匹配失效缺陷（兼容英文天体名判定）。
- **测试框架健壮性增强**:
  - 单元测试中的 `@/lib/i18n` Mock 升级为直接从 `src/translations/zh.json` 解析并支持 `{{param}}` 动态插值，消除单测对硬编码文案的脆弱依赖。
  - 新增 `src/features/deep-space/ui/location-format.test.ts` 确保中英文/自定地名转换逻辑稳定。

---

## 五、验证结果与实测数据 (Verification)

### 1. Headless Chrome CDP 底栏实际样式测量

通过 CDP 注入脚本依次切换三个 Tab 并读取计算样式（Computed Styles）：

| 页面 Tab | 计算高度 (`height`) | 计算背景色 (`backgroundColor`) | 顶边框 (`borderTop`) | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **首页 (Home)** | `72px` | `rgb(10, 11, 13)` (`#0A0B0D`) | `1px rgba(255, 255, 255, 0.08)` | 正常 |
| **设置 (Settings)** | `72px` | `rgb(10, 11, 13)` (`#0A0B0D`) | `1px rgba(255, 255, 255, 0.08)` | 正常 |
| **深空 (Deep Space)** | `72px` | `rgb(10, 11, 13)` (`#0A0B0D`) | `1px rgba(255, 255, 255, 0.08)` | **完全一致 (已修复)** |

全屏触发与退出实测：
- 开启全屏: `display: 'none'`, 底栏完全隐藏，星图沉浸展现；
- 退出全屏: `display: 'flex'`, `height: 72px`, `bg: rgb(10, 11, 13)`，无缝还原标准底栏。

### 2. 多语言多端视觉审查

- **中文模式 (zh)**: 抽屉显示「星空述语/日历/观测工具/设置/帮助与反馈/退出」，指南针罗盘显示「北/东/南/西」，设置项显示「传感器/所在位置/高级的」，样式与排版 100% 保持原有基线。
- **英文模式 (en)**: 抽屉显示「Sky lore / Calendar / Observation tools / Settings...」，罗盘显示「N / E / S / W」，日历展示「9/8–9, Beijing」及「Mag / Alt」等天文学规范缩写，无文本截断或中途折行。
- **阿拉伯语模式 (ar)**: RTL 镜像布局正常，阿拉伯文字符排版完整，底栏样式统一。

### 3. 代码门禁与测试套件

- **TypeScript 类型检查**: `pnpm run type-check` -> `0 errors`
- **代码规范检查**: `npx eslint src/app/(app)/_layout.tsx src/features/deep-space/ src/translations/` -> `Clean`
- **自动化测试**: `pnpm test` -> **35 个测试套件，297 项用例全数通过**。
