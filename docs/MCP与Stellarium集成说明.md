# MCP 与 Stellarium 集成说明

更新日期：2026-09-04

## 1. 两条链路概览

本项目将“模拟器自动化”和“离线 Stellarium 星图”分为两条独立链路：

```text
AI / MCP 客户端
  └─ stdio MCP Server（scripts/mumu-app-mcp.ts）
       └─ adb
            └─ 本地 Android 模拟器（仅 emulator-* 或 127.0.0.1:*）

React Native 设置/星图 UI
  └─ StellariumBridge（postMessage）
       └─ react-native-webview
            └─ Android appassets 中的 assets/stellar/index.html
                 └─ Stellarium WebAssembly 引擎与离线数据
```

MCP 不直接控制 Stellarium 引擎；它负责构建后 APK 的安装、启动、截图、点击、滑动、UI 层级与日志采集。Stellarium 的功能改动则通过 React Native ↔ WebView 的消息协议完成。

## 2. MuMu / Android MCP 的连接方式

### 启动

项目脚本：

```bash
corepack pnpm mcp:mumu
```

实际入口为 `scripts/mumu-app-mcp.ts`，使用 `@modelcontextprotocol/sdk` 的 `StdioServerTransport`。因此 MCP 客户端通过标准输入输出启动并通信，无需额外 HTTP 端口。

可选环境变量：

```bash
MUMU_APP_PACKAGE=com.wificamera.development
MUMU_DEVICE_SERIAL=emulator-5554
```

未配置时，包名默认 `com.wificamera.development`；设备选择逻辑会优先选择在线的 `emulator-*`，其次是 `127.0.0.1:<port>`。

### 安全边界

`mumu-app-mcp-core.ts` 明确拒绝把非模拟器 ADB 设备作为默认目标，避免误操作已连接的真机或板端设备。传入 APK 时也只允许项目根目录以内的相对 `.apk` 路径。

### MCP 工具

| 工具 | 用途 |
| --- | --- |
| `mumu_status` | 查询模拟器、安装状态、当前前台 Activity |
| `mumu_launch` / `mumu_stop` | 启动或停止应用 |
| `mumu_screenshot` | 截图保存到 `artifacts/mumu/` |
| `mumu_install_apk` | 安装项目内指定 APK |
| `mumu_install_release` | 读取 Gradle 的自定义 `buildDir` 后安装 Release APK |
| `mumu_tap` / `mumu_long_press` / `mumu_swipe` / `mumu_back` | 模拟交互 |
| `mumu_ui_dump` | 导出 Android UI 层级 XML |
| `mumu_logcat` | 读取目标 App 的近期日志 |

## 3. Android Release APK 的构建与安装

`android/app/build.gradle` 配置了：

```gradle
buildDir = file("D:/b/app")
```

所以 Release APK 不在默认 `android/app/build/outputs/...`，而在：

```text
D:/b/app/outputs/apk/release/app-release.apk
```

本机 Android Studio 附带的 JDK 版本为 25.0.2，而当前 Gradle/Kotlin 组合无法解析该版本。构建时使用 Gradle 缓存中的 JDK 17：

```bash
cd android
JAVA_HOME="C:/Users/73671/.gradle/jdks/jdk-17.0.13+11" ./gradlew assembleRelease
```

直接安装到模拟器：

```bash
adb -s emulator-5554 install -r "D:/b/app/outputs/apk/release/app-release.apk"
adb -s emulator-5554 shell am start -n com.wificamera.development/.MainActivity
```

## 4. Stellarium 运行时如何进入 APK

离线运行时源目录：

```text
src/assets/stellar/
```

Expo 配置中的 `./plugins/with-stellarium-assets` 会在 Android 预构建阶段把整目录复制到：

```text
android/app/src/main/assets/stellar/
```

插件会检查 `stellarium-web-engine.wasm` 存在；缺失时应执行：

```bash
corepack pnpm check:stellarium-assets
```

Android WebView 使用本地 appassets URL 加载入口：

```text
https://appassets.androidplatform.net/assets/stellar/index.html
```

这使星图、WASM 引擎、星空文化和景观数据无需在线网络即可运行。

## 5. React Native 与 Stellarium 的通信协议

### 发送方向：React Native → WebView

`src/features/stellarium/stellarium-service.ts` 定义 `StellariumCommand` 联合类型并通过 `WebView.postMessage(JSON.stringify(command))` 发送。

`createStellariumBridge()` 会：

1. 先校验命令字段和数值范围；
2. 在引擎未 ready 时最多暂存 50 条命令；
3. 收到 ready 后顺序发送；
4. 对日历/事件计算按 `requestId` 匹配异步返回值。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `set_location` | 更新观察者经纬度 |
| `set_time` | 更新星图时间 |
| `set_view_bearing` | 传感器/罗盘更新视角方位 |
| `set_sky_layers` | 标签、星座、地景、大气等图层 |
| `set_environment` | Bortle、雾、方位文字、浑浊度 |
| `set_landscape` | 切换本地地景 |
| `set_sky_culture` | 切换天空文化 |
| `set_grid_lines` | 更新网格线 |
| `set_magnitude_limit` | 更新高级设置中的可见星等上限 |
| `compute_tonight` / `compute_events` | 请求本地星历和活动计算 |

### 接收方向：WebView → React Native

`src/features/stellarium/stellarium-view.tsx` 解析 WebView 的 `onMessage` JSON，通过 `dispatchSceneMessage()` 分发：

- `ready`：解除桥接命令队列并移除加载层；
- `bearing`：更新罗盘 UI；
- `object_selected` / `selection_cleared`：控制天体信息页；
- `target_found` / `target_not_found`：更新搜索结果；
- `tonight` / `events`：完成带 `requestId` 的异步计算；
- `error`：在引擎 ready 后作为命令错误处理，否则作为星图加载错误处理。

## 6. 修改 Stellarium 功能的标准流程

1. 在 `stellarium-service.ts` 增加命令类型、桥接方法和参数校验。
2. 在 `src/assets/stellar/index.html` 的 `execute(message)` 中增加同名 `case`，把消息映射到 `stel.core`、模块属性或现有引擎 API，并调用 `forceRender()`。
3. 在 React Native 功能页通过 `StellariumViewHandle` 调用桥接方法。
4. 为 service bridge 添加单元测试；涉及 UI 时为深空页面补交互测试。
5. 运行：

```bash
corepack pnpm test src/features/stellarium/stellarium-service.test.ts --runInBand
corepack pnpm test src/features/deep-space/deep-space-map-screen.test.tsx --runInBand
corepack pnpm run type-check
corepack pnpm exec eslint <changed-files>
```

6. 使用 MCP 的安装、启动和截图工具验证真实 APK。

## 7. 本次设置功能的对应关系

- “使用自动定位”由 `expo-location` 获取坐标，随后调用 `set_location`；日历与星图共用同一观察者状态。
- “传感器”订阅设备航向，并调用 `set_view_bearing`。
- “限制星等”使用独立的 `set_magnitude_limit`，在 `index.html` 中写入 `stel.core.display_limit_mag`。
- 设置面板采用顶部停靠模式，底部星图不再被全屏面板与遮罩覆盖。
