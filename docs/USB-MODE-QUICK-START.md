# USB 模式快速启动指南

> WiFi Camera App 通过 USB 连接板子的完整链路启动指南

## 🎯 一键启动

```bash
# macOS
bash tools/usb-webrtc-relay/mac/start-usb-mode.sh

# Windows
powershell -ExecutionPolicy Bypass -File tools/usb-webrtc-relay/win/start-usb-relay.ps1
```

## ✅ 启动后验证

脚本会自动：
1. ✅ 查找并连接板子设备
2. ✅ 建立 ADB 端口转发（8999、8889、18190）
3. ✅ 启动板子服务（net_server_test、board_webrtc_udp_tunnel）
4. ✅ 启动 relay 服务（18787、18189）- 由 macOS launchd 管理

## 📱 连接 App

### 1. 确认 .env 配置

```env
EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep
```

### 2. 在模拟器中启动 App

```bash
# MuMu 模拟器
pnpm start
# 按 'a' 在 Android 模拟器中打开
# 按 'r' Reload App
```

### 3. 测试视频流

进入相机页面，应该能看到实时视频流 📹

## 🛠️ 常用命令

### 查看 relay 状态

```bash
# 查看 launchd 服务状态
launchctl print gui/$(id -u)/com.wificamera.usb-relay

# 查看 relay 日志
tail -f /tmp/wifi-camera-usb/relay.log

# 查看 relay 错误日志
tail -f /tmp/wifi-camera-usb/relay-error.log
```

### 停止服务

```bash
# 停止 relay
bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh

# 清理 ADB forward（可选）
adb forward --remove-all
```

## 🔧 故障排查

### relay 启动失败

```bash
# 查看错误日志
cat /tmp/wifi-camera-usb/relay-error.log

# 查看 launchd 服务状态
launchctl print gui/$(id -u)/com.wificamera.usb-relay

# 检查端口占用
lsof -i :18787
lsof -i :18189

# 手动清理并重启
bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh
kill $(lsof -ti tcp:18787,18189) 2>/dev/null
bash tools/usb-webrtc-relay/mac/start-usb-mode.sh
```

### 板子服务未启动

```bash
# 检查板子服务
adb -s <SERIAL> shell "ps | grep -E 'net_server_test|board_webrtc_udp_tunnel'"

# 检查端口监听
adb -s <SERIAL> shell "cat /proc/net/tcp" | grep -E "2327|470E"

# 手动启动
adb -s <SERIAL> shell "cd /userdata/hjc_test && ./net_server_test 8999 &"
adb -s <SERIAL> shell "cd /userdata/hjc_test && ./board_webrtc_udp_tunnel 18190 127.0.0.1 8189 &"
```

### ADB 转发丢失

```bash
# 重新建立转发
adb forward tcp:18999 tcp:8999
adb forward tcp:18889 tcp:8889
adb forward tcp:18190 tcp:18190
```

## 📊 链路架构

```
板子 (192.168.1.x)
  ├─ net_server_test:8999        (控制 API)
  ├─ mediamtx:8889               (WHEP 协商)
  └─ board_webrtc_udp_tunnel:18190 (TCP→UDP 桥接)
       ↓
    USB 连接
       ↓
  ADB 端口转发
    tcp:18999 → tcp:8999
    tcp:18889 → tcp:8889
    tcp:18190 → tcp:18190
       ↓
  relay (Mac/Win)
    ├─ HTTP :18787               (WHEP 代理)
    └─ UDP :18189                (WebRTC 媒体流)
       ↓
  模拟器 (10.0.2.2)
    └─ WiFi Camera App
```

## 🔄 relay 自动维护

relay 服务由 macOS launchd 管理：
- ✅ 自动重启（KeepAlive=true）
- ✅ 独立于 Terminal 生命周期
- ✅ 标准日志输出到 `/tmp/wifi-camera-usb/relay.log`
- ✅ 错误日志输出到 `/tmp/wifi-camera-usb/relay-error.log`

如果 relay 崩溃，launchd 会自动重启。

## 📝 相关文档

- [USB 模式详细文档](./docs/USB-MODE-SETUP.md)
- [macOS 安装指南](./tools/usb-webrtc-relay/README-macOS.md)
- [连接问题排查](./docs/连接问题.md)
- [视频流链路详解](./docs/视频流链路详解.md)
