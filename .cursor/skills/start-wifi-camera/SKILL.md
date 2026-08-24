---
name: start-wifi-camera
description: >-
  一键启动 WiFi Camera 项目的所有服务（USB 模式板子链路 + Expo Dev Server）。
  Use when user says "启动服务" / "start services" / "开始开发" / "run the app" / "start wifi camera".
---

# WiFi Camera 服务启动助手

本 skill 用于快速启动 WiFi Camera 项目的完整开发环境。

## 触发场景

- 用户说"启动服务" / "start services" / "开始开发"
- 用户说"运行 WiFi Camera" / "run the app"
- 用户询问"怎么启动项目" / "如何运行"
- 用户提到"USB 模式" + "启动"

## 服务架构

WiFi Camera 项目需要启动两个独立服务：

```
┌─────────────────────────────────────────────────────────┐
│ 1. USB 模式板子链路 (物理设备 → ADB → relay → 模拟器)     │
│    - 检测并连接物理板子                                    │
│    - ADB 端口转发 (8999→18999, 8889→18889, 18190→18190) │
│    - 启动板子服务 (net_server_test + board_webrtc_udp)   │
│    - launchd 托管 relay 服务 (自动重启)                    │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Expo Dev Server (React Native 开发服务器)             │
│    - Metro bundler                                       │
│    - 热更新 HMR                                          │
│    - 开发者工具                                          │
└─────────────────────────────────────────────────────────┘
```

## 执行步骤

### Step 1: 检查前置条件

```bash
# 检查 pnpm 是否安装
which pnpm

# 检查 ADB 是否可用
which adb || echo "需要设置 ANDROID_SDK_ROOT"

# 检查 USB 物理设备连接
adb devices -l
```

**预期结果**：
- pnpm 已安装
- adb 在 PATH 中或 ANDROID_SDK_ROOT 已设置
- 至少有一个非模拟器设备在线

**失败处理**：
- pnpm 未安装 → 提示用户安装：`npm install -g pnpm`
- adb 不可用 → 提示设置环境变量或安装 Android SDK
- 无物理设备 → 询问用户是否要在 WiFi 模式下启动（只启动 Expo）

### Step 2: 启动 USB 模式板子链路

在**新 Terminal** 中运行（避免阻塞当前会话）：

```bash
cd /Volumes/WorkStation/new/WifiCamera
bash tools/usb-webrtc-relay/mac/start-usb-mode.sh
```

**启动流程**：
1. 自动检测 USB 物理设备
2. 建立 ADB 端口转发
3. 在板子上启动 net_server_test（端口 8999）
4. 在板子上启动 board_webrtc_udp_tunnel（端口 8889）
5. 使用 launchd 启动 relay 服务（端口 18787）

**验收标准**：
```bash
# 健康检查端点返回 ready
curl -s http://127.0.0.1:18787/stream-health | grep '"ready":true'

# 摄像头 API 可访问
curl -s http://127.0.0.1:18999/camera/v1/status | grep -E '(IDLE|RECORDING)'
```

**常见问题**：
- `未找到物理设备` → 检查 USB 连接，运行 `adb devices` 确认设备在线
- `端口被占用` → 脚本会自动清理，如失败运行 `bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh`
- `relay 启动失败` → 查看日志 `tail -f /tmp/wifi-camera-usb/relay-error.log`

### Step 3: 启动 Expo Dev Server

在**另一个新 Terminal** 中运行：

```bash
cd /Volumes/WorkStation/new/WifiCamera
pnpm start
```

**启动流程**：
1. 启动 Metro bundler
2. 监听文件变化（HMR）
3. 提供开发者菜单

**验收标准**：
- Terminal 输出包含 QR 码和连接选项
- 显示 `Metro waiting on...`
- 可以看到 `› Press a │ open Android` 选项

**常见问题**：
- `依赖缺失` → 运行 `pnpm install`
- `端口 8081 被占用` → 杀死占用进程或使用 `pnpm start --port 8082`
- `Metro 崩溃` → 清除缓存 `pnpm start --clear`

### Step 4: 启动 Android 模拟器

```bash
# 方式 1: 通过 Expo
# 在 Expo Dev Server Terminal 中按 'a'

# 方式 2: 手动启动 MuMu 模拟器（推荐）
# 打开 MuMu 模拟器 GUI，然后在 Expo Terminal 按 'a'
```

**验收标准**：
- 模拟器成功启动
- App 安装并运行
- 首页显示摄像头控制界面

### Step 5: 最终验证

```bash
# 1. USB 链路健康
curl -s http://127.0.0.1:18787/stream-health

# 2. 摄像头 API（从模拟器视角）
# 在模拟器中访问 http://10.0.2.2:18999/camera/v1/status

# 3. relay 服务状态
launchctl print gui/$(id -u)/com.wificamera.usb-relay | grep "state = running"

# 4. Expo 服务
curl -s http://localhost:8081/status | grep "packager-status.*running"
```

**全部通过** → ✅ 开发环境就绪，可以开始开发

## 停止服务

### 停止顺序（优雅关闭）

1. **停止 Expo Dev Server**：
   ```bash
   # 在 Expo Terminal 按 Ctrl+C
   ```

2. **停止 USB 链路**：
   ```bash
   bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh
   ```

3. **（可选）清理板子进程**：
   ```bash
   adb shell "killall net_server_test board_webrtc_udp_tunnel"
   ```

### 紧急停止（强制清理）

```bash
# 停止 launchd relay 服务
launchctl stop gui/$(id -u)/com.wificamera.usb-relay

# 杀死所有 node 进程（⚠️ 会影响其他 Node.js 服务）
killall -9 node

# 清理 ADB 转发
adb forward --remove-all
```

## 快捷命令总结

| 命令 | 用途 |
|-----|------|
| `bash tools/usb-webrtc-relay/mac/start-usb-mode.sh` | 启动 USB 链路 |
| `pnpm start` | 启动 Expo Dev Server |
| `pnpm android` | 启动 Expo + 自动打开模拟器 |
| `bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh` | 停止 relay 服务 |
| `curl http://127.0.0.1:18787/stream-health` | 检查 relay 健康 |
| `tail -f /tmp/wifi-camera-usb/relay.log` | 查看 relay 日志 |
| `adb devices -l` | 检查设备连接 |

## 环境变量检查清单

启动前确认 `.env` 文件配置正确：

```bash
# USB 模式（通过 relay 访问）
EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep

# WiFi 模式（直连板子，需在同一局域网）
# EXPO_PUBLIC_CAMERA_BASE_URL=http://<板子IP>:8999
# EXPO_PUBLIC_CAMERA_WHEP_URL=http://<板子IP>:8889/cam0/whep
```

## Agent 执行模板

当用户触发本 skill 时，Agent 应：

1. **读取前置条件**，判断是否满足
2. **使用 Shell 工具**启动 USB 链路（`block_until_ms: 10000`，等待初始化）
3. **使用 Shell 工具**启动 Expo Dev Server（`block_until_ms: 0`，后台运行）
4. **读取 Terminal 输出**确认服务状态
5. **运行验收命令**确保链路畅通
6. **向用户报告**最终状态和下一步操作

## 相关文档

- USB 模式详细说明：`tools/usb-webrtc-relay/README-macOS.md`
- 快速上手指南：`docs/USB-MODE-QUICK-START.md`
- 项目约定：`.cursor/skills/wifi-camera-app-conventions/SKILL.md`

## 故障排查索引

| 问题 | 排查命令 | 解决方案 |
|-----|---------|---------|
| 板子链路启动失败 | `adb devices` | 检查 USB 连接 + 设备授权 |
| relay 启动失败 | `tail -f /tmp/wifi-camera-usb/relay-error.log` | 检查 Node.js 版本 + plist 路径 |
| Expo 启动失败 | `pnpm install` | 重新安装依赖 |
| 模拟器连接不上 | `adb devices` | 确认模拟器已启动 |
| App 无法连接摄像头 | `curl http://10.0.2.2:18999/camera/v1/status` | 检查 .env 配置 + relay 健康 |
| WebRTC 流无画面 | `curl http://127.0.0.1:18787/stream-health` | 检查 UDP 隧道 + 板子服务 |

---

## Meta

- **适用平台**：macOS (launchd)
- **依赖**：pnpm, adb, node v16+, USB 物理板子, Android 模拟器
- **维护者**：WiFi Camera Team
- **最后更新**：2026-08-19
