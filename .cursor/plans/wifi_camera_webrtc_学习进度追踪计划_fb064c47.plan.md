---
name: WiFi Camera WebRTC 学习进度追踪计划
overview: 基于你的 WiFi Camera 项目，创建一套从"代码能跑"到"系统认知"的学习进度追踪计划。核心方法：代码驱动学习 + 五问法 Review，不补底层，专注形成全栈系统认知。
todos:
  - id: create-learning-docs
    content: 创建 docs/learning/ 目录结构
    status: pending
  - id: create-readme
    content: 创建学习路线 README.md
    status: pending
  - id: create-phase-templates
    content: 创建阶段 1~6 的学习笔记模板
    status: pending
  - id: create-concept-table
    content: 创建概念对照表
    status: pending
  - id: create-progress-tracker
    content: 创建进度追踪表
    status: pending
isProject: false
---

# WiFi Camera WebRTC 学习进度追踪计划

> 本计划基于你的 WiFi Camera 项目，遵循"不补底层，学系统认知"原则。

---

## 一、学习定位

### 你的核心问题

```
代码已经能跑，但你还没有形成"我知道这套系统为什么这样设计"的系统认知。
```

### 学习目标

```
不成为写 Camera C 固件的人，
但要知道：
  - "板子给我的到底是什么？"
  - "我为什么能通过 WHEP 拿到视频？"
  - "WebRTC 在中间发生了什么？"
```

### 优先级矩阵

| 层级 | 内容 | 优先级 |
|------|------|--------|
| ① UI / RN | CameraScreen / RTCView | ★★★★★ |
| ② WebRTC Client | PeerConnection / ICE / Track | ★★★★★ |
| ③ Backend / WHEP | HTTP API / Relay | ★★★★☆ |
| ④ Network / ADB | USB Tunnel / ADB Forward | ★★★☆☆ |
| ⑤ C / Camera Pipeline | Sensor → H264 → RTSP | ★☆☆☆☆ |

---

## 二、学习路线图（6 阶段）

### 阶段 1：视频从 Camera 到 RN（核心链路）

**目标**：追踪 CameraScreen → 第一帧画面显示的完整调用链

**代码路径**：
```text
CameraScreen (camera-screen.tsx)
    ↓ useCameraStore.connect()
camera-store.ts (camera-store.ts)
    ↓ 建立控制通道
CameraWebSocketService (websocket-service.ts)
    ↓ 连接成功后触发
NativeCameraPreview (native-camera-preview.tsx)
    ↓ useLandscapeCameraPreview()
    ↓ getCameraWhepUrl() → transport.ts
    ↓ openWhepSession()
whep-service.ts
    ↓ RTCPeerConnection
    ↓ POST /whep → fetch
    ↓ setRemoteDescription
    ↓ ontrack
    ↓ MediaStream
    ↓ RTCView → 屏幕
```

**五问法练习**：
```
① 谁触发的？
② 输入是什么？
③ 它改变了什么状态？
④ 下一步是谁接着处理？
⑤ 最终数据去哪了？
```

**验证标准**：
- [ ] 能画出完整调用链
- [ ] 能说出每个文件负责什么
- [ ] 能解释 WHEP URL 从哪里来

---

### 阶段 2：彻底搞懂 PeerConnection

**目标**：理解 WebRTC 核心概念

**核心概念对照表**：

| 代码 | 概念 | 你的理解 |
|------|------|----------|
| `new RTCPeerConnection({ iceServers: [] })` | WebRTC 会话 | ？？？ |
| `createOffer()` | 创建连接提议 | ？？？ |
| `setLocalDescription()` | 告诉本地采用这个 SDP | ？？？ |
| `fetch(whepUrl)` | WHEP 信令 | ？？？ |
| `setRemoteDescription()` | 接受对方 SDP | ？？？ |
| `ontrack` | 收到远端媒体轨道 | ？？？ |
| `MediaStream` | 视频流对象 | ？？？ |
| `RTCView` | RN 视频渲染 | ？？？ |

**WHEP 五个问题**（结合 whep-service.ts）：

```
① 为什么要 POST？
   → 你的答案：__________

② POST 的 body 是什么？
   → 你的答案：__________

③ body 里面为什么是 SDP？
   → 你的答案：__________

④ Response 为什么也是 SDP？
   → 你的答案：__________

⑤ 从 HTTP 结束以后，视频去了哪里？
   → 你的答案：__________
```

**验证标准**：
- [ ] 能解释 Offer / Answer 的作用
- [ ] 能解释 ICE Candidate 的作用
- [ ] 能解释 trickle ICE 的必要性

---

### 阶段 3：理解你的 Relay

**目标**：理解为什么需要 relay 和 SDP 改写

**代码路径**：`tools/usb-webrtc-relay/server.mjs`

**核心问题**：

```
① Relay 从哪里收？（USB）
② Relay 在干什么？（转发 + SDP 改写）
③ Relay 为什么存在？（USB 不能传 UDP）
```

**relay 的三件事**（server.mjs）：
```
1. WHEP 信令反向代理
   → 代码：proxyWhep() 函数

2. ICE candidate 改写（关键！）
   → 代码：rewriteSdpCandidates() 函数
   → 为什么要改：模拟器访问不到设备侧地址

3. UDP ↔ TCP 中转
   → 代码：receiveTunnelFrames() 函数
   → 分帧协议：4 字节长度前缀 + UDP payload
```

**验证标准**：
- [ ] 能解释为什么 USB 模式需要 relay
- [ ] 能解释 SDP 改写的具体逻辑
- [ ] 能解释 UDP over TCP 的分帧原理

---

### 阶段 4：理解 USB + ADB 链路

**目标**：理解开发环境的网络路径

**你的开发环境拓扑**：
```
Camera
   ↓ USB
Mac
   ↓
adb forward
   ↓
relay
   ↓
WHEP
   ↓
MuMu 模拟器
```

**三个 forward**（transport.ts）：
```text
18999 → 8999    控制 WebSocket/HTTP
18889 → 8889    WHEP HTTP 信令
18190 → 18190   UDP-over-TCP 媒体隧道
```

**验证标准**：
- [ ] 能解释 `adb forward tcp:18999 tcp:8999` 的含义
- [ ] 能解释为什么视频需要 18190，而控制只需要 18999
- [ ] 能解释为什么 WiFi 模式不需要任何 forward

---

### 阶段 5：理解双链路架构

**目标**：理解 USB 和 WiFi 的本质区别

**对比表格**：

| | USB 模式 | WiFi 模式 |
|---|---|---|
| 控制地址 | `10.0.2.2:18999` | `192.168.1.1:8999` |
| WHEP 地址 | `10.0.2.2:18787/...` | `192.168.1.1:8889/...` |
| 需要 relay | ✅ 是 | ❌ 否 |
| 需要 adb forward | ✅ 三条 | ❌ 不需要 |
| 需要 SDP 改写 | ✅ 是 | ❌ 否 |
| 媒体传输 | UDP over TCP 隧道 | UDP 直连 |

**核心认知**：
```
USB/WiFi 不是两套不同的视频协议，
而是同一套 WebRTC 视频在两种底层传输路径上的实现。
```

**验证标准**：
- [ ] 能解释为什么 App 可以在两条路之间切换
- [ ] 能解释自动切换的防抖规则

---

### 阶段 6：理解 Camera Pipeline（可选）

**目标**：知道每一步是什么，但不写代码

**链路**：
```
Sensor (IMX662)
  ↓
VI (视频输入)
  ↓
VPSS (视频处理)
  ↓
VENC (H.264 硬件编码)
  ↓
RTSP :554
  ↓
MediaMTX
  ↓
WebRTC → App
```

**验证标准**：
- [ ] 能解释为什么改了 ROI 尺寸，预览和拍照都会变
- [ ] 能解释 RTSP 在这里的角色（只是 MediaMTX 的输入源）

---

## 三、进度追踪表

### 核心文件索引

| 文件 | 作用 | 阶段 |
|------|------|------|
| `whep-service.ts` | WHEP 客户端 | 1, 2 |
| `native-camera-preview.tsx` | 预览组件 | 1 |
| `camera-store.ts` | 状态管理 | 1 |
| `transport.ts` | 双链路配置 | 4, 5 |
| `websocket-service.ts` | 控制通道 | 1 |
| `server.mjs` | USB relay | 3 |
| `视频流链路详解.md` | 完整架构文档 | 全阶段 |

### 里程碑检查点

| 里程碑 | 验证方式 |
|--------|----------|
| M1: 能画出视频从 Camera 到 RTCView 的完整链路 | 手动画图 |
| M2: 能解释 WHEP 的 5 个问题 | 口头/书面回答 |
| M3: 能解释 SDP 改写的必要性 | 能说出"为什么" |
| M4: 能解释 USB 和 WiFi 本质区别 | 能回答"同一套 WebRTC，不同出口" |
| M5: 能独立排查视频连接问题 | 实际排查一个问题 |

---

## 四、学习方法

### 1. 不要学 → Review → 再学

```
现有 RN 代码
    ↓
找出完整链路
    ↓
问"为什么"
    ↓
补理论
    ↓
回到代码
    ↓
自己重新解释
```

### 2. 五问法（每次 Review）

```
① 谁触发的？
② 输入是什么？
③ 它改变了什么状态？
④ 下一步是谁接着处理？
⑤ 最终数据去哪了？
```

### 3. 代码 → 理论对照表

每学到一个概念，补充到自己的对照表：

| 项目代码 | 你应该理解的概念 |
|----------|------------------|
| `RTCPeerConnection` | WebRTC 会话 |
| `createOffer()` | 创建连接提议 |
| `setLocalDescription()` | 告诉本地连接采用这个 SDP |
| `fetch(whepUrl)` | WHEP 信令 |
| `setRemoteDescription()` | 接受对方 SDP |
| `ontrack` | 收到远端媒体轨道 |
| `MediaStream` | 视频流 |
| `RTCView` | RN 视频渲染 |
| `adb forward` | USB 开发环境下的端口转发 |
| `/whep` | WebRTC 播放建立入口 |
| `server.mjs` | Relay / WebRTC 中间层 |
| H264 | 视频编码 |
| RTP | 实时媒体包传输 |
| SRTP | 加密后的 RTP |

---

## 五、最终目标

### 你应该能达到的状态

别人问你：

> "为什么这个 Camera App 能看到视频？"

你能从 Sensor 一直画到屏幕：

```
IMX662 Sensor
  ↓
VI / VPSS / VENC (H.264)
  ↓
RTSP :554
  ↓
MediaMTX
  ↓
USB: UDP over TCP 隧道
WiFi: UDP 直连
  ↓
WebRTC PeerConnection
  ↓
ontrack → MediaStream
  ↓
RTCView
  ↓
屏幕
```

然后如果视频没了，你能判断：

```
是 Camera 没采集？
还是编码没出来？
还是 WebRTC Publisher？
还是 Relay？
还是 WHEP？
还是 PeerConnection？
还是 Track？
还是 RTCView？
```

**这才是全栈开发者真正应该从这个项目里带走的能力。**

---

## 六、文档存放位置

建议将学习笔记存放在：

```
docs/learning/
├── README.md                    # 学习路线总览
├── phase-1-video-chain.md       # 阶段 1 笔记
├── phase-2-peerconnection.md     # 阶段 2 笔记
├── phase-3-relay.md             # 阶段 3 笔记
├── phase-4-adb.md               # 阶段 4 笔记
├── phase-5-dual-transport.md    # 阶段 5 笔记
├── concepts/                    # 概念对照表
│   ├── webrtc-basics.md
│   ├── whep-explained.md
│   └── transport-comparison.md
└── progress-tracker.md          # 进度追踪（每次 Review 后更新）
```
