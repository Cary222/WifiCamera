# start-wifi-camera Skill

一键启动 WiFi Camera 项目完整开发环境的 Cursor Agent Skill。

## 功能

自动启动并验证：
- ✅ USB 物理板子连接
- ✅ ADB 端口转发（8999→18999, 8889→18889, 18190→18190）
- ✅ 板子服务（net_server_test + board_webrtc_udp_tunnel）
- ✅ launchd 托管的 relay 服务
- ✅ Expo Dev Server（Metro bundler）
- ✅ 完整链路健康检查

## 触发方式

在 Cursor Agent 对话中说：
- "启动服务"
- "start services"
- "开始开发"
- "run the app"
- "start wifi camera"

## Skill 文件结构

```
.cursor/skills/start-wifi-camera/
├── SKILL.md                 # 主 skill 文件（245 行）
├── quick-reference.md       # 快速参考（81 行）
├── troubleshooting.md       # 故障排查指南（355 行）
└── README.md                # 本文件
```

## 使用示例

### 场景 1：首次启动项目

```
User: 启动服务

Agent: 
✅ 检查前置条件通过
✅ 启动 USB 链路（Terminal 1）
✅ 启动 Expo Dev Server（Terminal 2）
✅ 健康检查通过
🎉 开发环境已就绪！

下一步：
1. 在 Expo Terminal 按 'a' 启动模拟器
2. 等待 App 安装并运行
3. 在 App 中点击预览按钮查看摄像头画面
```

### 场景 2：启动失败时自动排查

```
User: 启动服务

Agent:
❌ 未找到物理设备

正在排查...
- adb devices 输出：List of devices attached（空）
- USB 连接状态：未检测到设备

建议：
1. 检查 USB 线连接
2. 确认板子已开启 USB 调试
3. 运行 `adb devices` 并授权设备

需要我生成详细的故障排查报告吗？
```

### 场景 3：查看服务状态

```
User: 检查 WiFi Camera 服务状态

Agent:
📊 服务状态：
✅ USB 设备：ABC12345678 已连接
✅ ADB Forward：3 条规则已建立
✅ 板子服务：net_server_test + board_webrtc_udp_tunnel 运行中
✅ relay 服务：PID 53576，运行时长 2h 15m
✅ Expo Server：Metro 运行在 http://localhost:8081
✅ 健康检查：所有端点响应正常
```

## 快速命令参考

| 命令 | 用途 |
|-----|------|
| `bash tools/usb-webrtc-relay/mac/start-usb-mode.sh` | 启动 USB 链路 |
| `bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh` | 停止 relay 服务 |
| `pnpm start` | 启动 Expo Dev Server |
| `curl http://127.0.0.1:18787/stream-health` | 检查 relay 健康 |

## 相关文档

- 主 skill 文档：`SKILL.md` - 完整启动流程和验收标准
- 快速参考：`quick-reference.md` - 常用命令速查表
- 故障排查：`troubleshooting.md` - 9 大场景排查指南
- USB 模式详解：`../../tools/usb-webrtc-relay/README-macOS.md`
- 快速上手：`../../docs/USB-MODE-QUICK-START.md`

## 依赖

- **必需**：pnpm, Node.js v16+, ADB, USB 物理板子
- **可选**：Android 模拟器（MuMu 推荐）

## 平台支持

- ✅ macOS（launchd 托管）
- ⚠️ Windows（需要适配 PowerShell + Task Scheduler）
- ⚠️ Linux（需要适配 systemd）

## 维护

- **创建日期**：2026-08-19
- **最后更新**：2026-08-19
- **维护者**：WiFi Camera Team

## 版本历史

### v1.0.0 (2026-08-19)
- 初始版本
- 支持 USB 模式完整链路启动
- 包含 launchd 服务托管
- 提供详细故障排查指南
