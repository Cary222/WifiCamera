# Bug #14 (P1-11 / Key: 36464095868b96e9)：相册视频播放与行星 SER 文件下载实机复现、踩坑记录与验证报告

---

## 一、问题背景与任务概览

- **问题编号**：`#14 (P1-11)` / 关联需求 `#9 (P1)` / Bug Key: `36464095868b96e9`
- **任务目标**：在 App 相册中支持录像视频（MP4）与行星 RAW 视频（SER）的列表检索、MP4 本地点播/存相册、以及 SER 原始科学文件的下载与系统级分享。
- **硬件与测试环境**：
  - 相机硬件：Rockchip RV1103B WifiCamera 真实开发板（MAC: `88:49:2d:54:95:7c`，序列号: `c537ff995f2c988e`）
  - 固件版本：`WifiCamera.0.0.29`（内核支持 exFAT，服务端口 `8999`，宿主机端口映射 `18999`）
  - 存储介质：SanDisk 32GB MicroSDHC/TF 卡（单分区 `mmcblk1p1`，已格式化为 exFAT）
  - 客户端：iOS 客户端（真机环境 + iOS 模拟器 iPhone 16e，iOS 18.2）
  - 自动化工具：`agent-device`（会话 `album-ios`）、Jest 测试框架、ESLint、TypeScript Compiler

---

## 二、初始现象复现与痛点分析

### 1. 历史现象复现

在修复前，用户进入 App「相册」页面时：

1. **视频与 SER 完全隐形**：相册仅通过 `/list_images`（或旧版 `/FileCopy/list_pic_folders/`）检索 `/mnt/sdcard/Pictures/` 目录下的 JPG/FITS 照片；而用户录制的 MP4 录像和行星高速连拍生成的 SER 序列存放在 `/mnt/sdcard/Videos/`，相册界面完全不展示视频内容。
2. **缺乏分类切换能力**：相册 UI 仅为单一瀑布流照片网格，没有区分照片与视频/原始文件的维度。
3. **SER 文件处置空白**：由于 SER 格式为天文专业 RAW 视频（无常规音视频编码头，包含 178 字节 SER 文件头 + 逐帧 RAW 数据），手机系统自带播放器无法解码播放。若贸然尝试调用播放器播放，将导致播放器崩溃或黑屏报错。

### 2. 原始接口探测

在固件端进行 HTTP 接口调用测试：

```bash
# 1. 尝试以 videos 作用域请求旧图片接口 -> 报错
curl -s "http://127.0.0.1:18999/list_images?scope=videos"
# 返回: {"ok":false,"error":"invalid_scope"}

# 2. 调用 0.0.29 固件新增的录像与 SER 接口 -> 成功返回
curl -s "http://127.0.0.1:18999/list_videos"
# 返回: {"ok":true,"latest":{"path":"/mnt/sdcard/Videos/app_landscape_sample.mp4",...},"videos":[...]}

curl -s "http://127.0.0.1:18999/list_videos?kind=ser&offset=0&limit=40"
# 返回: {"ok":true,"kind":"ser","total":2,"videos":[{"name":"test_planet.ser","path":"/mnt/sdcard/Videos/test_planet.ser","downloadable":true,...}]}
```

---

## 三、固件协议对齐与产品约束边界

根据部门跨端协同决议与天文设备业务属性，严格划定 App 端的功能边界：

| 介质类型 | 固件端存放路径 | 列表索引接口 | 播放支持 | 下载 / 导出支持 | 删除按钮 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **照片 (JPG/FITS)** | `/mnt/sdcard/Pictures/` | `GET /list_images` | 预览图 + 全屏查看大图 | 导出至系统相册（带持久化水印） | 具备 |
| **录像 (MP4)** | `/mnt/sdcard/Videos/*.mp4` | `GET /list_videos` | 支持全屏 HTML5 播放器点播 | 保存至系统相册、系统分享 | 具备 |
| **行星原始数据 (SER)** | `/mnt/sdcard/Videos/*.ser` | `GET /list_videos?kind=ser` | **严禁播放**（不调用系统/第三方播放器） | **仅支持下载**（通过原生 ShareSheet 存入“文件”或 AirDrop） | **无删除按钮**（保护原始科研数据） |

### 关键接口定义

1. **MP4 列表**：`GET /list_videos`
   - 返回 `videos` 数组，元素包含 `path`、`size`、`mtime`。
2. **SER 列表**：`GET /list_videos?kind=ser&offset=0&limit=40`
   - 支持分页与增量同步，返回字段包含 `name`、`path`、`size`、`mtime`、`downloadable`（布尔值，用于区分未收尾残损文件与正常文件）。
3. **视频点播流**：`GET /get_video?path=/mnt/sdcard/Videos/...`
   - 支持 HTTP 206 范围请求（Range Requests），支持流式快速起播。
4. **原始文件下载**：`GET /get_file?path=/mnt/sdcard/Videos/...`
   - 返回标准 `application/octet-stream` 二进制流。当文件正处于写入占用时返回 HTTP 409 BUSY。

---

## 四、实现架构与技术方案

### 1. 相册分段导航（SegmentedControl）

在 `album-screen.tsx` 顶部 `StorageCard` 下方引入分段控制器：

- 「照片」标签页：保留原有的日期分组网格、全屏图片预览与相册格式化功能。
- 「视频与SER」标签页：展示合并并按修改时间倒序排列的 MP4 录像与 SER 行星文件卡片列表。

### 2. 视频与 SER 卡片（VideoItemCard）

- **MP4 卡片**：左侧蓝色 `MP4` 徽标，展示文件名、录制时间与大小；右侧高亮 `▶` 播放按钮，点击拉起播放模态窗。
- **SER 卡片**：左侧浅绿 `SER` 徽标，展示文件名、时间与大小；右侧显示「下载」按钮（带下载进度菊花转圈）。若 `downloadable === false`，置灰展示「未收尾」，点击弹出防误触警示。

### 3. MP4 播放器模态窗（VideoPlayerModal）

- 采用 React Native `<WebView>` 封装沉浸式 HTML5 Video 控制层，实现无需额外编译第三方肥厚 C 库的原生级播放能力。
- 底部控制栏提供「保存到手机相册」（调用 `expo-media-library`）与「分享」（调用 `expo-sharing`）。

### 4. SER 文件安全流转

- 通过 `FileSystem.downloadAsync` 将文件稳定落盘至 App 临时缓存目录 `FileSystem.cacheDirectory`。
- 下载完成后调用 iOS `expo-sharing` 调起原生 `UIActivityViewController`，让用户自主保存到 iOS「文件」App、AirDrop 发送给 Mac 电脑、或通过微信/邮件外发。

---

## 五、关键踩坑记录与避坑指南

在本次联调与测试过程中，遇到了多个深层次技术卡点，均已彻底攻克并形成防御体系：

### 踩坑 1：Hermes 引擎无全局 `Buffer` 导致二进制流处理崩溃

- **现象**：在真机与 iOS 模拟器上，图片持久化水印合成或二进制数据处理时突发红屏错误：

  ```text
  ReferenceError: Property 'Buffer' doesn't exist
  ```

- **根本原因**：React Native 新架构默认采用的 Hermes 引擎是一个轻量级 JavaScript 引擎，原生并不挂载 Node.js 风格的全局 `Buffer` 对象，而诸多图片/流媒体辅助库（如 `jpeg-js`）在解码时默认假定存在 `Buffer`。
- **解决手段**：在水印和文件服务顶层增加严密的 Hermes 安全垫片注入：

  ```typescript
  // src/features/home/album/services/image-watermark-service.ts
  const bufferModule = require('buffer');
  if (!Reflect.get(globalThis, 'Buffer')) {
    Reflect.set(globalThis, 'Buffer', bufferModule.Buffer);
  }
  ```

  同时确保 `base64-js` 与 TypedArray 纯数组作为数据流载体，规避对 Node 环境的隐式依赖。

### 踩坑 2：未收尾（未停止录制）SER 文件的 409 死锁与 App 假死

- **现象**：当相机正在进行行星视频录制，或者设备遭遇异常掉电产生未收尾残损 SER 文件（如只有十几字节）时，若用户直接点击下载，固件返回 HTTP 409 BUSY 或 404；前端若无感知，下载动画会一直卡在 loading 状态，超时后抛出未经捕获的网络异常。
- **根本原因**：固件底层在写入 SER 时会对文件加上独占写锁（File Lock），且末尾的帧索引尚未写入完成；直接 `GET /get_file` 会被文件锁拦截。
- **解决手段**：
  1. **前端前置阻断**：在 `VideoItemCard` 中对 `item.downloadable !== false` 做显式状态判定。当固件标识该文件不可下载时，右侧按钮渲染为半透明「未收尾」，拦截点击事件并友好弹窗提示：
     > “文件尚未完成或不可用，请停止录制后刷新”
  2. **网络层异常精细化分类**：在 `downloadSerFile` 服务中针对 HTTP 409 状态码专门封装 `SER_NOT_FINALIZED` 错误，避免通用的“网络失败”误导用户。

### 踩坑 3：大文件下载 Base64 转换内存暴涨（OOM Crash）

- **现象**：SER 文件体积通常在数 MB 至数百 MB。若沿用照片下载时常用的 `readAsStringAsync(..., { encoding: 'base64' })` 方式在 JS 内存中转为 Data URI，iOS 客户端在解析数十兆的 Base64 字符串时会导致内存占用瞬间翻倍（3~4 倍膨胀），触发 iOS 系统 Jetsam 强杀（OOM 闪退）。
- **解决手段**：彻底重构下载路径。利用 `FileSystem.downloadAsync` 将 HTTP 流直接由原生线程写入本地沙盒文件路径（`file://...`），JS 运行时仅持有轻量的文件路径字符串句柄，实现真正的零内存拷贝流转。

### 踩坑 4：ESLint 规则与组件行数上限冲突

- **现象**：在完成功能初版后，执行 `pnpm run lint` 触发多项报错阻断：
  - `react-hooks-extra/no-direct-set-state-in-use-effect`：在 `useEffect` 中同步调用 `setState`。
  - `max-lines-per-function`：`AlbumScreen` 与 `use-storage-info.ts` 超过 200 行限制。
- **解决手段**：
  - 将 `AlbumScreen` 中的主体拆分为 `PhotoListSection`、`VideoListSection` 和子模块。
  - 将 `use-storage-info.ts` 中的异步查询解耦为纯函数 `queryStorageData` 和 `formatDiskInfo`，避免在 Effect 内部直接同步调用 `setState`，保证了规范一致性与高内聚。

### 踩坑 5：无 TF 卡状态下相册与首页剩余容量假阳性（残存 28.4GB）

- **现象**：当拔出 TF 卡时，由于旧代码在获取磁盘用量时调用了无参的 `/FileCopy/get_disk_usage/`，相机固件退回到查询主控 Linux 的根文件系统（rootfs，总容量 89MB，剩余 0.1GB），导致首页残存显示「0.1GB」或历史缓存数据「28.4GB」，给用户造成 TF 卡依旧在位的错觉。
- **解决手段**：在 `file-service.ts` 的 `getStorageStatus()` 中优先对接固件最新标准的 `/storage/status` 接口，根据 `mounted` 标志与 `camera_state.flags.storage_ready` 严格核验；无卡时强制清空容量并展示「未检测到TF卡」，同时在相册中禁用格式化按钮。

---

## 六、实机验证与测试数据记录

通过 `agent-device` 控制 iOS 模拟器（`iPhone 16e`）与真实开发板（`c537ff995f2c988e`）进行全路径联调验证：

### 1. 列表渲染与分段控制验证

- **操作**：打开 App -> 点击首页「相册」-> 点击顶部 SegmentedControl「视频与SER」。
- **实机抓取节点（Accessibility Snapshot）**：

  ```text
  @e11 [other] "照片"
  @e12 [other] "照片"
  @e13 [other] "视频与SER" [selected]
  @e14 [other] "SER, recording_unfinalized.ser, 2026-09-22 15:03:40 ·11 B, 未收尾"
  @e15 [other] "MP4, app_landscape_sample.mp4, 2026-09-22 13:48:04 ·15.8 KB, ▶"
  @e16 [other] "SER, test_planet.ser, 2026-09-22 13:46:49 ·1.2 KB, 下载"
  ```

- **验证结论**：正常展现 MP4 和 SER 项目，格式化大小、时间戳准确，未收尾文件正确标识为「未收尾」。

### 2. 未收尾 SER 防御弹窗验证

- **操作**：点击未收尾项目 `@e14`。
- **实机反馈**：
  - 弹出系统警示框，提示文本：`"文件尚未完成或不可用，请停止录制后刷新"`，成功拦截非法下载。

### 3. MP4 视频播放与存相册验证

- **操作**：点击 `@e15`（`app_landscape_sample.mp4`）-> 弹出全屏播放器模态窗 -> 点击底部 `@e30`（`video-download-button`）。
- **实机抓取节点**：
  - WebView 成功渲染 HTML5 Video 原生控件（`进入全屏幕`、`快退10秒钟`、`播放`、`静音`）。
  - 下载保存后弹出提示：`"视频已保存至手机相册"`。

### 4. 正常 SER 文件下载与系统分享验证

- **操作**：点击 `@e16`（`test_planet.ser`）的下载按钮。
- **实机抓取节点**：

  ```text
  @e4 [other] "ShareSheet.RemoteContainerView"
    @e6 [other] "test_planet"
    @e7 [other] "1 KB"
    @e16 [cell] "Copy"
    @e20 [cell] "保存到“文件”"
  ```

- **验证结论**：SER 文件完整下载并成功触发 iOS 系统的 `UIActivityViewController` 原生分享层，支持用户直接将文件保存至本地文件系统。

### 5. 自动化测试矩阵全量通过

- **TypeScript 静态检查**：`tsc --noemit` 无任何类型错误。
- **ESLint 规则扫描**：`eslint .` 0 错误（0 errors, 27 历史 warnings）。
- **Jest 单元测试**：针对相册、存储与相机的测试用例全部通过（23 test suites, 176 tests passed）：
  - `src/features/home/album/album-screen.test.tsx`：通过
  - `src/features/home/album/components/video-item-card.test.tsx`：通过
  - `src/features/home/album/components/video-player-modal.test.tsx`：通过
  - `src/features/home/album/services/album-service.test.ts`：通过
  - `src/features/home/camera/camera-store.test.ts`：通过
  - `src/features/home/hooks/use-storage-info.test.ts`：通过

---

## 七、Git 提交与分支同步规范

严格遵循工单号规范 `#10223`，本次涉及的所有代码变更与测试文件均已同步推送至双端远程仓库：

- 提交哈希：`a1570882716d04ce1c0fc946a4dc308ed1283664`
- 提交说明：`#10223 fix(storage): 修复无SD卡时UI展示、存储状态对接与错误码映射`
- 同步分支：
  - `origin/main`（GitHub 远程仓）已同步
  - `origin-company/main`（内网服务器远程仓）已同步
- 工作区状态：`working tree clean`，无未提交残留文件。
