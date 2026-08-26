# #10193: USB WebRTC 视频流黑屏与断连根因复现与自愈修复报告

## 一、问题背景 (Issue Summary)

- **单号**: `#10193`
- **问题现象**:
  1. 在进入相机拍摄模式（风景模式、深空模式、行星模式等）时，视频预览画面出现黑屏；
  2. 运行一小段时间后，视频流出现反复断连、重新协商循环；
  3. 控制台偶发报错 `POST http://localhost:8081/camera-proxy/?transport=whep&path=%2Fboard-webrtc%2Fcam0%2Fwhep 404 (Not Found)`；
  4. Web 桌面端与 Android 模拟器之间存在 WebRTC 网络打洞候选地址冲突。

---

## 二、测试环境与拓扑 (Environment & Topology)

- **宿主机**: macOS 15.x / Apple Silicon (开发机)
- **目标板端**: Rockchip RV1106 Linux (ARM 架构，板载 ISP、NPU、VPU)
- **连接方式**: Type-C USB (ADB 模式，ADB Forward 转发 TCP 控制与 WHEP 信令，本地 Relay 搭建 UDP 媒体隧道)
- **前端客户端**:
  - Web 端开发预览 (`http://localhost:8081`)
  - Android 模拟器 (`10.0.2.2` 路由)

---

## 三、问题复现步骤 (Step-by-Step Reproduction)

### 场景 1：硬件供电不足与 USB 闪断复位

1. 将相机板子插入未接外置电源的 USB Hub，且同 Hub 上挂载移动硬盘等高功耗设备；
2. 打开相机应用进入拍照/风景模式；
3. **现象**: `net_server_test` 启动相机 Sensor、ISP 与 H.264 硬件编码器，整板功耗瞬间从 150mA 飙升至 800mA~1A+；
4. **结果**: USB Hub 5V 总线电压跌落（Brown-out），板子硬件掉电复位。Mac 内核记录 `AppleUSBHostPort::terminateDevice: destroying 0x2207/0006/0310 (rk3xxx): hardware connection lost`。

### 场景 2：Web 桌面端 SDP Candidate 打洞失败（黑屏）

1. 在 Mac 浏览器打开 `http://localhost:8081`；
2. 前端向 `server.mjs` 发起 WHEP 请求；
3. `server.mjs` 仅将 SDP Candidate 改写为 `10.0.2.2:18189`（Android 模拟器专用别名）；
4. **结果**: Mac 桌面端浏览器无法路由 `10.0.2.2`，ICE 连接超时失败，画面始终黑屏。

### 场景 3：板端隧道进程静默退出导致的重连循环

1. 板端 `board_webrtc_udp_tunnel` 因网络波动或无数据流退出；
2. 前端发起 WHEP 协商，MediaMTX HTTP 201 协商成功；
3. **结果**: WebRTC 媒体包无法在板端与宿主机之间传递，WebRTC ICE 状态在 `connected` -> `failed` -> `disconnected` 之间无限震荡。

### 场景 4：前端 `<video>` 元素异步 Track 绑定丢失

1. 前端 `WebVideoSurface` 在 `MediaStream` 创建时将流赋值给 `<video>`；
2. WebRTC 媒体轨道（`MediaStreamTrack`）在 WHEP 完成握手后异步到达；
3. **结果**: `<video>` 没有监听到轨道动态加入，导致视频元素处于挂起状态，表现为纯黑屏。

---

## 四、根本原因分析 (Root Cause Analysis)

1. **硬件与供电层**:
   - RV1106 开流峰值功耗高，无源拓展坞压降引发硬件 Brown-out 复位；
   - 物理断开后 ADB 守护进程清空所有 `adb forward` 规则。
2. **SDP 协商层**:
   - SDP Candidate 缺少多环境兼容，未同时输出 `127.0.0.1`（Mac 宿主/Web）与 `10.0.2.2`（Android 模拟器）。
3. **板端与宿主机守护层**:
   - 板端 8999、8889、18190 三大后台进程缺少进程级守护；
   - 宿主机在 USB 重新枚举后缺少热插拔事件驱动的自动端口恢复。
4. **UI 渲染层**:
   - Web 端视频播放组件未对原生 `MediaStream` 挂载 `addtrack` / `removetrack` 监听。

---

## 五、解决方案与修复代码 (Solutions & Implementation)

### 1. SDP Answer 多端候选地址重写 (`tools/usb-webrtc-relay/server.mjs`)

在 `rewriteSdpCandidates` 中同时注入 `127.0.0.1` 与 `10.0.2.2`，保证桌面浏览器与模拟器均可命中合法候选地址：

```javascript
const hosts = Array.from(new Set(["127.0.0.1", relayAdvertiseHost]));
return hosts.map((host, idx) => {
  const candidateBefore = before.replace(/^(a=candidate:\S+)/, `$1${idx}`);
  const prio = Number(priority.trim()) - idx;
  return `${candidateBefore}${protocol} ${prio}${spaceBeforeAddress}${host}${spaceBeforePort}${relayUdpPort}${after}`;
});
```

### 2. Web 端视频轨道动态监听 (`native-camera-preview.tsx`)

在 `WebVideoSurface` 中监听 `addtrack` 事件，确保异步音视频帧到达时自动开始渲染：

```tsx
const attachAndPlay = () => {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      if (err.name !== 'AbortError') {
        console.warn('[WebVideoSurface] 自动播放失败:', err);
      }
    });
  }
};

stream.addEventListener('addtrack', attachAndPlay);
stream.addEventListener('removetrack', attachAndPlay);
```

### 3. 板端全进程守护看门狗 (`/userdata/hjc_test/watchdog.sh`)

板端常驻看门狗，每 3 秒检测 `net_server_test` (8999)、`mediamtx` (8889) 和 `board_webrtc_udp_tunnel` (18190)，遇崩溃秒级拉起。

### 4. Mac 宿主机热插拔自愈守护 (`tools/usb-webrtc-relay/mac/usb-auto-watchdog.sh`)

宿主机常驻监听 ADB USB 设备，一旦板子重新枚举连入，1 秒内全自动恢复 `18999`、`18889`、`18190` 端口转发并激活板端看门狗。

### 5. 一键全链路 5 级诊断脚本 (`tools/usb-webrtc-relay/mac/check-status.sh`)

支持 `bash tools/usb-webrtc-relay/mac/check-status.sh [--fix]`，实现物理连接、板端服务、ADB 映射、Host Relay 及 MediaMTX 视频源的统一体检与一键修复。

---

## 六、验证与测试 (Verification)

1. **类型检查与 Lint**:
   - `npx tsc --noEmit`：0 错误
   - `npx eslint`：0 错误
2. **WHEP 协商与媒体流验证**:
   - 发送 WHEP SDP Offer 至 `http://localhost:8081/camera-proxy/?transport=whep&path=%2Fboard-webrtc%2Fcam0%2Fwhep`；
   - 响应状态码: `HTTP 201 Created`；
   - ICE Candidate: 包含 `127.0.0.1:18189` 及 `10.0.2.2:18189`；
   - Relay 流量状态: `boardPackets: 32, boardBytes: 13389`，双向传输正常。
