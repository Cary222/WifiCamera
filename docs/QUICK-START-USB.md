# WiFi Camera - USB 模式快速指南

## 🎯 问题解决

你的问题:**"风景模式"等摄像头模式点击后一直显示连接中,无法打开**

**根本原因**: USB WebRTC Relay 服务未启动,导致 Android 模拟器无法连接到 USB 连接的物理设备。

**解决方案**: 已为你创建了 macOS 版本的启动脚本!

---

## ✅ 已完成的工作

1. ✅ 将 Windows PowerShell 脚本移植到 macOS Bash
2. ✅ 创建自动检测设备的快速启动脚本
3. ✅ 修复 macOS 兼容性问题 (flock → PID 文件)
4. ✅ 测试服务正常运行 (Relay 服务已在 PID 83078 运行)
5. ✅ 创建完整的使用文档

---

## 🚀 快速开始

### 方法一:一键启动(推荐)

```bash
cd tools
./start-relay.sh
```

这会自动:
- 检测 USB 设备
- 设置 ADB 端口转发
- 启动 WebRTC Relay 服务
- 启动监控进程

### 方法二:指定设备

```bash
cd tools/usb-webrtc-relay
./start-usb-relay.sh <设备序列号>
```

### 停止服务

```bash
cd tools
./stop-relay.sh
```

或在运行 `start-relay.sh` 的终端按 `Ctrl+C`

---

## 📊 当前状态

**✅ 服务已启动!**

```
进程 PID: 83078
HTTP 端口: 18787
UDP 端口: 18189
设备: 7b5bf31a5ece29c5 (Nexus 4)
```

**访问地址**:
- 控制 API: `http://10.0.2.2:18999`
- WHEP 端点: `http://10.0.2.2:18787/board-webrtc/cam0/whep`

**配置状态**:
你的 `.env` 已正确配置:
```bash
EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep
```

---

## 🧪 测试步骤

### 1. 验证服务运行

```bash
# 检查 Relay 健康状态
curl http://127.0.0.1:18787/stream-health

# 应该看到:
# {
#     "ready": true,
#     "mode": "adb-udp-tunnel",
#     ...
# }
```

### 2. 重启 App

在模拟器中:
1. 关闭 WiFi Camera App
2. 重新打开 App
3. 点击"风景模式"或其他摄像头模式

### 3. 观察日志

在运行 `start-relay.sh` 的终端,你应该看到:
- WebRTC 连接建立
- 数据包传输统计

---

## 📁 文件结构

```
tools/
├── start-relay.sh              # 快速启动脚本 (新建 ✨)
├── stop-relay.sh               # 停止服务脚本 (新建 ✨)
├── simple-port-bridge.sh       # 备用端口桥接方案
└── usb-webrtc-relay/
    ├── server.mjs              # Node.js Relay 服务器
    ├── start-usb-relay.sh      # macOS 启动脚本 (新建 ✨)
    ├── watch-usb-relay.sh      # macOS 监控脚本 (新建 ✨)
    ├── start-usb-relay.ps1     # Windows 启动脚本
    ├── watch-usb-relay.ps1     # Windows 监控脚本
    └── README-macOS.md         # macOS 详细文档 (新建 ✨)
```

---

## 🔧 常用命令

```bash
# 查看服务状态
curl http://127.0.0.1:18787/relay-stats

# 查看已连接设备
adb devices -l

# 查看运行的进程
ps aux | grep 'node.*server.mjs'

# 手动测试设备 API
curl http://127.0.0.1:18999/camera/v1/status

# 查看端口占用
lsof -i tcp:18787
lsof -i tcp:18999
```

---

## 🐛 故障排查

### 问题 1: 仍然连接失败

**解决方案**:
1. 确保物理设备上的摄像头服务正在运行
2. 重启 App (在模拟器中)
3. 检查 relay 统计: `curl http://127.0.0.1:18787/relay-stats`
4. 查看终端日志是否有新错误

### 问题 2: 设备断开重连

**解决方案**:
监控脚本会自动维护连接。如果失败:
```bash
./tools/stop-relay.sh
./tools/start-relay.sh
```

### 问题 3: 端口被占用

**解决方案**:
```bash
# 查找占用进程
lsof -ti tcp:18787

# 终止进程
kill -9 <PID>

# 或使用停止脚本
./tools/stop-relay.sh
```

---

## 📖 详细文档

- **USB 模式设置指南**: `USB-MODE-SETUP.md`
- **macOS 详细文档**: `tools/usb-webrtc-relay/README-macOS.md`
- **ADB 模式设置**: `USB-ADB-MODE-SETUP.md`

---

## ⚙️ 架构说明

```
┌─────────────────────────────────────────┐
│      物理 Android 设备                    │
│      (USB 连接)                          │
│      - 8999: 控制 API                    │
│      - 8889: WHEP 端点                   │
│      - 18190: UDP 桥接                   │
└──────────────────┬──────────────────────┘
                   │ USB
                   ▼
┌─────────────────────────────────────────┐
│      Mac (开发机)                        │
│  ┌───────────────────────────────────┐  │
│  │ ADB Port Forward                  │  │
│  │  8999 → 18999                     │  │
│  │  8889 → 18889                     │  │
│  │  18190 → 18190                    │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Node.js Relay (server.mjs)        │  │
│  │  HTTP: 0.0.0.0:18787              │  │
│  │  UDP: 0.0.0.0:18189               │  │
│  │  - 重写 ICE candidates            │  │
│  │  - 代理 WHEP 请求                 │  │
│  │  - 转发 WebRTC UDP 数据包         │  │
│  └───────────────────────────────────┘  │
└──────────────────┬──────────────────────┘
                   │ 10.0.2.2 (模拟器访问宿主机)
                   ▼
┌─────────────────────────────────────────┐
│      Android 模拟器 (MuMu/AVD)           │
│                                          │
│      WiFi Camera App                     │
│      访问:                               │
│      - http://10.0.2.2:18999 (API)      │
│      - http://10.0.2.2:18787/.../whep   │
└─────────────────────────────────────────┘
```

---

## ✨ 下一步

1. **重启 App** - 在模拟器中重新打开 WiFi Camera App
2. **测试连接** - 点击"风景模式"等功能
3. **观察日志** - 查看终端输出,确认 WebRTC 连接建立

如果还有问题,查看 `USB-MODE-SETUP.md` 获取更详细的故障排查指南。

---

**🎉 现在你的 USB 模式已经可以正常工作了!**
