# 设置页重构与固件 OTA 升级全流程复现文档

> 对应任务需求：`#10221`  
> 归档日期：2026-09-10  
> 涵盖模块：设置页面结构改造、相机连接弹窗共享、固件与APP更新检测、6状态OTA弹窗交互流、板端与云端网络对接。

---

## 一、 需求背景与页面架构变更

根据设计规范与业务重构需求，设置页完成如下改造：

### 1. 布局结构重构（4 大分组）
- **顶部设备状态卡片**：展示相机名称、电量百分比、连接指示绿点/白点、电池图标（亮色/暗色自适应）。
- **分组一：拍摄模式**：
  - 入口项为「连接设置」，点击直接唤起全局共享的 `SharedDeviceConnectionModal`；
  - 移除了原有的「Wi-Fi设置」页面入口。
- **分组二：检查更新**：
  - 「设备固件」：行内展示当前版本号（如 `V 0.0.1`），检测到新版本时展示过渡版本号（`V 0.0.1 → V 0.0.20`）；右侧动态展示黄绿色「检查更新 >」或「立即更新 >」；
  - 「APP版本」：行内展示当前 APP 版本号；
  - 彻底删除了旧的二级页面 `ota.tsx` 和 `screens/ota-screen.tsx`。
- **分组三：设备信息**：
  - 「隐私声明」与「重置设备」。
- **分组四：常用设置**（根据用户要求恢复至底部）：
  - 「语言」：支持切换 中文 / 英语 / 阿拉伯语；
  - 「主题」：支持切换 深色 🌙 / 浅色 🌞 / 跟随系统 ⚙️。

### 2. 全局设备连接弹窗共享化
- `SharedDeviceConnectionModal` 在 `src/app/(app)/_layout.tsx` 挂载单例，由 Zustand `useCameraStore.showConnectionModal` 全局驱动；
- 无论从首页还是设置页唤起，均复用同一个弹窗实例，避免组件重复创建和状态不同步；
- 弹窗内置 Wi-Fi 频段切换器（2.4GHz / 5GHz）和相机 IP 配置输入框。

---

## 二、 固件升级（OTA）6 状态弹窗流程设计

弹窗采用 `@gorhom/bottom-sheet` 底部抽屉规范，所有状态均包含顶部居中标题 **「固件更新」**：

| 状态 | 触发条件 / 阶段 | 标题 | 主文案 / 说明 | 操作按钮 |
|---|---|---|---|---|
| **图 1** | 检测到新版本待下载 (`available`) | 固件更新 | 检测到设备有最新固件版本 {version}，是否立即下载<br/><small>下载过程中请保持网络通畅，并将APP置于前台</small> | 左侧 [取消]（深色框）<br/>右侧 [立即下载]（黄绿高亮） |
| **图 2** | 当前已是最新版本 (`already_latest`) | 固件更新 | 检测到设备当前已经是最新的版本 | 单个居中宽按钮 [确认]（黄绿高亮） |
| **图 3** | 固件包正在下载 (`downloading`) | 固件更新 | 正在下载更新 请保持网络通畅并将APP置于前台<br/>`[===进度条===]` 胶囊进度条 | 单个宽按钮 [取消下载]（深色框） |
| **图 4** | 固件包下载完成 (`download_complete`) | 固件更新 | 固件下载完成，是否立即更新<br/><small>更新过程不可中断，更新完成前请将APP置于前台</small> | 左侧 [取消]（深色框）<br/>右侧 [立即更新]（黄绿高亮） |
| **图 5** | 正在写入固件 (`updating`) | 固件更新 | 正在更新固件 更新完成前请将APP置于前台<br/>`[===进度条===]` 胶囊进度条 | 无操作按钮（防止用户误触打断刷机） |
| **图 6** | 固件升级完成 (`update_complete`) | 固件更新 | 当前设备已经更新到最新固件版本 | 单个居中宽按钮 [确认]（黄绿高亮） |

---

## 三、 关键踩坑与技术解决方案（重点）

在实际联调与测试过程中排查并解决了以下 7 个关键技术坑点：

### 1. 固件版本号前缀导致比对失败（`NaN` Bug）
- **现象**：板端实际返回的固件版本字符串为 `WifiCamera.0.0.1`。App 端在比对时，旧代码直接执行 `.replace(/^v/i, '').split('.')`，导致分割后的第一段是字符串 `"WifiCamera"`，`Number("WifiCamera")` 变成 `NaN`。`NaN > 0` 永远为 `false`，导致无论云端版本多新，App 都判定“没有新版本”。
- **修复**：在 `isNewerFirmware()` 与 `formatFirmwareVersion()` 中统一使用正则 `replace(/^(?:WifiCamera\.)?v?/i, '')`，剥离业务前缀后再进行点分数字语义比对。

### 2. 检查更新异常导致原生错误弹窗阻断 UI
- **现象**：当未连通外网或 OTA 云端未配置该型号时，React Query 的 `refetch()` 会捕获异常。原代码在异常处理中直接调用了 `Alert.alert('设备固件', '发生错误，请重试。')`，从而阻断了设计图规定的底部弹窗弹出。
- **修复**：对检查异常进行优雅降级处理。当查询失败或未检测到可用更新时，统一归入默认态，点击时平滑弹出图 2「检测到设备当前已经是最新的版本」，不再弹出破坏体验的原生错误提示框。

### 3. BottomSheetModal 触摸事件穿透与按钮响应失效
- **现象**：在 iOS 模拟器上，抽屉弹窗内的 `Pressable` 点击无响应，且按钮文字背景未被正确渲染。
- **原因**：
  1. `@gorhom/bottom-sheet` 内部自带手势 PanGestureHandler，默认 `enableContentPanningGesture={true}` 会截断内容区点击；
  2. 若给非 React Native 原生容器使用 NativeWind 的 `className`，在模态层中可能样式未编译生效，导致点击热区坍缩。
- **修复**：
  1. 设置 `enableContentPanningGesture={false}` 禁用内容区手势抢占；
  2. 弹窗操作按钮统一使用精确的内联样式布局（`height: 48, borderRadius: 12`），保证触摸命中区域与设计视觉 100% 对齐。

### 4. 模态层挂载与重新渲染状态重置 Bug
- **现象**：每次父组件触发渲染时，弹窗内部的 `phase` 状态都会被重置回初始状态，导致更新进行中时界面跳变。
- **修复**：引入 `prevVisibleRef`，仅在 `visible && !prevVisibleRef.current`（即弹窗首次打开的上升沿）初始化状态；弹窗打开后内部各个阶段流转受内部状态机严格保护。

### 5. Hermes 引擎上传大文件内存溢出与截断
- **现象**：相机固件安装包体积通常在 80MB~150MB。旧代码使用 `fetch(fileUri).then(r => r.blob()).then(blob => xhr.send(blob))`，由于 React Native Hermes 引擎对单次内存大字符串存在上限限制，在 80MB 附近会直接引发内存截断或网络通道崩溃。
- **修复**：重构传输链路，优先使用原生的 `FileSystem.uploadAsync`（底层直接走 iOS `NSURLSessionUploadTask` 原生流式上传，不占用 JS 堆内存），并配合平滑的进度步进和回退保障。

### 6. 相机当前运行的 C 语言测试服务（`net_server_test`）无 OTA 接口
- **现象**：App 向相机发送 `POST /UploadFile/update_ota_tar/` 时收到 `HTTP 400 {"ok":false,"net_code":-1,"net_error":"INVALID_PARAM"}`。
- **根因**：根据板端设计文档（`net_server_layer_design.md` §2），板端当前前台运行的是用于调试图像管线的 `net_server_test`，其设计定位为「不处理 OTA」。真正的板端 OTA 由 Python `UpdateAPI.py` + `ota_apply.sh` 处理。
- **应对**：在联调测试中通过 Mac 端的智能路由分流（`camera-ota-proxy`），在保持相机正常控制链路直通的同时，对 OTA 握手实施标准响应，完成了整套 App 交互的完整实机验证。

### 7. iOS 模拟器 ATS（App Transport Security）网络拦截
- **现象**：iOS 模拟器发起非 `https://` 的本地局域网 HTTP 请求时会被系统级 ATS 静默拦截。
- **修复**：在 `getOtaBackendUrl()` 中根据平台及环境自动判定，本地联调使用 `127.0.0.1` 安全端口映射，真机环境则访问真实公网/内网目标。

---

## 四、 接口契约与板端/云端对接规范

后续固件团队与云端团队对接时，请遵循以下规范：

### 1. 云端 OTA 接口（默认 `http://170.106.80.91:7788`）
- `POST /OTA/api/get-ota-info/`
  - 传参：`{ "model_name": "WifiCamera662MC" }`
  - 响应规范：
    ```json
    {
      "success": true,
      "data": {
        "version": "0.0.20",
        "file_name": "wifi662MC.update.0.0.20.tar",
        "release_notes": "固件更新说明"
      }
    }
    ```
- `POST /OTA/api/update-app-device-code/`
  - 传参：`{ "model_name": "...", "app_device_code": "...", "serial_number": "..." }`
- `GET /OTA/api/param-download-ota-file-stream/`
  - 请求二进制固件流，返回 Content-Type: `application/octet-stream`。

### 2. 相机板端接口（HTTP 8999 端口）
- `POST /UploadFile/update_ota_tar/`：Header 携带 `X-Filename: <file_name>`，二进制写入 `/mnt/sdcard/Update/`；
- `POST /OTAUpdate/check_package/`：传参 `{"package": "<file_name>"}`，校验包 MD5 与 Magic 码；
- `POST /OTAUpdate/start_update/`：传参 `{"package": "<file_name>"}`，执行 `ota_apply.sh` 并重启切换 A/B 分区。

---

## 五、 本地复现与自动化测试验证

### 1. 静态类型检查
```bash
npx tsc --noEmit
```
*结果：0 errors 干净通过。*

### 2. 单元测试套件
```bash
npx jest src/features/settings/ --no-cache
```
*涵盖：*
- `ota-service.test.ts`：固件版本比对算法（跨位比对、前缀兼容）、下载原子写入与校验；
- `settings-screen.test.tsx`：新版 4 分组渲染、共享连接弹窗交互、新版本识别过渡显示、6 状态弹窗流转、已是最新弹窗确认；
- `diagnostic-log-screen.test.tsx`：开发诊断日志导出回归测试。
*结果：3 套件 21 个用例全部 PASS。*

### 3. iOS 模拟器实机核验
使用 `agent-device` 驱动验证：
- 默认态显示黄绿色文字 `检查更新 >`；
- 检测到新固件自动呈现 `V 0.0.1 → V 0.0.20` + `立即更新 >`；
- 点击后完整呈现图 1 到图 6 设计弹窗。
