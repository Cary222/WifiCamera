# App 集成进度记录

## 相册模块选择性集成 — 已完成（2026-08-12）

- 来源：服务器 `origin/main` 提交 `16b7ebc`（`feat(album): 重构相册模块——folder 层级展示与文件夹磁贴`）。
- 已导入：相册存储卡、按日期分组、三列文件夹磁贴、折叠分组、错误态、mock 数据与相册资源；相册路由及根 `SafeAreaProvider` 同步更新。
- 为避免与并行开发的风景模式冲突，**未导入、未修改**远程提交中的 `camera-store.ts` 与 `websocket-service.ts`，以及任何 `landscape/**` 文件。
- 修复离线加载：Android 无法访问板端相册 HTTP 接口时，若请求在 2.5 秒内未完成，立即显示 mock 相册，不再无限停留在加载占位符。
- **板端协议修正**：实测 `http://192.168.1.1:8999/FileCopy/list_pic_folders/` 在 2026-08-12 返回 `data.dirs`（含 10 个真实目录，约 0.3 秒响应），而旧代码只读取 `data.pic_folders`，导致真实目录被忽略并回退 mock。现已兼容 `dirs` 与旧 `pic_folders`，并支持 `YYYY-MM-DD` 日期目录、`full_path`、`pic_num`。
- 验证：`pnpm run type-check` 通过；相机相关 4 个测试套件、33 项测试通过。

### 板端电池最新服务部署（2026-08-13）

- 抽取并同步服务器 `new_wificamera_sdk/test/net_server_test` 今日最新提交 `fa43708`（`feat: SOC 查表换成 600mA 放电曲线 11 点`），替换原来的 5 点估算表，电量映射更精准。
- 解决串口冲突：停止重复占用 `/dev/ttyS1` 的临时 dump，统一由 `battery_httpd` 接收 MCU 查询并自动回复 `A5 5A 81 01 <pct> <XOR>` 应答帧。
- 解决服务自启：已配置 `/etc/init.d/S99battery_httpd`，开机自动拉起电池守护进程。
- 解决 SIGHUP 被杀：程序已做 `SIGHUP` 屏蔽，常驻运行不崩溃。
- 板端实测：
  - `/dev/ttyS1` 独立独占接管，UART 串口双向收发成功。
  - HTTP `8999/FileCopy/power/` 接口返回真实换算电量 `97% ~ 98%`。
- 未修改任何风景模式文件。

### 首页真实剩余存储空间（2026-08-12）

- 首页设备已连接状态接入与相册相同的板端 `GET /FileCopy/get_disk_usage/` 接口；连接成功后读取 `free`（无 `free` 时以 `total - used` 兜底）并显示为“剩余空间”。
- 已确认当前板端接口数值单位为 GB，首页不再按 bytes 二次换算。
- MuMu 实机验证：首页显示 **16.8GB**，与板端实测 `free: 16.7913 GB` 四舍五入一致。
- 未修改风景模式文件。
- 验证：`pnpm run type-check` 通过；相关测试 4 个套件、33 项通过。

### 星云模式第一版（2026-08-12）

- 新增 `src/features/home/camera/nebula/`，通过 `/camera?mode=nebula` 进入；首页「星空模式」卡片改为跳转该页面（原先跳深空 Tab）。
- 参考 `hjc_app_server_f8be5fd/app.js` 的 `startNebulaCapture()`：拍照下发板端 `nebula_capture [曝光, 增益, 张数, 间隔]`，不使用 `start_exposure`；拍摄期间按 `camera_state` 的 busy 状态与最新成品路径收尾，并按曝光时长设置兜底超时。
- 页面按设计图实现：全屏预览、返回、星空模式胶囊、解析入口、对焦辅助开关、圆形快门、底部最新成品缩略图、拍照/视频分段控件、功能菜单。
- 视频录制复用已验证的 `streaming_start_save` / `streaming_stop_save`，录像态快门显示红色方块。
- 参考项目中不存在星云「解析」实现，因此解析与功能菜单仅保留 UI 占位并提示暂未开放，不接未验证接口。
- 未修改 `landscape/**`、WHEP 服务、`native-camera-preview.tsx` 与 `camera-store.ts`。
- 验证：`pnpm run type-check` 通过；相机/相册 4 个测试套件、33 项测试通过；MuMu 实机确认页面显示与预览正常。

### 星云模式参数/工具面板（2026-08-12）

- 面板调出逻辑与风景模式完全一致：顶部「星空模式」胶囊的箭头只切换面板类型（向下＝参数面板，向上＝工具面板），右下角菜单按钮才负责开合；面板打开时快门隐藏，菜单按钮高亮为品牌绿。
- 参数面板：白平衡 / 快门 / 增益 / EV 四张卡片 + 复用风景模式的 `LandscapeRuler` 刻度尺，卡片显示当前值。
- 工具面板：自动拉伸（关闭/开启分段控件 + 实时增强预览说明）与定时拍摄 / 倒计时 / 画幅 / 水印四张工具卡。
- 本轮为界面与交互实现，参数暂未下发板端指令；星云曝光/增益的板端写入口径待确认后再接。
- 未修改 `landscape/**`、WHEP、`camera-store.ts` 等风景模式文件，仅只读复用刻度尺组件。
- 验证：`pnpm run type-check` 通过；MuMu 实机确认参数面板与工具面板均可正常调出与切换。

### 星云模式工具项功能化与板端口径对齐（2026-08-12）

- 已拉取服务器 `~/work/company/new_wificamera_sdk/test/hjc_app`（提交 `f8be5fd`，最新 `app.js`）与 `net_server_test/src` 源码逐项核对：
  - **自动拉伸（`set_stretch`）**：板端 `command_dispatcher.c:1910` 走 `params_get_number` 解析 `flag_f`，传 JS 布尔会被判为 `INVALID_PARAM`；现已修正为下发数字 `[1]` / `[0]`。板端源码（`camera_photo.c:300`）确认 `stretch_flag` 只作用于 `exposure_generate_jpg`（拍照成片生成），不影响实时预览，故说明文案更正为「拍照成片自动拉伸」。
  - **定时拍摄（`nebula_capture`）**：与网页端 `startNebulaCapture()` 保持完全一致：
    - 单拍（count=1）：下发 `nebula_capture [曝光, 增益, 1, 0]`，走单张 photo task；取消使用板端 `abort_exposure`（`camera_task_queue.c:331`）；收到首张图片即可结束。
    - 连拍（count>1）：下发 `nebula_capture [曝光, 增益, count, interval]`，板端走 `camera_service_start_exposure_repeat` 编排；取消下发 `stop_exposure_repeat`；超时按 `count × (曝光 + 8s) + 间隔 × (count - 1) + 20s` 计算（对齐网页端 `shootWaitMs`），不会因单张图片到达而误提前结束。
  - **倒计时**：纯前端调度，归零后按上述逻辑下发 `nebula_capture`。
  - **画幅**：4:3 / 16:9 切换实际裁切取景框，顶部留白比例对齐风景模式。
  - **水印**：与风景一致的前端预览叠加，关闭即移除。
- 顶部导航优化：字号缩小至 11pt，返回/模式/解析采用等宽三栏布局，「星空模式」精确居中，全套控件锚定 `previewTop` 落在推流画面内部。
- 工具/参数面板字号与卡高对齐风景模式既有口径（标签 12pt、数值 17pt、工具卡高 92pt、参数卡高 80pt）。
- 未修改 `landscape/**`、`camera-store.ts`（本轮仅自持 `sendCommand`）、WHEP、`native-camera-preview.tsx`。
- 验证：`pnpm run type-check` 通过；MuMu 实机确认顶部居中、工具面板文案、刻度尺、倒计时读秒与水印均正常（截图 `D:\app\nebula-board-align-*.png`）。

### 星云拍照成片回显修复（2026-08-13）

拍照能存进相册、左下角有预览缩略图，本轮修复了三处会让缩略图永远空白的问题：

- **取图接口用错**：缩略图原走 `POST /FileCopy/get_image/`，实测当前固件返回 **404**；改用相册已验证的 `GET /get_image?path=`（实测 200 / 33267 字节）。
- **成片路径拿不到**：原调 `get_last_image`，但板端该指令走 `COMMAND_DISPATCHER_BINARY_OK` 直接回二进制文件、JSON 里 `data:null`，永远不含路径。改为按网页端 `startNebulaCapture()` 的收尾方式读 `camera_state.last_result.jpg_path`；因长曝光期间控制 socket 常断开且板端曝光结束后仍需写盘，收尾追加 6 次 × 1.5s 轮询。
- **FITS 不可显示**：`last_result.jpg_path` 对星云成片回填的是 `.fits`（板端 `camera_photo.c` 先写 FITS，再派生 `_preview.jpg`），直接拿去显示必然失败；现映射为同目录的 `<name>_preview.jpg`。
- 另外补了进入页面时主动拉一次 `camera_state`（store 仅在 socket 建连时拉过一次，后进页面会一直空白），并让缩略图可点击跳转 `/album`。

实机验收（MuMu + 板端 `SC311-1234567`）：

- 拍照存盘：`/mnt/sdcard/Pictures/2026-08-13/S_nebula_capture_nebula_LIGHT_5_100_0_..._2_preview.jpg`，`/list_images` 可见。
- 缩略图：Glide 日志 `Finished loading BitmapDrawable ... get_image?path=..._preview.jpg with size [168x169]`，加载成功。
- 点击缩略图进入相册：8月13日分组显示该张 `S_nebula...`，时间 18:08，存储卡 12.3 GB / 29.1074 GB。
- 注：该成片视觉上为纯灰，是板端遮光下的真实曝光结果（直接下载原图核对一致），非加载失败。

未修改 `landscape/**`、`camera-store.ts`、WHEP、`native-camera-preview.tsx`。验证：`pnpm run type-check` 通过。

### 相册图片全屏预览（2026-08-12）

- 参考网页端 `openAlbumItem()`：真实图片磁贴可点击打开全屏预览，使用板端同款 `/get_image?path=...` 原图 URL；预览保留完整画幅（`contentFit="contain"`），顶部显示图片预览与板端路径，并提供关闭按钮。
- 图片预览含加载中与加载失败状态。视频磁贴保留不可点击，避免在未实现原生视频播放前伪造功能。
- 为当前真实媒体模型补齐 `path`、`mediaType`、`previewUrl`；mock 数据保持兼容。
- MuMu 实机验证：点击 2026-08-11 的真实图片后，已成功加载全屏原图预览。
- 未修改 `src/features/home/camera/landscape/**`、WHEP、camera store 或 WebSocket 服务。
- 验证：`pnpm run type-check` 通过；相册/相机相关 4 个测试套件、33 项测试通过。

### 相册真实板端媒体与存储集成（2026-08-12）

- 参考 `D:\shixi2\重构\hjc_app_server_f8be5fd\app.js` 的 `syncBoardAlbum()`，将 App 相册内容源从目录汇总接口切换为网页端同款的 `GET /list_images` 与 `GET /list_videos?prefix=`。
- 实测板端接口正常：`/list_images` 返回真实 JPG/PNG 与文件路径、大小、mtime；`/list_videos` 返回真实 MP4；FITS/XYLS 数据文件已过滤，不会作为不可预览磁贴展示。
- 相册按真实文件路径/mtime 解析日期并以最新日期置顶；同一日期下显示真实图片和录像数量，不再把一个目录伪装成一个项目。
- 照片磁贴使用板端 `/get_image?path=...` 真实缩略图 URL；视频磁贴请求同名 `_thumb.jpg`，失败时保留安全占位。
- 存储卡改读 `/FileCopy/get_disk_usage/`。已确认当前板端返回的 `used/total/free` 单位是 GB，故直接显示（实测 12.3161 GB / 29.1074 GB），不再错误按 bytes 二次换算。
- MuMu 实机验证：相册显示真实板端数据，包括 2026-08-12 的录像和 2026-08-11 的真实图片条目；存储卡显示 12.3 GB / 29.1074 GB。
- 未修改 `src/features/home/camera/landscape/**`、WHEP、camera store 或 WebSocket 服务。
- 验证：`pnpm run type-check` 通过；相册/相机相关 4 个测试套件、33 项测试通过。

### 相册日期排序修复（2026-08-12）

- **问题**：板端目录按返回顺序渲染，旧日期排在前面，新拍内容落到底部。
- **修复**：日期目录统一提取为 ISO 排序键 `YYYY-MM-DD`（同时兼容旧固件紧凑日期），按降序排序后再转换为中文显示日期；最新日期始终置顶。
- 未修改任何风景模式文件。
- 验证：`pnpm run type-check` 通过；相关测试共 33 项通过。

---

## 阶段 0：原生构建打通 — 已完成（2026-08-11）

### 交付

| 项目 | 结果 |
|---|---|
| `react-native-webrtc` | `^124.0.8` |
| `@config-plugins/react-native-webrtc` | 已装（devDependency），已接入 `app.config.ts` |
| prebuild | 完成，`android/` 已更新 |
| APK | `android/app/build/outputs/apk/debug/app-debug.apk`（103 MB） |
| ABI | `x86_64`（模拟器所需） |
| WebRTC 原生库 | `lib/x86_64/libjingle_peerconnection_so.so` |
| 安装 | MuMu `127.0.0.1:7555` 成功 |

### 验收证据

App 启动后 logcat：

```text
NativeLibrary: Loading native library: jingle_peerconnection_so
PeerConnectionFactory: PeerConnectionFactory was initialized
EglBase14Impl: Using OpenGL ES version 2
```

原生 WebRTC 栈可用，EGL 渲染上下文正常。

界面截图：`D:\app\app_stage0.png`，深空页显示"相机预览区域"占位符（阶段 2 的落点）。

### 踩坑记录

**1. Android Studio 自带 JBR 是 JDK 25，Kotlin 编译器解析不了**

```text
java.lang.IllegalArgumentException: 25.0.2
  at JavaVersion.parse(JavaVersion.java:307)
```

报错信息极具误导性，看起来像 NDK 版本问题，实为 JDK 版本号解析失败。

解决：改用 `D:\app\jdk17\jdk-17.0.2`。

构建命令：

```bash
cd D:/app/WifiCamera/android
JAVA_HOME="D:/app/jdk17/jdk-17.0.2" \
ANDROID_SDK_ROOT="D:/app/AndroidSDK" \
ANDROID_HOME="D:/app/AndroidSDK" \
./gradlew assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon
```

**2. `build.bat` 不能用于自动化**

它会拉起交互式 shell，导致命令看似成功（exit=0）实则未执行。直接用环境变量前缀调用 `gradlew`。

**3. Git Bash 路径转换**

`adb shell` / `adb pull` 涉及 `/sdcard/...` 时会被改写成 `D:/Git/sdcard/...`。所有 adb 命令需加 `MSYS_NO_PATHCONV=1`。

### 环境备注

- 板端二进制：`ddbf8e15ffa44f93b1e67baa50939d73`（commit `d762976` 干净构建）
- 板端 RTSP 断流已修复：实测连续 75 秒无中断，1936×1100
- `android/` 备份：`android.bak_before_webrtc_prebuild`
- Metro：`npx expo start --dev-client --port 8081` + `adb reverse tcp:8081 tcp:8081`

### 遗留

`@config-plugins/react-native-webrtc` 默认注入 `CAMERA` 与 `RECORD_AUDIO` 权限。本应用只做接收播放，不采集音视频。已在 `app.config.ts` 关闭插件的权限选项，但 Manifest 仍有残留，待阶段 2 验证预览可用后再收敛，避免同时改动多个变量。

---

## 阶段 1：协议与状态对齐 — 已完成（2026-08-11）

### 交付

- 新增 `src/features/home/camera/services/board-protocol.ts`：集中定义网页已使用的板端指令、`camera_state` 结构与响应类型。
- 扩展 `camera-store.ts`：
  - 覆盖状态/保活、推流、风景拍照、曝光、录像、SER 等 20 条网页端指令；
  - 增加 `camera_state` 权威状态同步、命令错误记录、5 秒心跳、断线重连后的状态重拉；
  - 保持原有 UI 与组件调用接口兼容，不改变界面。
- 新增 `docs/BOARD_PROTOCOL.md`：以板端 `d762976` 的 `command_map.c` / `command_dispatcher.c` 为准，记录请求参数与返回字段。

### 模拟器验收

模拟器 App 实际日志：

```text
[CameraWS] connecting
[CameraWS] error
[CameraWS] closed
[CameraWS] connecting
[CameraWS] open
```

板端 `/proc/net/tcp` 同时出现 8999 的 `ESTABLISHED` 会话，确认 MuMu App 通过 `192.168.1.1:8999` 直连板端成功。

### 质量检查

```text
pnpm run type-check                    PASS
camera-store / websocket-protocol /
websocket-service 三组 Jest 测试     13/13 PASS
```

---

## 阶段 2：原生 WebRTC 预览 — 已完成（2026-08-11）

### 交付

- 新增 `services/whep-service.ts`：原生 WHEP receive-only 客户端。
  - 创建 `RTCPeerConnection` 与 video `recvonly` transceiver；
  - 等待 ICE gathering 完成后 POST SDP offer 到 `http://192.168.1.1:8889/cam0/whep`；
  - 接收 answer 后过滤 `127.0.0.1` loopback 候选，保留板端 `192.168.1.1` 候选；
  - 关闭时 best-effort DELETE WHEP session。
- 新增 `components/native-camera-preview.tsx`：使用 `RTCView` 在既有预览容器内渲染视频，不改变页面布局。
- `DeepSpaceScreen` 的原"相机预览区域"占位符替换为原生视频渲染；顶部、底部工具栏、样式、路由均未改动。
- 修正启动时序：等待控制 WebSocket `open` 后先发 `start_streaming_exposure ["auto"]`，等待 800 ms 后再协商 WHEP，避免 MediaMTX 先于 554 RTSP 启动而报 `connection refused`。
- 修正 WHEP URL 端口替换：由误请求 8999 修正为 8889。

### 模拟器验收

关键 logcat：

```text
[CameraWS] open
[CameraWHEP] http://192.168.1.1:8889/cam0/whep
rn-webrtc:pc:DEBUG setRemoteDescription OK
rn-webrtc:pc:DEBUG ontrack
```

- `RTCView` 在现有深空页预览区域渲染板端画面；
- 从完成 WHEP 协商开始持续观察超过 60 秒；
- 未出现 PeerConnection 关闭、`FATAL` 或 MediaMTX `error occurred` / `terminated`；
- 截图：`D:\app\app_webrtc_fixed.png`、`D:\app\app_webrtc_60s.png`。

> 画面偏暗来自板端当前自动曝光实拍，不是 RTCView 占位或连接失败；视频轨已真实渲染。

