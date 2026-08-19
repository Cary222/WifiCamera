# Android App 连接失败排查记录

更新时间：2026-08-17

## 一、一键自愈修复（最快解决方案）

当 App 再次出现“连接中 / 无法看到推流 / 画面黑屏 / WebSocket 重试耗尽”时，在终端执行以下**一键恢复命令**：

```powershell
powershell.exe -ExecutionPolicy Bypass -File D:\app\WifiCamera\tools\usb-webrtc-relay\start-usb-relay.ps1 -Serial auto
```

该脚本会自动执行：
1. 自动过滤 MuMu 模拟器，精准识别在线的物理相机板卡（如 `e2621126569ad4a5`）；
2. 建立主机侧所需的 3 个 ADB 端口映射（`18999 -> 8999`, `18889 -> 8889`, `18190 -> 18190`）；
3. 清理残留占用的旧进程并拉起后台 USB WebRTC Relay 代理（18787 端口）；
4. 自检 `/stream-health` 确保 WHEP 媒体链路已就绪；
5. 在后台启动断线监听 Watcher（每 5 秒监测，板卡重插时自动补全端口映射）。

执行后只需在 MuMu 中重新进入风景模式页面即可恢复推流。

---

## 二、App 频繁显示“未连接设备”/连接时不时断开的根因与修复

### 1. 故障现象
用户在 App 首页或各相机页面停留时，画面或连接状态会**时不时断开**，首页卡片在“已连接设备”与“未连接设备”之间反复跳变。

### 2. 根因剖析
经全链路排查，该问题由两个不同层面的原因共同引起：

#### 原因 A（应用与网络层）：缺少 WebSocket Keep-Alive 心跳
- **板端死连接检测**：板端 `net_server.c` 设定了 `WS_DEAD_TIMEOUT_MS 10000`（10 秒）。如果客户端 10 秒内未向服务端发送任何数据包，板端会将客户端标记为 `dead`；
- **空闲超时断开**：App 在首页停留时只在初始时请求一次状态，之后如果没有主动操作，WebSocket 会处于**完全零流量**状态。底层的 TCP 链路和 ADB 转发通道因长时间无流量而超时挂断，触发前端 `onerror / onclose`；
- **UI 状态抖动**：App 检测到 WebSocket 断开后进入 1 秒重连倒计时。在重连期间 `connectionStatus` 变为 `closed/connecting`，导致首页直接显示 **“未连接设备”**。重连成功后又变回“已连接”，从而造成“时不时断开”的闪烁现象。

#### 原因 B（物理与硬件层）：USB 瞬间欠压或供电不足触发重新枚举
- RV1106 板卡在同时运行图像 ISP、硬件 H.264 编码与视频流传输时功耗较高。如果连接的 PC USB 口限流或线缆接触不良，板卡在瞬间高负载时会发生欠压抖动，导致 Windows USB 驱动断开重连（ADB `transport_id` 递增）；
- 每次 USB 断开重新枚举后，Windows 主机侧原本建立的 3 个 `adb forward` 映射全部被系统清空，从而导致断连。

### 3. 修复方案与实施结果
1. **App 端增加主动 Keep-Alive 心跳**：
   - 在 `CameraWebSocketService` 中新增了 `heartbeatIntervalMs: 3000` 机制；
   - WebSocket 建立连接后，每 3 秒自动向板端发送一次 `{ device_name: "StartUp", instruction: "HeartBeat" }`；
   - 保持 TCP 链路持续活跃，彻底解决了由于空闲超时导致的 10s 断连问题；
2. **端口转发守护自愈**：
   - `start-usb-relay.ps1` 启动的后台 Watcher 每 5 秒检测物理板卡，若 USB 发生重插拔重新上线，会自动补全 3 个端口转发，无需手动干预。

---

## 三、2026-08-17 本次“App 又看不到推流”的根因与排查记录

### 1. 现场故障现象
- App 在风景模式下长时间处于“正在连接”或黑屏状态；
- 板端已经成功部署了最新的 `net_server_test`，且板端内部推流（554 RTSP）、信令（8889）与控制（8999）服务均正常监听；
- 检查主机端状态发现：`adb forward --list` 仅保留了调试用的 `8999`，而缺失了 `18999`、`18889` 与 `18190`；
- 主机侧的 USB WebRTC Relay 代理服务（18787 端口）未在后台运行。

### 2. 根因剖析
由于板子在重新插拔/重启时，**Windows 主机侧的临时 ADB 端口转发会被系统自动清空**：
1. **控制通道断开**：缺少 `18999 -> 8999` 转发，App 发送的 WebSocket 指令到达 `10.0.2.2:18999` 后超时断开，触发重试耗尽；
2. **WHEP 信令断开**：缺少 `18889 -> 8889` 转发且 18787 Relay 未运行，App 发起 WebRTC SDP 协商（POST 到 `10.0.2.2:18787/board-webrtc/cam0/whep`）直接返回 HTTP 502 / ECONNREFUSED；
3. **UDP 媒体流断开**：缺少 `18190 -> 18190` 转发，MediaMTX 的 H.264 RTP 视频数据报无法穿透 USB 链路到达主机。

### 3. 解决方案与实施结果
1. 修复并加固了 `tools/usb-webrtc-relay/start-usb-relay.ps1` 与 `watch-usb-relay.ps1` 中的设备枚举与进程管理逻辑，使其能 100% 稳定运行；
2. 恢复了 3 个端口映射并拉起 USB Relay；
3. MuMu 实机抓取 WebRTC 解码指标：
   ```text
   [CameraWHEP-stats] pair nominated=true state=succeeded | inbound-rtp kind=video pktsLost=0 framesDecoded=1429 fps=30 jitterMs=12
   ```
   实测画面以 30 FPS 满帧恢复流畅推流，AUTO/M 切换与白平衡/EV 调参均实时生效。

---

## 三、当前链路结构

```text
MuMu App
  └─ 10.0.2.2:18999 ──> 主机 ADB forward ──> 板端:8999

MuMu WHEP
  └─ 10.0.2.2:18787 ──> 主机 USB relay
                       ├─ HTTP/WHEP: 主机 18889 ──> ADB forward ──> 板端:8889
                       └─ UDP media: 主机 18190 ──> ADB forward ──> 板端:18190
```

因此，板端服务正常监听并不代表 Android App 一定能连接；主机上的三个 ADB forward 也必须存在。

## 四、历史排查记录（2026-08-14）

现场检查结果：

- MuMu `ReactNativeJS` 日志：`WebSocket Exceeded max retries`
- `adb forward --list`：为空
- relay `/relay-stats`：`clients=0`
- relay 错误：`WHEP proxy: connect ECONNREFUSED 127.0.0.1:18889`
- 板端仍正常监听：`8999`、`8889`、`18190`

结论：**板端没有断，主机到板端的 ADB 转发在设备/服务重启后丢失了。**

恢复命令：

```bash
export PATH="D:/app/AndroidSDK/platform-tools:$PATH"

adb -s e2621126569ad4a5 forward tcp:18999 tcp:8999
adb -s e2621126569ad4a5 forward tcp:18889 tcp:8889
adb -s e2621126569ad4a5 forward tcp:18190 tcp:18190

adb forward --list
```

恢复后需要让 App 重新加载或重新进入风景页面，因为 WebSocket 已经耗尽重连次数，不会自动再次建立连接。

## 三、2026-08-14 16:xx 再次无流的现场证据

本次检查结果：

- `adb devices` 能看到板子和 MuMu，但 `adb forward --list` 为空；
- 主机 `18999`、`18889`、`18190` 全部无法连接；
- 板端 `8999`、`8889`、`18190` 仍在监听；
- relay 进程仍在，但 `clients=0`，`lastError` 为：
  `WHEP proxy: connect ECONNREFUSED 127.0.0.1:18889`；
- App 日志持续出现：`[CameraWHEP] POST 502` 和 `WHEP negotiation failed: HTTP 502`。

结论：这次不是相机产流失败，也不是 WebRTC 解码失败，而是**主机侧三个 ADB forward 再次丢失**。relay 的 HTTP 入口仍然存在，但它无法访问被 forward 到板端 `8889` 的 WHEP 服务，所以 App 永远拿不到 SDP/ICE 响应，最终看不到流。

另外，当前 watcher 的后台恢复还没有通过实测：前台运行 watcher 可以恢复三个映射，但后台 watcher 在本次测试中没有恢复端口。因此“自动恢复”目前不能视为已经完成，必须先修正 watcher 的后台启动/进程保活问题。

## 四、最常见的连接失败原因

### 1. ADB forward 丢失

`adb forward` 是主机侧临时状态，以下情况都可能清空它：

- 板子 USB 断开、重连或重启
- ADB server 重启
- MuMu 重启
- 切换 ADB 设备
- 使用不同的 `adb` 安装路径或不同终端环境

检查：

```bash
adb forward --list
```

必须能看到：

```text
e2621126569ad4a5 tcp:18999 tcp:8999
e2621126569ad4a5 tcp:18889 tcp:8889
e2621126569ad4a5 tcp:18190 tcp:18190
```

### 2. 只恢复了控制端口，没恢复 WHEP 端口

`18999` 只负责 WebSocket/HTTP 控制；实时预览还需要：

- `18889 -> 8889`：WHEP HTTP 信令
- `18190 -> 18190`：USB UDP media tunnel

只恢复 `18999` 时，App 可能显示“已连接”，但预览会报 WHEP 502、无画面或持续重连。

### 3. 板端服务没启动或被 watchdog 重启

检查板端：

```bash
adb -s e2621126569ad4a5 shell "busybox netstat -ln | grep -E ':(8999|8889|18190) '"
adb -s e2621126569ad4a5 shell "ps | grep -E 'net_server_test|mediamtx|board_webrtc' | grep -v grep"
```

板端网页服务可用的重启入口：

```bash
adb -s e2621126569ad4a5 shell "sh /userdata/hjc_test/board_restart_web_services.sh"
```

注意：这个脚本只能重启板端服务，**不会创建主机侧 ADB forward**；重启后仍要执行上一节的三个 `adb forward`。

### 4. 使用了错误的 ADB 设备

当前有两个设备：

- `e2621126569ad4a5`：板端控制设备，必须用它创建 forward
- `127.0.0.1:16384`：MuMu 模拟器，App 在这里运行

错误示例：

```bash
adb -s 127.0.0.1:16384 forward tcp:18999 tcp:8999
```

正确做法是用板端 serial 创建 forward，App 仍然通过 `10.0.2.2` 访问主机端口。

换板时不需要重新打包 App。重新启动 relay 即可：

```powershell
# 只有一块实体板在线时自动选择
powershell.exe -ExecutionPolicy Bypass -File .\tools\usb-webrtc-relay\start-usb-relay.ps1 -Serial auto

# 多块实体板在线时显式指定
powershell.exe -ExecutionPolicy Bypass -File .\tools\usb-webrtc-relay\start-usb-relay.ps1 -Serial <板端ADB序列号>
```

`auto` 只接受实体 ADB serial，不会把 `127.0.0.1:16384` 这样的 MuMu 端点当成板子；多块实体板同时在线时会拒绝启动，避免误连或干扰其他 agent。

### 5. relay 进程是旧实例或端口配置不一致

检查：

```bash
curl http://127.0.0.1:18787/stream-health
curl http://127.0.0.1:18787/relay-stats
```

重点看：

- `whep` 是否为 `127.0.0.1:18889`
- `clients` 是否为 `1`
- `lastError` 是否持续出现 `ECONNREFUSED`

如果 forward 已恢复但 `lastError` 仍是旧错误，先重新加载 App；必要时重启 USB relay。旧错误本身可能只是历史值，不代表当前请求仍失败。

### 6. App 已耗尽 WebSocket 重试次数

当前 App 在 WebSocket 连接失败后有最大重试次数。日志出现：

```text
WebSocket Exceeded max retries
```

即使之后恢复了 ADB forward，旧页面也可能不会自动恢复。需要：

- 重新进入风景页面；或
- Reload Dev Client；或
- 重启 App。

### 7. `.env` 或 bundle 使用了旧地址

USB 模式必须使用：

```env
EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep
```

修改 `.env` 后必须重新加载 Metro bundle；只热刷新部分组件不一定会更新构建期环境变量。

## 五、自动恢复机制

启动 relay 时现在会同时启动 Windows 主机侧 watcher：

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\tools\usb-webrtc-relay\start-usb-relay.ps1
```

watcher 每 5 秒检查目标板子和三个 ADB forward，并在 relay 进程退出时重新拉起 relay。它只修改主机侧临时 forward，不修改板端持久文件。

App 侧的相机 WebSocket 已改为持续重连模式；ADB forward 恢复后，不需要手动重启页面即可重新建立控制连接。WHEP 预览也会继续按现有机制重试建流。

如果 watcher 本身被关闭，重新运行上述启动命令即可。

## 六、推荐的一键恢复顺序

```bash
export PATH="D:/app/AndroidSDK/platform-tools:$PATH"

# 1. 确认两个设备都在线
adb devices -l

# 2. 确认板端服务；必要时重启板端网页服务
adb -s e2621126569ad4a5 shell "busybox netstat -ln | grep -E ':(8999|8889|18190) '"

# 3. 恢复三个 ADB forward
adb -s e2621126569ad4a5 forward tcp:18999 tcp:8999
adb -s e2621126569ad4a5 forward tcp:18889 tcp:8889
adb -s e2621126569ad4a5 forward tcp:18190 tcp:18190

# 4. 检查 relay
curl http://127.0.0.1:18787/stream-health
curl http://127.0.0.1:18787/relay-stats

# 5. 重新加载 MuMu Dev Client 或重新进入风景模式
```

## 七、判断标准

连接链路正常时应同时满足：

1. `adb forward --list` 有三个端口映射；
2. 板端监听 `8999/8889/18190`；
3. relay `stream-health.ready=true`；
4. relay `clients=1`；
5. App 日志出现 `CameraWHEP session live, total=1`；
6. App `inbound-rtp video` 的 `fps` 约为 `30`，`pktsLost=0`；
7. 页面不再出现 `WebSocket Exceeded max retries` 或 `WHEP HTTP 502`。
