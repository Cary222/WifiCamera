# Stellarium 星图接入验收记录

## 当前结论

第一阶段已经完成：独立跑通的 Stellarium Web Engine 已接入正式 WifiCamera React Native 项目，并在 Android 真机 APK 中验证能显示真实星图。

当前分支：

```text
feature/stellarium-migration
```

相关提交：

```text
cb9ed12 feat(stellarium): embed offline engine runtime
2cab820 fix(stellarium): stabilize android star map runtime
```

## 已完成范围

- deep-space 页面保留现有入口，并接入 Star Map overlay。
- StellariumView 使用 WebView 加载真实 Stellarium HTML/JS/WASM。
- 复制真实离线资源到 `src/assets/stellar`，包括 engine JS、WASM、字体、星表和基础数据。
- Android 通过 WebViewAssetLoader 加载：

```text
https://appassets.androidplatform.net/assets/stellar/index.html
```

- Expo prebuild 使用 config plugin 复制 stellar 资源到 Android assets。
- Bridge 支持：
  - `gotoRaDec`
  - `zoomTo`
  - `searchTarget`
  - `toggleConstellations`
  - `setFovFrame` 兼容入口
  - `reload`
- READY 前命令缓存已接入。
- 修复 Android release APK 启动页卡住问题。
- 修复星图 loading/timeout 遮罩误触发问题。
- 修复 `Hide Lines / Show Lines` 点按后出现 timeout 遮罩的问题。
- 默认测试目标使用 M42：

```text
RA 83.82
Dec -5.39
```

## 当前 APK

最终可验收 APK：

```text
D:\Users\21253\Desktop\stellarium-task\apk-output\WifiCamera-stellarium-hide-lines-fixed-arm64.apk
```

## 主要修改文件

- `app.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `patches/react-native-webview+13.15.0.patch`
- `plugins/with-stellarium-assets.js`
- `scripts/apply-stellarium-webview-patch.mjs`
- `scripts/check-stellarium-assets.mjs`
- `src/app/_layout.tsx`
- `src/app/(app)/deep-space.tsx`
- `src/features/stellarium/stellarium-overlay.tsx`
- `src/features/stellarium/stellarium-service.ts`
- `src/features/stellarium/stellarium-view.tsx`
- `src/assets/stellar/index.html`
- `src/assets/stellar/**`

## 验收步骤

1. 安装 APK。
2. 打开 App。
3. 进入 `deep-space`。
4. 点击 `Star Map`。
5. 确认显示真实星空，不是空白页。
6. 单指拖动星图。
7. 双指缩放星图。
8. 确认默认跳转到 M42 附近。
9. 点击 `Hide Lines / Show Lines`，确认不会闪退、不会出现 timeout 遮罩。
10. 点击 `1° FOV`，确认视野缩放生效。
11. 切后台再回来，确认星图仍可显示。

## 还未做的内容

- 未接真实相机 RA/Dec。
- 未接 Plate Solve。
- 未做正式搜索 UI。
- 未做正式 FOV 视场框 UI。
- 未按最终 UI 设计图重做 Star Map 工具栏。
- 未做 iOS 真机验证。
- 未做低端设备性能专项测试。

## 后续建议

后续等 UI 设计图确定后，再基于当前分支继续做：

- `feature/stellarium-ui-polish`：按 UI 图调整 Star Map 外层界面。
- `feature/stellarium-search`：增加搜索目标并跳转。
- `feature/stellarium-fov-frame`：增加相机视野框。
- `feature/stellarium-camera-sync`：接相机或 Plate Solve 输出的 RA/Dec。

后续开发原则：

- 不重做 Stellarium 引擎接入。
- 不覆盖 `src/assets/stellar` 的真实资源。
- 不直接修改生成后的 Android 目录作为正式方案。
- 保留 `deep-space -> Star Map -> StellariumOverlay -> StellariumView` 入口。
