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
cd tools/usb-webrtc-relay/mac
./start-usb-relay.sh           # 自动检测设备
./start-usb-relay.sh <serial>  # 指定设备
./restore-usb链路.sh            # 板子重连后一键恢复
```

### Windows (PowerShell)

```powershell
cd tools/usb-webrtc-relay/win
.\start-usb-relay.ps1           # 自动检测设备
.\start-usb-relay.ps1 -Serial <serial>  # 指定设备
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

## 监控功能

脚本会自动启动一个后台监控进程:
- 每 5 秒检查设备连接状态
- 自动维护 ADB 端口转发
- 自动重启 relay 服务(如果崩溃)

## 停止服务

按 `Ctrl+C` 停止,脚本会自动清理:
- 终止 Node.js 服务器进程
- 终止监控进程
- (ADB 端口转发会在设备断开或重启 ADB 时自动清除)

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

### 4. 健康检查失败

```bash
# 检查 Node.js 是否安装
node --version

# 检查 server.mjs 是否存在
ls -l server.mjs

# 手动测试端口转发
curl http://127.0.0.1:18999/camera/v1/status
curl http://127.0.0.1:18889/cam0/whep
```

### 5. WebRTC 连接失败

检查物理设备上的 UDP 桥接服务是否运行:

```bash
adb -s <serial> shell "busybox netstat -ln | grep ':18190'"
# 应该看到 LISTEN 状态
```

## 日志查看

启动脚本会输出关键信息:
- 设备序列号
- ADB 端口转发状态
- Relay 服务器状态
- 健康检查结果

监控脚本日志前缀: `[usb-relay-watch]`

## 与 Windows 版本的区别

| 功能 | Windows (PowerShell) | macOS (Bash) |
|-----|---------------------|--------------|
| 互斥锁 | Threading.Mutex | flock 文件锁 |
| 端口检查 | Get-NetTCPConnection | lsof |
| 进程管理 | Start-Process | nohup / & |
| 路径分隔符 | \ | / |
| ADB 路径 | adb.exe | adb |

## 参考

- macOS Scripts: `mac/start-usb-relay.sh`, `mac/watch-usb-relay.sh`, `mac/restore-usb链路.sh`
- Windows Scripts: `win/start-usb-relay.ps1`, `win/watch-usb-relay.ps1`
- Relay Server: `server.mjs`
- 项目配置: `../../.env`
