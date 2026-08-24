# WiFi Camera 服务启动 - 快速参考

## 一键启动命令

```bash
# 1. 启动 USB 链路（新 Terminal）
bash tools/usb-webrtc-relay/mac/start-usb-mode.sh

# 2. 启动 Expo（新 Terminal）
pnpm start

# 3. 按 'a' 启动 Android 模拟器
```

## 健康检查

```bash
# relay 健康
curl http://127.0.0.1:18787/stream-health

# 摄像头 API
curl http://127.0.0.1:18999/camera/v1/status

# launchd 服务状态
launchctl print gui/$(id -u)/com.wificamera.usb-relay | grep state
```

## 停止服务

```bash
# 停止 Expo（在 Expo Terminal 按 Ctrl+C）

# 停止 relay
bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh
```

## 日志位置

```bash
# relay 日志
tail -f /tmp/wifi-camera-usb/relay.log
tail -f /tmp/wifi-camera-usb/relay-error.log

# 板子日志（通过 ADB）
adb logcat | grep -E '(net_server|board_webrtc)'
```

## 常见错误

| 错误信息 | 原因 | 解决 |
|---------|------|------|
| `未找到物理设备` | USB 未连接 | `adb devices` 确认 |
| `端口 18787 被占用` | relay 已运行 | 先运行 stop 脚本 |
| `健康检查超时` | relay 启动慢 | 等待 5-10 秒重试 |
| `Metro bundler failed` | 依赖缺失 | `pnpm install` |

## 端口映射速查

| 服务 | 板子端口 | ADB Forward | Relay 端口 | 模拟器访问 |
|-----|---------|------------|-----------|-----------|
| 摄像头 API | 8999 | 18999 | - | 10.0.2.2:18999 |
| WHEP | 8889 | 18889 | 18787 | 10.0.2.2:18787/board-webrtc/cam0/whep |
| UDP 隧道 | 18190 | 18190 | 18189 | 10.0.2.2:18189 |

## .env 配置

```bash
# USB 模式（默认）
EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep
```

## 完整验收清单

- [ ] `adb devices` 显示物理设备
- [ ] `curl http://127.0.0.1:18787/stream-health` 返回 `"ready":true`
- [ ] `curl http://127.0.0.1:18999/camera/v1/status` 返回状态
- [ ] Expo Terminal 显示 Metro 运行中
- [ ] 模拟器成功启动并安装 App
- [ ] App 首页显示摄像头控制界面
- [ ] 点击预览按钮能看到摄像头画面
