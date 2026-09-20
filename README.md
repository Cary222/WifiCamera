<p align="center">
    <img alt="SkySense" src="https://github.com/skysense/skysense/assets/11137944/a8163d23-897a-4efe-91ce-b9bf7348c18f" width="200" />
</p>

<h1 align="center">
  SkySense
</h1>

![expo](https://img.shields.io/github/package-json/dependency-version/skysense/skysense-app/expo?label=expo) ![react-native](https://img.shields.io/github/package-json/dependency-version/skysense/skysense-app/react-native?label=react-native) ![GitHub Repo stars](https://img.shields.io/github/stars/skysense/skysense) ![GitHub commit activity (branch)](https://img.shields.io/github/commit-activity/m/skysense/skysense-app/main)

SkySense is a mobile application for monitoring sky brightness and light pollution. It connects to ESP8266-based SQM (Sky Quality Meter) devices to provide real-time measurements of night sky quality, temperature, humidity, pressure, and battery status.

## About SkySense

SkySense helps astronomers, light pollution researchers, and citizen scientists track and analyze sky quality over time. The app connects to hardware devices deployed outdoors to continuously monitor changes in light pollution levels.

## Key Features

- **Real-time SQM Monitoring**: Live sky brightness measurements displayed in mag/arcsec²
- **Multi-Sensor Dashboard**: Temperature, humidity, pressure, battery, and WiFi signal strength
- **Device Management**: Add, view, and manage multiple ESP8266 devices
- **Historical Data & Charts**: Analyze sky quality trends over hours, days, and weeks
- **Dark Mode**: Optimized for nighttime observation use
- **Offline Support**: Local data caching when network is unavailable

## Technology Stack

- **Expo SDK 54** with React Native 0.81.5
- **TypeScript** for type safety
- **Expo Router 6** for file-based routing
- **NativeWind / TailwindCSS** for styling
- **Zustand** for state management
- **React Query** for data fetching
- **TanStack Form + Zod** for form handling
- **MMKV** for encrypted local storage
- **react-native-gifted-charts** for data visualization
- **Jest + React Testing Library** for testing

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- Expo CLI
- For physical device testing: Expo Go or a custom dev client

### Installation

```bash
# Clone the repository
git clone https://github.com/skysense/skysense.git
cd skysense-app

# Install dependencies
pnpm install

# Start development server
pnpm start
```

### Running on Devices

```bash
# Android
pnpm android

# iOS
pnpm ios
```

### Building for Production

```bash
# Local Android build (requires android/ directory from prebuild)
cd android && ./gradlew assembleProdRelease

# EAS Cloud Build (for urgent delivery)
eas build --platform android --profile production
```

## Project Structure

```
src/
├── app/                  # Expo Router routes
├── features/
│   ├── skysense/         # Core monitoring dashboard
│   ├── device/           # Device management
│   ├── history/          # Historical data & charts
│   ├── settings/         # App settings
│   └── auth/             # User authentication
├── components/ui/        # Base UI components
├── lib/                  # Utilities (API, storage, i18n)
├── services/             # API clients & WebSocket
└── translations/         # i18n language files
```

## Backend & Data Sync

- **Phase 1**: App works with local mock data (no backend required)
- **Phase 2**: HTTP API communication with ESP8266 devices
- **Phase 3**: WebSocket for real-time data streaming
- **Future**: Supabase or custom Node.js backend for data persistence and user accounts

## Development Commands

```bash
pnpm start           # Start dev server
pnpm android         # Run on Android
pnpm ios             # Run on iOS
pnpm lint            # ESLint check
pnpm type-check      # TypeScript validation
pnpm test            # Run tests
pnpm check-all       # All quality checks
pnpm build:preview:android   # EAS preview build
pnpm build:production:android # EAS production build
```

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## License

MIT
# WifiCamera

## Update Log

### 2026-09-11 — 大气散射与雾默认关闭（内测包 364769）

- **类型**：Fix；将深空页首次进入、缺失偏好字段回退、全局重置和“大气与空气质量”面板重置统一为大气散射关闭、雾关闭。面板重置直接复用页面默认值。
- **引擎**：星图场景启动时同时关闭 `atmosphere.visible` 与 `landscapes.fog_visible`；地景可见性及其他图层默认值不变，随后正常恢复用户存档。
- **偏好兼容**：不清空存档，不强制覆盖用户手动保存的开启或关闭选择。旧版本保存的“雾开启”仍会保留，可在大气面板关闭或重置。
- **修改文件**：`src/features/deep-space/deep-space-map-screen.tsx`、对应测试、`src/assets/stellar/index.html`、`src/features/stellarium/stellarium-search-engine.test.ts`、`src/features/stellarium/stellarium-scene.test.ts`；原生资产通过现有同步脚本生成，运行资源目录不存放备份。
- **验证**：先确认 6 项回归断言按预期失败，再修改默认值；相关测试 4 套 / 198 项通过，全量测试 47 套 / 748 项通过；类型检查、修改文件 ESLint、星图资源检查和 APK 签名及内嵌资源校验通过。
- **模拟器**：在 MuMu `127.0.0.1:16384` 覆盖安装 `364769`，保留数据。确认原有“雾开启”存档保留后，仅重置大气面板；两个开关均为关闭，完全退出后再次打开面板仍为关闭。首次无存档默认值由组件与场景启动回归测试覆盖；本次模拟器未清除应用数据。
- **交付**：`builds/WifiCamera-preview-364769.apk` 及对应的重启后开关截图、验证记录只保留在本地，不进入代码仓库。未操作手机或板端；该轮未提交或推送代码。

### 2026-09-11 — 合并后独立内测包 364731

- **类型**：重新构建与模拟器验证；基于已合并的 `1b766c3` 和保留的本地内测打包、删除天体详情望远镜按钮改动。
- **安装包**：`builds/WifiCamera-preview-364731.apk`（本地产物，不进入代码仓库），支持 `armeabi-v7a`、`arm64-v8a`、`x86_64`；Release、非调试、关闭 Expo 在线更新，沿用内测签名。
- **构建校验**：APK 签名、包名、版本、原生架构及 1,250 个离线资源均通过校验；本轮类型检查和构建脚本 ESLint 通过。
- **模拟器验证**：在 MuMu `127.0.0.1:16384` 覆盖升级至 `364731`，未卸载或清除数据；冷启动进入首页，新版设置页、设备固件入口与 APP 版本入口可见；点击 APP 版本显示不支持在线检查的提示。检查结束时应用仍位于前台，当前进程日志未发现致命启动异常。
- **资源备份**：将两份地图图片备份移到 `backup/github-sync-20260911_142946/stellar-runtime-backups/`，保留 SHA-256 并更新备份清单，避免运行资源同步将 `.bak` 带入 APK。`364727` 为整理资源前的中间产物，不作为本次交付包。
- **验证边界**：界面显示相机已连接，仅检查设置及更新入口，没有执行固件下载、安装、设备重置或实机操作。上游 OTA 失败误报成功的问题仍未修复；本次验收不代表固件升级流程已通过。
- **证据**：验证记录与设置页截图保存在本地 `artifacts/`，不进入代码仓库；该轮未提交或推送代码。

### 2026-09-11 — Merge upstream settings/OTA rework and install the emulator preview build

- **Type**: Refactor (merge) + Fix
- **Changes**:
  - Fast-forwarded `main` from `dbd69ca` to GitHub `1b766c3` (#10221): settings page layout, shared device-connection modal rendered by the tab layout, and the 6-state firmware OTA flow. `/ota` route and `ota-screen.tsx` were removed upstream; `settings-updates.tsx`, `ota-service.test.ts` and `settings-screen.test.tsx` were added.
  - Local uncommitted work (standalone preview build pipeline, removal of the deep-space "point the telescope" action) was backed up, stashed, and reapplied. Only `deep-space-map-screen.test.tsx` overlapped and merged automatically: the upstream `useUniwind` mock and the local assertion rewrite both survive.
  - Preview APK `364677` crashed on the MuMu emulator with `SoLoaderDSONotFoundError: libreactnative.so`, because the ARM-only build has no `x86_64` native libraries. Rebuilt as `364690` with `--arch armeabi-v7a,arm64-v8a,x86_64` and upgraded in place; cold start, home screen and the deep-space star map were verified on the emulator.
- **Files**: 52 files from upstream, plus `README.md`. Local build/UI changes were still uncommitted at that point: `.gitignore`, `app.config.ts`, `metro.config.js`, `package.json`, `scripts/build-android-embedded.mjs`, `scripts/android-preview.mjs`, `src/features/deep-space/**`, `src/features/home/camera/transport.*`.
- **Verification**: `pnpm run type-check` clean; `pnpm run test` 47 suites / 744 tests passed; ESLint on the changed files and `pnpm run lint:translations` clean. Repository-wide `pnpm run lint` still reports pre-existing errors in unrelated workspace files. Nothing was pushed to any remote.
- **Known upstream issue**: `installFirmwarePackage` ignores the upload result and `checkOtaPackage` / `startOtaUpdate` swallow device errors, so a failed firmware update can still report "update complete". A failed update check is also shown as "already up to date". Not fixed here — the merge was kept faithful to upstream.

### 2026-08-14 — Fix settings battery display

- **Type**: Fix
- **Changes**: Settings now reads the live battery percentage from the camera store and shows the disconnected state instead of a hardcoded `92%` when no camera is connected.
- **Files**: `src/features/settings/settings-screen.tsx`
