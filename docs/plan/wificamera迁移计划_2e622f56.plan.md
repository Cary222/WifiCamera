---
name: WifiCamera迁移计划
overview: 将 skysense-app 改造为 WiFi 天文相机应用，迁移旧版 WifiCameraAPP 的服务层代码（HTTP API、WebSocket、设备通信），同时根据新需求调整功能模块。项目名称改为 wificamera，保持现有 feature-first 架构不变。
todos:
  - id: phase0-config
    content: "Phase 0: 项目名称与配置改造 (env.ts, app.config.ts, .env, package.json)"
    status: completed
  - id: phase1-services
    content: "Phase 1: 创建相机服务层 (types, config, client, file/startup/ota/ws services)"
    status: in_progress
  - id: phase1-store
    content: "Phase 1.8: 创建 Camera Store (Zustand) 和 CameraContext"
    status: pending
  - id: phase2-camera
    content: "Phase 2.1: 创建 camera feature (拍摄主页面 + 组件)"
    status: pending
  - id: phase2-album
    content: "Phase 2.2: 创建 album feature (相册 + 下载)"
    status: pending
  - id: phase2-settings
    content: "Phase 2.3: 扩展 settings feature (WiFi密码 + OTA + 关于)"
    status: pending
  - id: phase2-routes
    content: "Phase 2.4: 改造 app 路由 (替换 tab 内容)"
    status: pending
  - id: phase3-stellarium
    content: "Phase 3: 添加深空星图功能 (Stellarium WebView 集成)"
    status: pending
  - id: phase4-verify
    content: "Phase 4: 逐步验证迁移可行性"
    status: pending
isProject: false
---

# WifiCamera App 迁移计划

## 项目概览

| 维度 | 当前 (skysense-app) | 目标 (WifiCamera) |
|------|---------------------|-------------------|
| 定位 | 气象/空气质量监测 | WiFi 天文相机控制 |
| 相机通信 | 无 | WebSocket + HTTP (192.168.1.1:8999) |
| 核心功能 | Dashboard/Weather/Profile | 拍摄/相册/设置 |
| 状态管理 | Zustand + MMKV | Zustand + MMKV (保留) |
| 架构 | Feature-first | Feature-first (保留) |

---

## Phase 0: 项目名称与配置改造

### 0.1 修改 `env.ts`

变更 `NAME = 'WifiCamera'`，`SCHEMES` 改为 `wificameraApp/wificameraApp.preview`，`BUNDLE_IDS` 改为 `com.wificamera.*`。

```typescript
const NAME = 'WifiCamera';
const BUNDLE_IDS = {
  development: 'com.wificamera.development',
  preview: 'com.wificamera.preview',
  production: 'com.wificamera',
};
const SCHEMES = {
  development: 'wificameraApp',
  preview: 'wificameraApp.preview',
  production: 'wificameraApp',
};
```

### 0.2 修改 `app.config.ts`

将 `name`、`description`、`slug`、`scheme`、`bundleIdentifier`、`package` 等所有出现 "skysense" 的地方改为 "wificamera"。

### 0.3 修改 `.env`

`EXPO_PUBLIC_NAME=WifiCamera`, `EXPO_PUBLIC_SLUG=wificamera`, `EXPO_PUBLIC_API_URL=http://192.168.1.1:8999/api`（相机 API 地址）。

### 0.4 修改 `package.json`

`name: "wificamera-app"`, `repository.url` 更新。

### 0.5 修改 `eas.json`

Bundle ID / package 引用改为 `com.wificamera.*`。

### 0.6 修改 `app/icon.png` 和 `app/splash-icon.png`

更新图标资源为 WifiCamera 品牌标识（占位，待替换）。

---

## Phase 1: 创建相机服务层 (Core Service Migration)

在 `src/lib/camera/` 下创建新的服务层，完全继承旧版 WifiCameraAPP 的服务逻辑。

### 1.1 类型定义 — `src/lib/camera/types.ts`

```typescript
// 相机状态
type CameraStatus = 'idle' | 'in_repeat' | 'in_streaming' | 'in_exposure';

// 长曝光预设配置
interface LongExposureConfig {
  id: number;
  name: string;
  exposure_time: number;
  gain: number;
  repeat?: number;
}

// 设备信息
interface DeviceSerial { SN: string; magic: string; hardware: string; }
interface DeviceVersion { server: string; hardware: string; }

// 拍摄状态
interface ExposureState {
  camera_status: CameraStatus;
  current_mode_number: number;
  long_exposure_config_list: LongExposureConfig[];
  long_exposure_current_config: LongExposureConfig | null;
  save_image: boolean;
  last_image_path: string;
  streaming_in_progress: boolean;
}

// 文件/相册相关
interface PicFolder { name: string; path: string; }
interface PicFile { name: string; path: string; size: number; }
interface MP4File { name: string; path: string; size: number; }
```

### 1.2 网络配置 — `src/lib/camera/config.ts`

```typescript
// 相机设备地址（可配置）
const DEVICE_BASE_URL = 'http://192.168.1.1:8999';
const OTA_BACKEND_URL = 'http://170.106.80.91:7788';
const STREAM_URL = 'http://192.168.1.1:8889/cam0';
const WS_URL = 'ws://192.168.1.1:8999/ws/device/';

export const CAMERA_ENDPOINTS = {
  // FileCopy
  listPicFolders: '/FileCopy/list_pic_folders/',
  listPicFiles: '/FileCopy/list_pic_files/',
  getImage: '/FileCopy/get_image/',
  askJpgStretch: '/FileCopy/ask_jpg_stretch/',
  uploadFitsJpeg: '/FileCopy/upload_fits_jpeg/',
  delMp4: '/FileCopy/del_mp4/',
  delDir: '/FileCopy/del_dir/',
  listMp4: '/FileCopy/list_mp4/',
  getMp4: '/FileCopy/get_mp4/',
  power: '/FileCopy/power/',
  getDisks: '/FileCopy/get_disks/',
  getDiskUsage: '/FileCopy/get_disk_usage/',
  
  // StartUp
  getVersion: '/StartUp/GetVersion/',
  getSerial: '/StartUp/Serial/',
  changeWifiPassword: '/StartUp/ChangeWifiPassword/',
  updateTime: '/StartUp/UpdateTime/',
  
  // OTA
  checkPackage: '/OTAUpdate/check_package/',
  startUpdate: '/OTAUpdate/start_update/',
  uploadFile: '/UploadFile/update_ota_tar/',
};

export { DEVICE_BASE_URL, OTA_BACKEND_URL, STREAM_URL, WS_URL };
```

### 1.3 HTTP 客户端 — `src/lib/camera/client.ts`

基于旧版 `request.ts`，使用 axios 封装。适配 Expo 环境（非 Capacitor）。

```typescript
import axios from 'axios';
import { DEVICE_BASE_URL } from './config';

const client = axios.create({
  baseURL: DEVICE_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json;charset=UTF-8' },
});

client.interceptors.response.use((response) => response.data, (error) => Promise.reject(error));

export default client;
```

### 1.4 文件服务 — `src/lib/camera/file-service.ts`

迁移旧版 `api.ts`，封装所有 `/FileCopy/*` 接口：
- `listPicFolders()`, `listPicFiles(source_dir)`
- `getImage(file_path)` — 返回 base64 data URI
- `askJpgStretch(fits_name)` — FITS → JPG 拉伸
- `deleteMp4()`, `deleteDir()`
- `listMp4()`, `getPower()`, `getDisks()`, `getDiskUsage()`
- `uploadFitsJpeg(file, fitsName)` — multipart 上传

### 1.5 启动服务 — `src/lib/camera/startup-service.ts`

迁移旧版 `start_up.ts`:
- `getVersion()` → 获取固件版本
- `getSerial()` → 获取设备序列号
- `changeWifiPassword(password)`
- `updateTime(time, time_zone)` — 时间同步

### 1.6 OTA 服务 — `src/lib/camera/ota-service.ts`

迁移旧版 `ota.ts`:
- `checkPackage(filename)` → 相机端检查 OTA 包
- `startUpdate(filename)` → 启动 OTA 更新
- `getOtaInfo(filename)` → OTA 后端查询新版本
- `checkDeviceLock(serial_number)` → 设备锁检查
- `reportPiracy(...)` → 盗版上报

### 1.7 WebSocket 服务 — `src/lib/camera/ws-service.ts`

迁移旧版 `websocket.tsx` + `websocketProvider.tsx` 的核心逻辑到 React Native：

```typescript
// 支持 JSON 控制命令和二进制帧（4字节长度头）
// 相机指令：start_exposure, start_exposure_repeat, abort_exposure,
//          set_gain, set_stretch, start_streaming_exposure,
//          streaming_start_save, stop_streaming, 
//          change_streaming_setting, get_camera_status, get_repeat_count

// WebSocket 消息格式：
// 发送: JSON { device_name, instruction, params, id }
// 接收: JSON { device_name, instruction, data/success } + 二进制帧
```

### 1.8 相机 Store — `src/lib/camera/camera-store.ts`

迁移旧版 easy-peasy `consoleModel` + `ProcessDataSaveStore` → Zustand：

```typescript
// 状态：
// - camera_status: CameraStatus
// - exposure_config_list: LongExposureConfig[]
// - current_config: LongExposureConfig
// - streaming_in_progress: boolean
// - power, in_charge, disk (used/all space)
// - newest_jpg_url, newest_stream_jpg_url
// - connection_status: 0|1|2 (未连接/连接中/已连接)

// 方法：
// - setCameraStatus, updateConfig, loadFromStorage
// - setGain, setExposure, startExposure, stopExposure
// - startStreaming, stopStreaming
```

---

## Phase 2: Feature 模块改造

### 2.1 `src/features/camera/` — 拍摄核心功能

**保留现有路由结构**，替换 dashboard 内容：

```
src/features/camera/
├── camera-screen.tsx         # 主拍摄页面（替换 dashboard-screen.tsx）
├── components/
│   ├── exposure-controls.tsx  # 曝光/增益/拉伸滑条
│   ├── mode-selector.tsx      # RAW / STREAM / PICTURE 模式选择
│   ├── countdown-display.tsx  # 倒计时/进度圈
│   ├── preset-wheel.tsx       # 预设转盘 (Saturn/Jupiter/Moon/Nebula)
│   └── preview-area.tsx       # 相机预览 / WebRTC 预览
├── hooks/
│   └── use-camera-store.ts    # Zustand store (Phase 1.8)
└── services/                   # 链接到 src/lib/camera/
```

**三种拍摄模式**:
- **RAW 模式 (mode=0)**: FITS 长曝光，预览最新 JPG，支持 repeat 连拍
- **STREAM 模式 (mode=1)**: WebRTC 实时预览，日间录制视频
- **深空模式**: 新需求，需要集成 Stellarium 星图 (Phase 3)

### 2.2 `src/features/album/` — 相册功能

迁移旧版 Picture 相关功能：

```
src/features/album/
├── album-screen.tsx           # 相册主页面
├── components/
│   ├── folder-list.tsx        # 文件夹列表
│   ├── image-grid.tsx         # FITS/MP4 网格预览
│   ├── image-viewer.tsx       # 全屏图片查看器 (支持 pinch/pan)
│   └── download-progress.tsx   # 下载进度弹窗
└── hooks/
    └── use-album-store.ts     # Zustand store (图片列表、选中状态)
```

### 2.3 `src/features/settings/` — 设置功能

**增强现有 settings feature**，迁移旧版 Settings/OTA 功能：

```
src/features/settings/
├── settings-screen.tsx         # 主设置页
├── screens/
│   ├── wifi-password-screen.tsx    # WiFi 密码修改 (StartUp API)
│   ├── ota-screen.tsx             # OTA 更新页面
│   └── about-screen.tsx           # 设备信息 (版本/序列号)
└── components/
    └── ota-update-dialog.tsx      # OTA 更新弹窗
```

### 2.4 路由改造 — `src/app/`

**保持现有路由架构不变**，替换 `(app)/` tab 内容：

```typescript
// (app)/_layout.tsx → 替换底部 tab 为:
// - Feed → 📷 拍摄 (camera feature)
// - Weather → 🖼️ 相册 (album feature)  
// - Profile → ⚙️ 设置 (settings feature)

// 新增深空模式路由:
device-setup/ → 保留（设备连接向导）
添加: (app)/deep-space.tsx → 深空拍摄 + Stellarium 星图
```

### 2.5 全局 Context — `src/lib/camera/camera-context.tsx`

```typescript
// CameraContext.Provider 包裹整个 App
// 持有: camera_store, ws_service, current_ra_dec(深空解析坐标)
// DeepSpaceScreen 通过此 Context 接收相机状态和 Stellarium 控制
```

---

## Phase 3: 新增功能 — 深空星图 (参考需求文档)

### 3.1 Stellarium 集成架构

```
src/
├── assets/stellar/
│   ├── index.html              # HTML 壳 + postMessage 处理
│   ├── stellarium-web-engine.js # 编译产物 (WASM)
│   ├── stellarium-web-engine.wasm
│   └── data/                   # 星表数据
├── components/stellar/
│   ├── StellariumView.tsx      # WebView 封装
│   └── StellariumOverlay.tsx    # 深空页覆盖层
└── services/
    └── StellariumService.ts     # postMessage TS 封装
```

### 3.2 DeepSpaceScreen

在 `(app)/` 下新增深空路由，三种视图状态：
- `shooting`: 相机预览 + 曝光/增益控件
- `stellarium`: 全屏星图覆盖层
- `plan`: 拍摄计划

**底部操作栏**: `[🔭 解析] [🌐 星图] [📋 计划]`

### 3.3 WebView 配置

```typescript
// iOS: allowUniversalAccessFromFileURLs=true
// Android: allowFileAccess=true, androidLayerType="hardware"
// 平台选择 HTML 源路径
```

---

## Phase 4: 逐步验证计划

| 阶段 | 验证点 | 验证方式 |
|------|--------|----------|
| Phase 0 | 项目名称、Bundle ID、scheme 正确 | `expo-doctor` + 编译检查 |
| Phase 1.1-1.6 | HTTP API 可调用 | 模拟/真实相机测试 |
| Phase 1.7 | WebSocket 连接成功 | 连接状态 → 2 (已连接) |
| Phase 1.8 | 状态管理正常 | Zustand DevTools |
| Phase 2.1 | 拍摄指令发送/接收正常 | 相机响应验证 |
| Phase 2.2 | 相册列出文件 | 实际文件夹内容对比 |
| Phase 2.3 | OTA 包上传成功 | check_package 返回正确 |
| Phase 3 | WebView 渲染星图 | 真机测试 |
| Phase 3 | RA/Dec 跳转 | 解析后星图自动指向 |

---

## 架构图

```mermaid
flowchart TB
    subgraph "App Layer (Expo Router)"
        A[(app) tabs] --> B[拍摄]
        A --> C[相册]
        A --> D[设置]
        B --> E[DeepSpace 星图]
    end
    
    subgraph "Feature Modules"
        B --> F[camera-screen.tsx]
        C --> G[album-screen.tsx]
        D --> H[settings-screen.tsx]
        E --> I[StellariumOverlay]
    end
    
    subgraph "Camera Context"
        J[CameraContext] --> K[Zustand Store]
        J --> L[WS Service]
    end
    
    subgraph "Service Layer (src/lib/camera/)"
        M[client.ts HTTP]
        N[file-service.ts]
        O[startup-service.ts]
        P[ota-service.ts]
        Q[ws-service.ts]
    end
    
    subgraph "Hardware (WiFi Camera)"
        R["192.168.1.1:8999"]
        S["192.168.1.1:8889 WebRTC"]
    end
    
    F --> J
    G --> N
    H --> O
    H --> P
    L --> R
    F --> S
    M --> R
    N --> R
    O --> R
    P --> R
    I --> L
```

---

## 关键约束

- **不修改** `src/app/` 的路由架构（保持 `_layout.tsx`, `(app)/`, `onboarding.tsx`, `login.tsx` 结构）
- **不修改** `src/components/ui/` 的基础组件库
- **不修改** Expo 配置插件和原生配置
- **只使用** pnpm（不切换包管理器）
- 所有新代码使用 `@/` 路径别名
- i18n key 添加到 `translations/en.json`, `zh.json`, `ar.json` 三处