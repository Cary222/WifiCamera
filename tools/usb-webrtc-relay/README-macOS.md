# USB WebRTC Relay - macOS 使用指南

## 概述

这个工具通过 ADB 将 USB 连接的物理 Android 设备的 WebRTC 摄像头流代理到 Android 模拟器可访问的地址。

## 前置要求

1. **安装 Android SDK Platform Tools**
   - 方式 1: 通过 Android Studio SDK Manager 安装
   - 方式 2: 使用 Homebrew: `brew install android-platform-tools`

2. **设置环境变量**
   ```bash
   export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
   # 或
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   ```

3. **USB 调试设备**
   - 物理 Android 设备已开启 USB 调试
   - 通过 USB 连接到 Mac
   - 运行 `adb devices` 能看到设备

## 快速启动

### macOS

```bash
bash tools/usb-webrtc-relay/mac/start-usb-mode.sh
```

**自动功能：**
- ✅ 自动检测 USB 物理设备
- ✅ 建立 ADB 端口转发
- ✅ 启动板子服务（net_server_test + board_webrtc_udp_tunnel）
- ✅ 使用 launchd 启动 relay 服务（自动重启 + 进程托管）

**管理命令：**
```bash
# 停止 relay
bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh

# 查看服务状态
launchctl print gui/$(id -u)/com.wificamera.usb-relay

# 查看日志
tail -f /tmp/wifi-camera-usb/relay.log
tail -f /tmp/wifi-camera-usb/relay-error.log
```

**优势：**
- 🔄 relay 崩溃时自动重启（launchd KeepAlive）
- 💻 关闭 Terminal 后 relay 继续运行
- 📊 标准化日志输出到 /tmp/wifi-camera-usb/

### Windows (PowerShell)

```powershell
cd tools/usb-webrtc-relay/win
.\start-usb-relay.ps1              # 自动检测设备
.\start-usb-relay.ps1 -Serial <serial>  # 指定设备

# 启动监控（自动维护链路）
.\watch-usb-relay.ps1
```

## 工作原理

```
┌──────────────────┐  USB   ┌──────────────────┐
│  物理设备        │◄──────►│  Mac (ADB Host)  │
│  - 摄像头服务    │        │  - ADB Forward   │
│    8999 (API)    │        │  - Node.js Relay │
│    8889 (WHEP)   │        │  - UDP Tunnel    │
│    18190 (UDP桥) │        │                  │
└──────────────────┘        └────────┬─────────┘
                                     │ 10.0.2.2
                                     ▼
                          ┌──────────────────┐
                          │ Android 模拟器   │
                          │  - App 客户端    │
                          │  - WebRTC 接收   │
                          └──────────────────┘
```

### 端口映射

| 物理设备端口 | ADB Forward | Relay 端口 | 模拟器访问地址 | 用途 |
|-------------|-------------|-----------|---------------|------|
| 8999 | → 18999 | - | http://10.0.2.2:18999 | 摄像头控制 API |
| 8889 | → 18889 | → 18787 | http://10.0.2.2:18787/board-webrtc/cam0/whep | WHEP 端点 |
| 18190 | → 18190 | → 18189 (UDP) | 10.0.2.2:18189 | WebRTC UDP 隧道 |

## 配置 .env

启动成功后,确保项目根目录的 `.env` 文件配置正确:

```bash
EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep
```

## 进程托管

relay 服务由 macOS launchd 托管，提供：
- ✅ **自动重启**：进程崩溃时自动恢复（KeepAlive）
- ✅ **独立运行**：不依赖 Terminal 窗口
- ✅ **标准日志**：stdout/stderr 输出到 /tmp/wifi-camera-usb/

查看服务状态：
```bash
launchctl print gui/$(id -u)/com.wificamera.usb-relay
```

## 停止服务

```bash
bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh
```

**说明**：
- 停止 launchd 服务（不影响 ADB forward 和板子服务）
- ADB 端口转发会在设备断开或重启 ADB 时自动清除

## 故障排查

### 1. 找不到 adb

```bash
# 检查 adb 是否在 PATH 中
which adb

# 如果没有,设置环境变量
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_SDK_ROOT/platform-tools"
```

### 2. 没有设备在线

```bash
# 检查设备连接
adb devices -l

# 如果设备显示 unauthorized,检查手机上的 USB 调试授权弹窗
# 如果设备显示 offline,尝试重启 adb
adb kill-server
adb start-server
```

### 3. 端口被占用

脚本会自动尝试终止占用端口的进程,如果失败:

```bash
# 手动查找占用端口的进程
lsof -ti tcp:18787
lsof -ti tcp:18189

# 终止进程
kill -9 <PID>
```

### 4. relay 启动失败

```bash
# 查看详细错误日志
tail -f /tmp/wifi-camera-usb/relay-error.log

# 检查 launchd 服务状态
launchctl print gui/$(id -u)/com.wificamera.usb-relay

# 手动重启服务
launchctl kickstart gui/$(id -u)/com.wificamera.usb-relay
```

常见原因：
- Node.js 未安装或版本过低（需要 v16+）
- relay 脚本路径错误（检查 plist 中的 ProgramArguments）
- 环境变量缺失（RELAY_WEBRTC_ADVERTISE_HOST）

### 5. 健康检查超时

```bash
# 手动测试端口转发
curl http://127.0.0.1:18999/camera/v1/status
curl http://127.0.0.1:18889/cam0/whep

# 检查 relay 健康端点
curl http://127.0.0.1:18787/stream-health
```

### 6. WebRTC 连接失败

检查物理设备上的 UDP 桥接服务是否运行:

```bash
adb -s <serial> shell "busybox netstat -ln | grep ':18190'"
# 应该看到 LISTEN 状态
```

## 日志查看

**启动脚本输出**：
- 设备序列号
- ADB 端口转发状态
- Relay 服务器状态
- 健康检查结果

**launchd 服务日志**：
```bash
# relay 标准输出
tail -f /tmp/wifi-camera-usb/relay.log

# relay 错误输出
tail -f /tmp/wifi-camera-usb/relay-error.log

# 查看历史日志
cat /tmp/wifi-camera-usb/relay.log
```

## 架构变更

| 方案 | 进程托管 | 重启机制 | Terminal 依赖 | 日志管理 |
|-----|---------|---------|--------------|---------|
| **旧方案** | 手动 & 后台 | watchdog 脚本 | ❌ 必须保持 | stdout 重定向 |
| **新方案** | launchd | KeepAlive | ✅ 无需保持 | StandardOut/ErrorPath |

## 参考

- macOS Scripts: `mac/start-usb-mode.sh`, `mac/stop-usb-relay.sh`
- Windows Scripts: `win/start-usb-relay.ps1`, `win/watch-usb-relay.ps1`
- Relay Server: `server.mjs`
- 项目配置: `../../.env`
