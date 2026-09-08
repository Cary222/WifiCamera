# #10218: iOS 与 Web 端深空星图 (Stellarium) 离线加载与多平台兼容性踩坑复现报告

## 一、问题背景与现象 (Issue Summary)

- **单号**: `#10218`
- **关联功能模块**:
  - 深空星图视图组件: `src/features/stellarium/stellarium-view.tsx`
  - Web 端专属星图视图组件: `src/features/stellarium/stellarium-view.web.tsx`
  - Stellarium 离线静态运行时: `src/assets/stellar/index.html` 与 WebAssembly / 资源目录
  - Expo 离线资产插件: `plugins/with-stellarium-assets.js`
  - 深空主屏幕交互控件: `src/features/deep-space/deep-space-map-screen.tsx`
- **原始缺陷表现**:
  1. **iOS 模拟器星图无法加载**: 在 iOS 模拟器打开深空 Tab 时，界面直接显示“星图加载失败”，点击“重试”依然无效。
  2. **Web 端星图无法加载**: 在 Web 模式下打开深空 Tab 提示不支持或直接白屏报错。
  3. **Web 端第三方浏览器插件冲突**: 控制台打印 `[StellariumView Web Error]: Unknown Stellarium command: immersiveTranslate-messager-frame-bridge#ask#sendMessage`，随后星图崩溃。
  4. **Web 端转动视角无限加载**: 首次渲染成功后，鼠标拖拽转动视角，界面立刻陷入永久“星图加载中”。
  5. **Web 端 React Hydration 报错**: 控制台高频提示 `In HTML, <button> cannot be a descendant of <button>`。

---

## 二、测试环境与设备 (Environment)

- **开发宿主**: macOS 15.x / Apple Silicon (M系列芯片)
- **Node 环境**: Node.js v22.23.2, pnpm 10.12.3
- **移动端模拟器**:
  - iOS: iPhone 17 Pro (iOS 26.1 Simulator, Device ID: `ABE9B96E-1C00-4D68-A203-CADCE6B900F1`)
  - Xcode: 26.1.1 (Build 17B100)
  - CocoaPods: 1.16.2
- **Web 端环境**:
  - Metro Bundler (port 8081)
  - React Native for Web (~0.21.2) + React 19

---

## 三、踩坑点全景与根本原因分析 (Root Causes & Pitfalls)

### 坑 1: iOS 预构建完全遗漏了离线 Stellarium 资源打包

- **复现路径**:
  - Android 端通过 `plugins/with-stellarium-assets.js` 中的 `withDangerousMod(config, ['android', ...])` 将文件复制到了 `android/app/src/main/assets/stellar`，并由 Android 原生 `WebViewAssetLoader` 拦截 `https://appassets.androidplatform.net/assets/stellar/`。
  - **但在 iOS 端，插件没有任何拷贝操作，也没有把资源文件夹链接进 Xcode 工程**。
- **排查经过**:
  - 检查 Xcode 工程 `ios/WifiCamera.xcodeproj/project.pbxproj`，未发现任何 `stellar` 相关资源引用；
  - 检查编译出来的 `WifiCamera.app`，发现根目录下根本不存在 `stellar/` 目录，WebView 加载 `file://<bundle>/stellar/index.html` 发生 404，直奔 `onError` 导致加载失败。
- **node-xcode 踩坑**:
  - 初次尝试使用 `project.addFile(...)` 配合 `project.addToPbxResourcesBuildPhase(...)`，结果导出的 `project.pbxproj` 在 PBXResourcesBuildPhase 中写入了 `value = undefined;`。
  - 这导致 CocoaPods 在执行 `pod install` 解析 pbxproj 时直接崩溃抛出 `Dictionary missing ';' after key-value pair for "comment", found "i"`。
  - **解决**: 必须仿照 `addSourceFile` 的标准实现，显式指定 `file.uuid = project.generateUuid()`，先注册 `addToPbxBuildFileSection` 再加入 `addToPbxResourcesBuildPhase`，并在 Xcode 中将其标记为 `lastKnownFileType: 'folder'` 目录资源引用。

---

### 坑 2: WKWebView 的 `file://` 同源安全模型限制 (WASM / 字体 / JSON 读取失败)

- **复现路径**:
  - 资源成功打包进 `WifiCamera.app/stellar/` 后，WKWebView 尝试加载 `index.html`。
  - 控制台立即报出致命运行时错误：

    ```text
    RuntimeError: Aborted(both async and sync fetching of the wasm failed).
    ```

- **根本原因**:
  1. iOS WKWebView 对 `file://` 协议有着极其严苛的沙箱隔离：默认把每个 `file://` 视作独立唯一的非信任 Origin。
  2. 即使通过 `loadFileURL:allowingReadAccessToURL:` 提供了目录读取权限，WKWebView 内部的 JavaScript 运行环境依然会严格遵循以下限制：
     - `fetch('file://...')` 直接抛出 `TypeError: Type error` / `Load failed`；
     - `XMLHttpRequest` 跨本地文件默认被 CORS 安全策略拦截阻断；
     - WebAssembly 尝试 `WebAssembly.instantiateStreaming(fetch(...))` 彻底落空。
  3. `react-native-webview` 在 iOS 端默认未开启本地文件访问开关 (`allowFileAccessFromFileURLs` 和 `allowUniversalAccessFromFileURLs` 均为 `false`)。
- **解决手段**:
  1. **原生层**: 在 `<WebView>` 上显式开启权限：

     ```tsx
     originWhitelist={['*']}
     allowingReadAccessToURL={Platform.OS === 'ios' ? 'stellar' : undefined}
     allowFileAccess
     allowFileAccessFromFileURLs
     allowUniversalAccessFromFileURLs
     ```

  2. **HTML 运行时层**: 在 `index.html` 引擎载入前注入微型兼容垫片：
     - 将页面内的 `fetch()` 针对 `file://` 路径透明重定向至 `XMLHttpRequest`；
     - 并为 `.wasm` 自动补充标准的 `Content-Type: application/wasm` 头部，为 `.json` 补充 `application/json`；
     - Android 端的 `https://appassets.androidplatform.net` 请求自动原样穿透，不受任何影响。

---

### 坑 3: `react-native-webview` 在 Web 端完全不可用

- **复现路径**:
  - 在 Web 浏览器打开 deep-space 页面，控制台虽然没挂，但页面显示 `React Native WebView does not support this platform`。
- **根本原因**:
  - 查看 `node_modules/react-native-webview/lib/WebView.js` 源码，Web 平台下的导出仅是一个红色文字的占位符：

    ```javascript
    var WebView = exports.WebView = function WebView() {
      return <View><Text>React Native WebView does not support this platform.</Text></View>;
    };
    ```

- **解决手段**:
  - 采用 React Native 标准的平台专属文件分发方案：新建 `src/features/stellarium/stellarium-view.web.tsx`。
  - 原生端（iOS/Android）继续使用 `stellarium-view.tsx`，**实现代码零侵入、零回归风险**。
  - Web 端使用标准 HTML `<iframe>` 渲染星图页面，并通过浏览器标准 `window.postMessage` 与 `window.parent.postMessage` 实现双向通信。
  - 利用 Expo 规范的 `public/` 静态目录机制创建 `public/stellar -> ../src/assets/stellar`，使 Metro 与生产环境构建均能同源提供 `/stellar/index.html` 及其依赖的所有二进制资源。

---

### 坑 4: 第三方浏览器插件消息导致星图被误杀

- **复现路径**:
  - 用户浏览器安装了“沉浸式翻译”（Immersive Translate）或其他具有 content-script 的扩展插件时打开 Web 端，控制台突然打印：

    ```text
    [StellariumView Web Error]: Unknown Stellarium command: immersiveTranslate-messager-frame-bridge#ask#sendMessage
    ```

  - 星图瞬间崩溃并显示“星图加载失败”。
- **根本原因**:
  - `src/assets/stellar/index.html` 中通过 `window.addEventListener('message', receive)` 监听所有消息。
  - 浏览器扩展插件、React DevTools、Webpack/Metro HMR 会在 `window` 上频繁广播自己的状态消息。
  - 原代码无视消息合法性，直接对所有未识别消息调用 `reportError(...)` 并向宿主发送 `{ type: 'error' }`，导致星图在未完成启动阶段被直接判死刑。
- **解决手段**:
  - 在 `index.html` 中建立 `STELLARIUM_COMMANDS` 显式白名单机制（包含 `goto_radec`、`set_sky_layers`、`compute_tonight` 等全部合法指令）；
  - 对非白名单内的任何外部广播消息、插件消息直接静默忽略；`execute` 的 `default:` 分支改为静默返回。

---

### 坑 5: Web 端手势旋转视角导致无限“加载中”死循环

- **复现路径**:
  - Web 端首次渲染星图成功；
  - 鼠标拖拽转动星图视角后，画面突然被 Loading 蒙层覆盖，永远显示“星图加载中...”。
- **根本原因**:
  1. 用户转动视角时，Stellarium 引擎高频触发 `view_bearing` 事件将新方位角传递给 React Native。
  2. 外层页面组件 `DeepSpaceMapScreen` 执行 `setAzimuthDeg(newAngle)`，引发自身组件重渲染。
  3. 重新渲染时，传递给 `<StellariumView>` 的回调函数（尤其是 `onReady={() => ...}` 与 `onBearingChange`）在每次 render 都是全新的函数引用闭包。
  4. Web 端组件 `stellarium-view.web.tsx` 原先在 `useEffect` 中将这些 props 作为了依赖项：

     ```typescript
     useEffect(() => {
       beginLoading(); // ⚠️ 致命点：每次依赖变化都重新进入 loading 态！
       ...
     }, [onBearingChange, onReady, ...]);
     ```

  5. 每次转动视角 -> 父组件 setState -> props 引用变化 -> 触发 `useEffect` 重新执行 -> `beginLoading()` 强制把 `loading` 设为 `true`。
  6. 由于此时 iframe 内部早已启动完成，不会再发出第二次 `ready` 消息，导致界面永远卡死在 Loading 状态。
- **解决手段**:
  - 引入与原生端一致的 `handlersRef` 稳定回调管理范式：

    ```typescript
    const handlersRef = useRef<StellariumViewProps>(props);
    handlersRef.current = props;
    ```

  - `beginLoading` 与事件监听 `useEffect` 仅在组件挂载（Mount）时执行一次（依赖项为空）；
  - 视角转动时只更新 ref 中的最新函数引用，彻底消除重渲染带来的状态重置与无限 Loading。

---

### 坑 6: Web 端 HTML 规范错误 `<button> cannot be a descendant of <button>`

- **复现路径**:
  - Web 端控制台抛出警告：

    ```text
    In HTML, <button> cannot be a descendant of <button>.
    This will cause a hydration error.
    ...
    <TimeControl ...>
      <Pressable accessibilityRole="button" ...>
        ...
        <Pressable accessibilityRole="button" ...>
    ```

- **根本原因**:
  - `deep-space-map-screen.tsx` 中的时间控件 `TimeControl`，外层整体用了一个带有 `accessibilityRole="button"` 的 `<Pressable>`，内层的“回到当前时间”历史图标也包裹了一个 `<Pressable accessibilityRole="button">`。
  - `react-native-web` 会将带 button role 的 Pressable 直接输出为 `<button type="button">`，导致生成了嵌套的 HTML button，违反 W3C HTML 规范并引发 React Hydration 警告。
- **解决手段**:
  - 将外层容器改为 `<View style={[styles.timeControl, ...]}>`；
  - 内层的“回到当前时间”按钮与时间胶囊拆分为并列同级的两个独立 `<Pressable>`，结构扁平化，彻底消除规范报错。


### 坑 7: Web 端缺少 `public/stellar` 导致 Metro 回退 SPA HTML (Iframe 嵌套自身)
- **复现路径**:
  - 若没有 `public/` 静态目录，在 Web 浏览器访问 `/stellar/index.html` 时，Expo Router 的 catch-all SPA 机制会拦截该未知路径，并返回主应用自身的 HTML。
  - 这导致 Web 端 iframe 内部加载了主 App 自身，产生死循环嵌套。
- **解决手段**:
  - 在项目根目录保留 `public/stellar -> ../src/assets/stellar` 符号链接，并确保其随 Git 版本管理；同时在 `metro.config.js` 中补齐静态资源未命中时明确返回 404，杜绝返回 SPA HTML 污染二进制资源。

### 坑 8: `set_brightness` 指令白名单遗漏与 Canvas ID 匹配错误
- **复现路径**:
  - 最新合并的提交扩展了 `setBrightness` 指令，但 `STELLARIUM_COMMANDS` 集合中遗漏了该指令，导致指令被白名单静默忽略。
  - `index.html` 中调用 `document.getElementById('canvas')`，而实际画布 ID 为 `sky`，导致亮度滤镜无法生效。
- **解决手段**:
  - 在 `STELLARIUM_COMMANDS` 中补入 `'set_brightness'`，并将画布选择器修正为 `document.getElementById('sky')`。
---

## 四、技术方案架构对比与变更总结 (Architecture Diff)

| 平台 / 模块 | 修改前状态 | 修改后状态 | 解决的关键痛点 |
| :--- | :--- | :--- | :--- |
| **iOS 构建插件** (`plugins/with-stellarium-assets.js`) | 仅执行 Android 资产拷贝，iOS 为空白 | 增加 `withXcodeProject`：拷贝资源到 `ios/WifiCamera/stellar` 并安全挂载进 Xcode PBXResourcesBuildPhase | 解决 iOS 端本地 404 资源缺失问题 |
| **iOS 原生视图** (`src/features/stellarium/stellarium-view.tsx`) | 默认配置，未开启本地文件沙箱穿透 | 增加 `originWhitelist={['*']}`、`allowingReadAccessToURL="stellar"`、`allowFileAccessFromFileURLs`、`allowUniversalAccessFromFileURLs` | 解决 WKWebView 拒绝访问本地 WASM/字体/JSON 问题 |
| **星图入口** (`src/assets/stellar/index.html`) | 强依赖 fetch，无过滤外部 window 消息 | 注入 fetch-XHR 垫片，增加 STELLARIUM_COMMANDS 指令白名单，适配 Web iframe window.parent 兜底 | 解决 iOS WASM 加载失败、Web 扩展插件干扰、Web 双向通信链路 |
| **Web 端视图** (`src/features/stellarium/stellarium-view.web.tsx`) | 不存在（直接降级为报错视图） | 新增独立文件，使用 `<iframe>` 呈现，基于 `handlersRef` 实现稳定单次挂载与无抖动事件通信 | 解决 Web 端平台适配，彻底消除视角旋转导致的无限 Loading |
| **Web 静态服务** (`public/stellar`) | 不存在 | 软链接映射至 `src/assets/stellar`，Metro 与生产环境构建原生支持托管 | 解决 Web 环境下的本地离线引擎服务提供 |
| **时间控件** (`src/features/deep-space/deep-space-map-screen.tsx`) | 嵌套的 `Pressable (button)` | 扁平化同级 `<View>` + 两个同级 `<Pressable>` | 解决 Web 端 `<button>` 嵌套 `<button>` Hydration 报错 |

---

## 五、验证记录 (Verification Evidence)

### 1. iOS 模拟器真实交互验证

- 在 iPhone 17 Pro 模拟器上启动应用并进入深空 Tab：
  - 星图加载蒙层与错误提示正常消失，星空底图与银河地景完整呈现；
  - 通过手势滑动屏幕，星图实时旋转，方位角读数由 `0°` 流畅更新为 `19°`，状态同步至 React Native 指南针 UI；
  - 搜索菜单与 3×2 快捷叠加层按钮可正常弹起交互。
  - 留存验证截图：`ios-simulator-deepspace-working.png`。

### 2. Web 端全功能验证

- 启动 Metro Web 并在 Chrome 中测试：
  - 浏览器插件（沉浸式翻译等）广播消息被静默过滤，星图稳定就绪；
  - 鼠标拖拽漫游星空、转动方位角，界面顺滑响应，无无限 Loading 现象；
  - 控制台已完全消除 `<button>` 嵌套错误。

### 3. 代码质量与单元测试验证

- **单元测试**:

  ```bash
  pnpm test src/features/stellarium/stellarium-service.test.ts src/features/deep-space/deep-space-map-screen.test.tsx --runInBand
  ```

  结果：**2 passed, 85 tests passed**（深空与星图核心测试全部通过）。
- **静态类型与代码规范**:

  ```bash
  pnpm run type-check   # tsc --noemit -> 0 errors
  pnpm exec eslint ...  # 0 errors, 0 warnings
  ```
