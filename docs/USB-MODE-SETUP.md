# USB 模式设置指南

## 问题描述

你在使用 Android 模拟器(如 MuMu)运行 WiFi Camera App 时,点击"风景模式"等摄像头模式后,一直显示"连接中",无法建立 WebRTC 连接。

## 根本原因

从终端日志可以看到大量的 `[TypeError: Network request failed]` 错误,这表明:

1. **USB WebRTC Relay 服务未启动** - 这个服务负责将物理设备的 WebRTC 流代理到模拟器可访问的地址
2. **端口转发未建立** - ADB 端口转发需要在每次设备重连后重新设置

## 解决方案

### 方案一:一键恢复链路（板子重连后）

```bash
cd /Volumes/WorkStation/new/WifiCamera
bash tools/usb-webrtc-relay/mac/restore-usb链路.sh
```

这个脚本会依次完成：
1. 查找物理板子 serial
2. 清理旧转发，重建 3 个 ADB Forward
3. kill 旧 relay
4. 启动 `node server.mjs`
5. 检查 `/stream-health`
6. Python WebSocket 握手验证

### 方案二:分步启动（链路已就绪时）

```bash
# 终端 1: 启动 relay（常驻）
bash tools/usb-webrtc-relay/mac/start-usb-relay.sh

# 终端 2: 后台监控（自动重启）
bash tools/usb-webrtc-relay/mac/watch-usb-relay.sh
```

### 方案三:手动指定设备

```bash
cd tools/usb-webrtc-relay/mac
./start-usb-relay.sh <设备序列号>
# 例如:
./start-usb-relay.sh 7b5bf31a5ece29c5
```

### 启动成功的标志

看到以下输出表示服务正常运行:

```
✅ USB WebRTC Relay 启动成功!
   进程 PID: 83078

📝 请确保 .env 配置:
   EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
   EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep
```

## 验证服务状态

### 1. 检查 Relay 服务

```bash
curl http://127.0.0.1:18787/stream-health
```

期望输出:
```json
{
    "ready": true,
    "mode": "adb-udp-tunnel",
    "whep": "127.0.0.1:18889",
    "relay": "10.0.2.2:18189",
    "tunnel": "127.0.0.1:18190"
}
```

### 2. 检查设备控制 API

```bash
curl http://127.0.0.1:18999/camera/v1/status
```

应该能看到设备状态信息。

### 3. 检查 Relay 统计

```bash
curl http://127.0.0.1:18787/relay-stats
```

查看是否有客户端连接和数据传输。

## 架构说明

```
┌─────────────────────┐
│  物理 Android 设备   │  运行摄像头服务
│  (USB 连接)         │  - 8999: 控制 API
│                     │  - 8889: WHEP 端点
│                     │  - 18190: UDP 桥接
└──────────┬──────────┘
           │ USB
           ▼
┌─────────────────────┐
│  Mac (开发机)       │
│  ─────────────────  │
│  ADB Forward:       │  将设备端口映射到本地
│    8999 → 18999     │
│    8889 → 18889     │
│    18190 → 18190    │
│  ─────────────────  │
│  Node.js Relay:     │  重写 ICE candidates
│    HTTP: 18787      │  代理 WHEP 请求
│    UDP: 18189       │  转发 WebRTC 数据包
└──────────┬──────────┘
           │ 10.0.2.2 (模拟器的宿主机网关)
           ▼
┌─────────────────────┐
│  Android 模拟器      │
│  (MuMu/AVD)         │  访问:
│                     │  - http://10.0.2.2:18999 (API)
│  WiFi Camera App    │  - http://10.0.2.2:18787/board-webrtc/cam0/whep
└─────────────────────┘
```

## .env 配置

确保项目根目录的 `.env` 文件包含以下配置:

```bash
# USB 模式配置
EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep
```

**注意**: `10.0.2.2` 是 Android 模拟器访问宿主机的特殊 IP 地址。

## 常见问题

### Q: 服务启动后仍然连接失败?

A: 检查以下几点:
1. 确保设备上的摄像头服务正在运行
2. 重启 App (在模拟器中重新加载)
3. 查看终端日志是否有新的错误信息
4. 检查 relay 统计信息,看是否有数据传输

### Q: 设备断开重连后怎么办?

A: 一键恢复链路即可：
```bash
cd /Volumes/WorkStation/new/WifiCamera
bash tools/usb-webrtc-relay/mac/restore-usb链路.sh
```

### Q: 如何停止服务?

A: 在运行脚本的终端按 `Ctrl+C`，脚本会自动清理所有进程。

### Q: macOS 上没有 flock 命令?

A: 新版监控脚本使用 PID 文件方式实现互斥锁，无依赖。

## 参考文档

- USB WebRTC Relay 详细说明: `tools/usb-webrtc-relay/README-macOS.md`
- 端口桥接替代方案: `tools/simple-port-bridge.sh`
- Windows PowerShell 脚本: `tools/usb-webrtc-relay/win/start-usb-relay.ps1`

## Windows 启动

```powershell
# 启动 relay
powershell -ExecutionPolicy Bypass -File .\tools\usb-webrtc-relay\win\start-usb-relay.ps1

# 后台监控（自动重启）
powershell -ExecutionPolicy Bypass -File .\tools\usb-webrtc-relay\win\watch-usb-relay.ps1
```

## 故障排查命令

```bash
# 查看设备连接
adb devices -l

# 查看端口占用
lsof -i tcp:18787
lsof -i tcp:18189
lsof -i tcp:18999

# 查看 Node.js 进程
ps aux | grep 'node.*server.mjs'

# 手动测试端口转发
curl http://127.0.0.1:18999/camera/v1/status
curl http://127.0.0.1:18889/cam0/whep

# 查看设备日志
adb -s <serial> logcat | grep -i camera
```
