# USB 视频隧道链路 —— 小白完全复盘手册

> 对应简历第一条核心模块：「USB 视频隧道链路（核心技术难点）」
> 本文基于真实代码逐行分析 + 网络协议官方资料调研写成，所有结论都标了代码文件和行号。

---

## 第〇部分：先搞清楚要解决什么问题（最重要的部分）

### 0.1 场景

你有一个天文相机板子（RV1106 芯片的 Linux 小电脑），上面跑着：

| 板上服务 | 端口 | 干什么 |
| --- | --- | --- |
| `net_server_test` | TCP 8999 | 控制 API（曝光/增益/拍照指令） |
| MediaMTX | TCP 8889 | 流媒体服务器，对外提供 WHEP 拉流 |
| MediaMTX | UDP 8189 | WebRTC 媒体收发端口 |
| `board_webrtc_udp_tunnel` | TCP 18190 | 本项目自研的 C 隧道程序 |

手机上的 App 要实时看到相机画面。

### 0.2 矛盾（整个模块存在的原因）

**WiFi 模式下没任何问题**：手机连板子的热点（192.168.1.1），控制走 TCP、视频走 UDP，畅通无阻。

**但 USB 模式下**：手机和板子之间只有一根 USB 线，唯一的通信手段是 **adb（Android 调试桥）的端口转发**。而这里有一个致命矛盾：

```
┌─────────────────────────────────────────────────┐
│  adb forward 只能转发 TCP 端口（硬限制！）          │
│  WebRTC 视频媒体走的是 UDP                        │
│                                                 │
│  → 控制指令（TCP）能过 USB ✓                      │
│  → WHEP 协商（HTTP/TCP）能过 USB ✓               │
│  → 视频数据包（UDP）过不了 USB ✗                  │
│                                                 │
│  表现为：协商成功、画面永远是黑的                   │
└─────────────────────────────────────────────────┘
```

这个前提经过三重验证：

1. **官方文档**：developer.android.com 的 adb 文档只描述 `tcp:` 和 `local:` 转发；
2. **AOSP 源码**：`commandline.cpp` 里根本不存在 `udp:` 解析分支；
3. **实测**：`adb forward udp:22222 udp:22222` 直接报错 `unknown socket specification: udp:22222`。

### 0.3 解决方案总览

既然 USB 只能运 TCP，那就在两端各放一个「翻译官」，把 UDP 包装成 TCP 运过去：

```
App(模拟器)                                          板子(RV1106)
   │                                                    │
   │ ① WHEP 协商: POST SDP ──→ relay(18787) ──adb──→ MediaMTX(8889)
   │    （relay 会偷改 SDP 里的地址，见后文）               │
   │                                                    │
   │ ② 视频 UDP 包 ──→ relay(UDP 18189)                 │
   │                    │ 加4字节长度头封装成TCP           │ 解包还原成UDP
   │                    └────adb tcp:18190────────→ 隧道C程序(18190) ──UDP──→ MediaMTX(8189)
   │                                                    │
   │ ←── 反方向同理，MediaMTX 的回包原路返回               │
```

三个自研组件各司其职：

- **主机侧 relay**（Node.js，263 行）：假装自己是相机 + 改写 SDP 地址 + UDP↔TCP 双向泵
- **板端 C 隧道**（C 语言，316 行）：TCP 世界和 UDP 世界之间的关卡
- **App 传输层**（TypeScript）：两套地址配置 + 自动探测切换

---

## 第一部分：必备基础知识（小白版）

### 1.1 TCP 和 UDP 的本质区别

用快递打比方：

- **TCP = 集装箱货运**：货物被熔进一条连续的胶带里运输。保证不丢、不乱序，但你寄 3 件货可能被压成 1 大件送到（粘包），也可能拆成 5 段分批到（半包）——**没有"件"的概念，只有字节流**。
- **UDP = 散件快递**：每一件都是独立包裹，要么整件到、要么整件丢，**边界天然清晰**。不保证送达，但快。

WebRTC 视频选 UDP 是因为：直播场景丢一帧就丢了，重传来早就过时了；TCP 一旦丢包会扣住后面所有数据（队头阻塞），表现为"卡顿后快进"。

### 1.2 WebRTC 拨号的四步舞

1. **SDP offer/answer**：双方交换"名片"——我支持 H.264 吗？我的地址有哪几个？（SDP 就是文本格式的自我介绍）
2. **ICE candidate**：名片里的候选地址列表（IP+协议+端口），ICE 引擎会挨个试哪条路能通。
3. **STUN 探测**：向对方地址发包测试连通性。
4. **媒体流动**：通了之后，视频以 RTP 包的形式在 UDP 上单向流淌。

### 1.3 WHEP 协议：拉流只需要一个 HTTP POST

WHEP（WebRTC-HTTP Egress Protocol）是 IETF 标准化中的协议，和它孪生兄弟 WHIP（已发布为 RFC 9725）一进一出：

```
播放器                     WHEP端点(MediaMTX:8889)
  │ HTTP POST (SDP offer)      │     "我要看 cam0"
  ├───────────────────────────→│
  │ 201 Created (answer SDP)   │     "好的，这是我的信息"
  │←───────────────────────────┤
  │ HTTP PATCH (补充候选地址)    │     trickle ICE：后想到的地址补交
  ├───────────────────────────→│
  │      ICE探测 + DTLS握手      │
  │◄═══════ RTP视频流(UDP) ═════╡
  │ HTTP DELETE (挂断)          │
  ├───────────────────────────→│
```

**recvonly** = "只收不发"，像收音机只听广播。本项目 App 端就是纯观看者。

### 1.4 长度前缀分帧（length-prefix framing）

TCP 上传 UDP 包必须解决"边界"问题。行业标准做法：每个包前面加一个长度字段。

```
[4字节大端长度][UDP原始载荷][4字节长度][UDP原始载荷]...
```

这个模式和 **gRPC 完全同构**（gRPC 规范：1 字节压缩标志 + 4 字节大端长度 + 消息体），HTTP/2、WebSocket 帧也是同样的思想。

**大端序（big-endian）**= 高位字节在前，是网络世界的通用惯例（所谓网络字节序）。比如 500 = 0x000001F4，编码成 `{0x00, 0x00, 0x01, 0xF4}` 四个字节。跨 ARM 板/x86 Mac 都不会歧义。

---

## 第二部分：主机侧 Relay 精读（server.mjs，263 行）

文件位置：`tools/usb-webrtc-relay/server.mjs`

### 2.1 端口地图（L6–13）

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `port` | **18787** | 对外 HTTP 服务（WHEP 反代 + 运维端点） |
| `boardWhepHost/Port` | 127.0.0.1:**18889** | adb 转发出来的 MediaMTX 入口 |
| `tunnelHost/Port` | 127.0.0.1:**18190** | adb 转发的隧道入口 |
| `relayUdpPort` | **18189** | 自己的 UDP 收发端口（媒体面入口） |
| `relayAdvertiseHost` | **10.0.2.2** | 写进 SDP 的"广告地址" |

注意：18889/18190 这两个端口 relay 自己不监听——那是 **adb forward 在主机侧开出的假端口**，relay 只是作为客户端去连。

启动脚本 `start-usb-mode.sh` 建了三条转发（这是全链路的骨架）：

```bash
adb forward tcp:18999 tcp:8999    # 控制 API 直通
adb forward tcp:18889 tcp:8889    # WHEP 信令直通
adb forward tcp:18190 tcp:18190   # UDP 隧道通道
```

> 💡 **10.0.2.2 是什么？** Android 模拟器基于 QEMU，官方规定模拟器内访问 `10.0.2.2` 等于访问宿主机的 `127.0.0.1`。模拟器里的 `127.0.0.1` 指模拟器自己，不是 Mac！

### 2.2 核心魔法一：SDP 手术（L149–166 `rewriteSdpCandidates`）

MediaMTX 回给 App 的 answer SDP 里写的候选地址是板子自己的 IP（比如局域网 IP 或 127.0.0.1）——从模拟器视角这些地址**全部不可达**。照原样下发，App 的 ICE 引擎会对着一堆黑洞地址发包直到超时。

所以 relay 干脆冒名顶替：

```js
// 逐行扫描 SDP：
// 匹配到 udp host 候选 → IP/端口整体替换成 10.0.2.2:18189（L161）
// 匹配到 tcp host 候选 → 整行删除（L157, L164）
// 其他行原样保留
```

改写后 App 看到的世界极其简单："只有一个候选，而且一定可达"。协商确定性 100%。代价是 relay 必须永远在线成为单点——但在调试场景下确定性远比去中心化重要。

配套还有 `rewriteLocation`（L168–181）：MediaMTX 用 `Location` 头告诉客户端会话 URL（后续 DELETE 用），也要改写成 App 够得着的 `http://10.0.2.2:18787/board-webrtc/...`。

细节控：删掉 `content-length` 头再回给客户端（L208–218）——因为 SDP 被改写后体积变了，留着旧长度会让客户端解析出错。

### 2.3 核心魔法二：UDP↔TCP 会话表（L110–147)

**怎么区分"哪个 App 会话"？** 用 `源IP:源端口` 做 key（`getClient` L110–128）。一个 WebRTC 端只用一个本地 UDP socket 收发所有包，所以同一 IP+端口的包必然来自同一个会话——这相当于 ICE 层免费送的"会话 ID"。

每个会话独享：

- 一条到 `127.0.0.1:18190` 的 TCP 连接（懒建立，`ensureTunnel` L82–108）
- 一个攒包缓冲区 `buffer`（处理 TCP 粘包半包）
- 一个待发队列 `queue`（隧道未就绪时暂存，64 包上限，满了丢最旧的——宁可丢旧帧也不能内存爆炸，对实时视频这是正确取舍）

**超时清理**（`cleanupStaleClients` L49–55）：每 2 秒扫一遍，8 秒没动静的会话直接关掉。不做的话每次 App 重启都留僵尸连接，文件描述符迟早耗尽。

### 2.4 核心魔法三：双向封帧/拆帧

发方向（`writeTunnelFrame` L57–61）：

```js
const header = Buffer.allocUnsafe(4);
header.writeUInt32BE(message.length, 0);   // 4字节大端长度头
tunnel.write(Buffer.concat([header, message]));
```

收方向（`receiveTunnelFrames` L63–80）：

- `Buffer.concat` 攒字节（处理半包）
- 循环读 4 字节长度，`size <= 0 || size > 65535` 判定流错位 → 直接销毁隧道重来
- 凑齐完整帧 → 剥头 → `udpSocket.send()` 还原成 UDP 发回 App

### 2.5 HTTP 路由（L226–256）

```
GET  /stream-health   → 健康检查 JSON（启动脚本靠它确认就绪）
GET  /relay-stats     → 客户端数、双向包数/字节数、最近错误
POST /relay-reset     → 清空所有会话（运维调试用）
/*   /board-webrtc/*  → 进 proxyWhep 反代
其余                   → 404
```

---

## 第三部分：板端 C 隧道精读（board_webrtc_udp_tunnel.c，316 行）

文件位置：`tools/board_webrtc_udp_tunnel/board_webrtc_udp_tunnel.c`

### 3.1 程序结构：单线程死循环扮演三个角色

| 角色 | 代码位置 | 干什么 |
| --- | --- | --- |
| TCP 服务器 | L84–113 建、L190–218 接客 | 监听 127.0.0.1:18190 等 adb 连接 |
| UDP 客户端 | L55–82 建、L286 发 | 每个 TCP 客户端配一条到 127.0.0.1:8189 的 UDP 通道 |
| 双向搬运工 | L220–240、L242–302 | `select()` 同时盯所有 socket，哪边有数据往另一边搬 |

启动命令：`board_webrtc_udp_tunnel 18190 127.0.0.1 8189`（参数由 start-usb-mode.sh 传入）。

### 3.2 最精妙的设计：每个 TCP 客户端一个专属 UDP socket（L205）

**为什么不能共用一个 UDP socket？** UDP 没有"连接"概念。如果所有客户端共用，MediaMTX 回来的视频包混在一个队列里，程序分不清该还给谁。

现在的做法：每个 TCP 客户端创建独立的 UDP socket，内核给它们分配不同的随机源端口。MediaMTX 回包时按源端口就能精确路由到对应的 TCP 连接——**多路分发零成本，全靠内核免费提供的五元组区分机制**。

类比：银行柜台给每个客户一个专属回邮信箱号，回信绝不会寄错人。

还有一个细节（L75）：对 UDP socket 调用了 `connect()`。TCP 的 connect 是真的握手，但 **UDP 的 connect 不发任何网络包**，只是在内核登记"默认对端"+开启来源过滤——之后内核自动丢弃不是来自 MediaMTX:8189 的杂散包。

### 3.3 保命三件套

1. **signal(SIGPIPE, SIG_IGN)**（L131）：往已关闭的 socket 写数据，Linux 默认直接杀进程。忽略后写失败只返回 -1，程序继续活着。7×24 守护进程必备。
2. **TCP 只绑 127.0.0.1**（L97）：只接受板子内部（即 adb 转发进来）的连接。如果绑 0.0.0.0，同一 WiFi 下任何人都能连上这个无鉴权裸隧道，安全模型崩塌。
3. **100ms select 超时**（L180–181）：保证 Ctrl+C 后最多 0.1 秒就能检查退出标志优雅退出。

另有 watchdog.sh 每 5 秒检查进程存活，挂了自动拉起。

### 3.4 灵魂代码：TCP→UDP 拆帧状态机（L242–302）

```c
// 攒包：新读到的字节追加进 recv_buf（L260–266）
// 总量超 64KB → 清空丢弃（宁丢不崩）

// 切帧循环（L268–292）：
while (recv_len - pos >= 4) {                          // 至少够读一个头
    plen = (buf[pos]<<24)|(buf[pos+1]<<16)|            // 还原大端长度
           (buf[pos+2]<<8)|(buf[pos+3]);
    if (plen == 0 || plen > 65535) { 清空缓冲; break; } // 非法长度→重新同步
    if (recv_len - pos < 4 + plen) break;              // 不够整帧→等下次
    sendto(udp_sock, recv_buf+pos+4, plen, ...);       // 剥头发出
    pos += 4 + plen;                                   // 下一帧
}

// 尾巴搬移：pos 之后的半个帧 memmove 到缓冲区头部（L294–299）
```

三种情况全覆盖：

- **粘包**（一次读到 N 个完整帧）→ while 循环连续切
- **半包**（只读到半截）→ break 等下次，残料保留
- **脏数据**（长度字段非法）→ 清空缓冲区重新同步

### 3.5 诚实指出代码瑕疵（面试加分项！）

1. **L234–236 双次 write 未处理半截写入**：非阻塞 fd 大流量时可能只写出一部分，payload 的 write 返回值完全没检查。一旦发生，长度前缀和数据错位，后续所有帧全乱。（实践中走本机回环+ADB、包小，很少触发）
2. **无校验和/魔数**：流上错一个字节若碰巧落在合法长度区间，错误会持续传播直到某次触发清空。本地可信链路够用，公网不严谨。
3. **EAGAIN 当断线处理**（L248）：理论风险。

> 这些瑕疵说明什么？说明作者清楚这是"本地可信链路的专用工具"，刻意选择了最简单的实现——嵌入式工程里"在最窄的地方打洞"的取舍智慧。

### 3.6 内存设计

启动时一次性 calloc 64 个客户端槽位 × 各预分配 64KB 缓冲 ≈ 4MB 固定开销，运行期零动态分配。资源受限的 RV1106（单核 A7）上，"固定内存 + 无锁单线程 select"行为最可预测，实时媒体最怕调度抖动。

---

## 第四部分：App 侧传输层精读

### 4.1 两套端点配置（transport.ts L26–71）

```ts
wifi: {
  base: 'http://192.168.1.1:8999',        // 用户可配置 IP，getter 动态求值
  whep: 'http://192.168.1.1:8889/cam0/whep',
},
usb: {
  base: 'http://10.0.2.2:18999',          // adb 转发的控制口
  whep: 'http://10.0.2.2:18787/board-webrtc/cam0/whep',  // 注意！指向 relay 不是 MediaMTX
}
```

USB 模式下 WHEP 打的是 relay 的 18787，不是 adb 直转的 18889——因为 MediaMTX 的 answer 里有不可达候选，必须经 relay 的 SDP 手术。

### 4.2 WHEP 客户端（whep-service.ts）

关键流程（L174–218）：

```ts
peer.addTransceiver('video', { direction: 'recvonly' });
peer.addTransceiver('audio', { direction: 'recvonly' });   // 必须带！
peer.createDataChannel('');                                 // 必须带！
```

踩坑记录写在注释里：**必须凑齐 video+audio+datachannel 三件套**，否则 MediaMTX 对纯视频 offer 的应答会导致协商卡死。这不是标准要求，是对着浏览器参考实现逐条复刻的经验值。

其他要点：

- POST offer 若返回 404 → 每 80ms 重试最长 1.8 秒（MediaMTX 冷启动还没从 RTSP 源拉到流，端点暂时不存在）
- 迟到的 ICE 候选用 PATCH 补交（trickle ICE），不补交会"能看但疯狂卡顿"
- 断连判定**只认 `failed` 不认 `disconnected`**（L163–172）：Android 的 WebRTC 正常握手中也会短暂报 disconnected，据此重连会把健康会话掐死在第一帧之前
- 视频帧出口：`ontrack` → 本地 MediaStream → `stream.toURL()` → `<RTCView>` 原生组件渲染（实际组件名是 RTCView，不是 RTCVideoView）

### 4.3 双链路自动切换（transport.ts + camera-store.ts）

**并行探测**（probeTransports L156 起）：

```ts
const [a, b] = await Promise.all([probe(preferred), probe(other)]);
// 串行的坑：首选链路死了要先白等满 2 秒超时才试另一条
// 两条都死返回 null → 保持现状，防止"全网断线"被误判成"该换链路"
```

**双 5 秒防抖**（maybeFallbackTransport camera-store.ts L272–290）：

```ts
if (Date.now() - disconnectedSince < TRANSPORT_FALLBACK_GRACE_MS) return;  // 断开不满 5 秒不切
if (Date.now() - lastProbeAt < TRANSPORT_PROBE_MIN_INTERVAL_MS) return;    // 距上次探测不满 5 秒不探
```

为什么必须防抖：USB 重新枚举一次会闪断一两秒且一个会话发生好几次，没有 grace 的话画面每隔一会儿就抽风一次（每次切换 = 拆 WebSocket + 拆 WHEP + 全部重建）。

**切换顺序严格三步**（applyTransport L299–310）：

```
disconnect() → setActiveTransport(new) → connect()
```

只改地址不断开的话会出现"控制走新链路、视频挂旧链路"的劈叉状态。

隐蔽但重要的决策：fallback 检查挂在 WebSocket 的 `onStatusChange` 上而不是 `onGiveUp`——因为 socket 是 `retryForever: true` 创建的，`onGiveUp` 永远不会触发，挂错地方自动切换就是死代码。

**axios 动态 baseURL**（client.ts L25–52）：请求拦截器在每个请求发出前重设 baseURL = getCameraBaseUrl()。所有 URL 都是"用时求解"绝不缓存，所以链路切换后三条通道（axios/WebSocket/WHEP）全自动跟着走。

---

## 第五部分：数据全程走一遍（背下来就是面试高手）

### USB 模式完整时序（12 步）

**信令面：**

1. App 向 `http://10.0.2.2:18787/board-webrtc/cam0/whep` POST SDP offer
2. relay 剥掉 `/board-webrtc` 前缀、改 Host 头，转发到 `127.0.0.1:18889` → adb forward → 经 USB → 板子 MediaMTX:8889
3. MediaMTX 回 201 + answer SDP + Location 头
4. relay 执行 SDP 手术：udp host 候选全部替换为 `10.0.2.2:18189`，tcp 候选删除，Location 改写，删 content-length，回给 App
5. App 的 ICE 引擎拿到唯一可达候选，协商锁定

**媒体面（App→板子）：**
6. App 从 UDP socket 向 `10.0.2.2:18189` 发 STUN/SRTP 数据报
7. relay 以 `源IP:源端口` 为 key 建/取会话，为该会话打开到 `127.0.0.1:18190` 的 TCP 连接
8. 加 4 字节大端长度头写入 TCP → adb forward → 经 USB → 板子 18190
9. C 隧道按 `[4字节长度][载荷]` 拆帧，剥头后 `sendto` 到本机 `127.0.0.1:8189`
10. MediaMTX 收到 STUN/RTP 包，当作普通 WebRTC 客户端处理（ICE 校验由它完成，relay 只是搬运工）

**媒体面（板子→App）：**

 1. MediaMTX 回包（STUN 响应、SRTP 视频）→ C 隧道专属 UDP socket 收到 → 加 4 字节头写回 TCP → adb → relay
 2. relay 拆帧还原 UDP，按会话表精确送回 App 的临时端口。静默超 8 秒的会话每 2 秒巡检回收

WiFi 模式则简单得多：控制 WebSocket 直连 192.168.1.1:8999，WHEP POST 直打 192.168.1.1:8889，视频 UDP 局域网直传，无需任何中转。

---

## 第六部分：这套方案在业界处于什么水平

| 维度 | 本项目 | 业界同类 |
| --- | --- | --- |
| UDP-in-TCP 模式 | 板端 C 程序 + 主机 relay | badvpn-udpgw、hev-socks5-server 的 FWD UDP 扩展、udp2raw、WireGuard-over-TCP 社区方案——**成熟模式而非野路子** |
| 分帧协议 | [4字节大端长度][载荷] | 与 gRPC 规范完全同构（HTTP/2、WebSocket 也是同思想家族） |
| 已知技术债 | TCP 队头阻塞引入延迟抖动 | 业界公认；USB 直连丢包率极低所以伤害可控；udp2raw 甚至为此发明"FakeTCP"（模拟握手但无拥塞控制允许乱序）来绕开 |
| 为什么不用 RNDIS/NCM 虚拟网卡 | adb forward 免驱动免配置，一套 platform-tools 通吃 Win/Mac/Linux | RNDIS 依赖宿主机虚拟网卡+DHCP+驱动策略，新版 Windows 兼容性收紧；iOS 则完全没有这条路（要用 usbmuxd/iproxy） |

**架构上最聪明的一点**：改动被压缩到一个 300 行零依赖的 C 文件 + 一个 Node 单文件。手机端照常跑标准 WebRTC 库，板端照常跑标准 MediaMTX，**协议栈一行没动**。如果将来要支持 iOS，只需替换底层管道（usbmuxd/iproxy），上层分帧协议原样复用。

---

## 第七部分：存疑清单（复盘时要带着这些问题去看代码）

1. **8189 端口身份未在仓库内证实**：C 隧道把 UDP 发往 127.0.0.1:8189，与 MediaMTX 默认 WebRTC 端口吻合，文档也提到 `webrtcLocalUDPAddress: :8189`，但 MediaMTX 配置文件本身不在仓库这几个目录里
2. **srflx 类型 ICE 候选未处理**：relay 正则只匹配 `typ host`，其他类型候选会原样透传
3. **8 秒会话超时的依据未见文档**：硬编码经验值
4. **板端 C 程序的编译脚本不在仓库**：部署路径 `/userdata/hjc_test/board_webrtc_udp_tunnel` 出现在 watchdog.sh 里，但交叉编译命令无处可查

---

## 第八部分：一句话总结（电梯演讲版）

> 「WebRTC 视频天生走 UDP，而 adb 只能转 TCP。我在 USB 线两端各放一个翻译官：主机侧 Node.js relay 通过正则改写 SDP 里的 ICE 候选实现'冒名顶替'，让 App 以为相机就在眼前；两侧再用 4 字节大端长度前缀的分帧协议（与 gRPC 同构）把 UDP 报文可靠地封装进 TCP 穿越 USB，板端 300 行 C 程序负责解包还原并按'每客户端专属 UDP socket'实现多路分发。加上 App 侧并行探测 + 双 5 秒防抖的 WiFi/USB 自动切换，最终实现了纯 USB 线下的 WebRTC 实时取景。」

---

## 附录：关键文件索引

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `tools/usb-webrtc-relay/server.mjs` | 263 | 主机侧 relay 全部逻辑 |
| `tools/board_webrtc_udp_tunnel/board_webrtc_udp_tunnel.c` | 316 | 板端 C 隧道 |
| `tools/usb-webrtc-relay/mac/start-usb-mode.sh` | - | adb 转发 + 服务拉起 + launchd 安装 |
| `src/features/home/camera/transport.ts` | ~165 | 双链路端点配置与探测 |
| `src/features/home/camera/config.ts` | 101 | URL 动态解析 |
| `src/features/home/camera/services/whep-service.ts` | ~300 | WHEP 拉流客户端 |
| `src/features/home/camera/camera-store.ts` | 1069 | 状态中枢（重点看 L260–310、L511–604） |
| `docs/视频流链路详解.md` | 859 | 中文架构文档（实机核实） |
| `docs/USB-MODE-QUICK-START.md` | 152 | 快速上手 + 端口映射图 |
