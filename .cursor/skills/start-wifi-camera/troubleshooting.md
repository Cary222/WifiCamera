# WiFi Camera 启动故障排查指南

## 诊断流程

按照以下顺序排查问题：

### 1. 基础环境检查

```bash
# 检查 Node.js 版本（需要 v16+）
node --version

# 检查 pnpm
pnpm --version

# 检查 ADB
which adb
adb version

# 检查依赖完整性
cd /Volumes/WorkStation/new/WifiCamera
pnpm install --frozen-lockfile
```

### 2. USB 设备连接检查

```bash
# 列出所有设备
adb devices -l

# 预期输出（示例）：
# List of devices attached
# ABC12345678    device product:board_name model:XXX device:XXX

# 如果显示 unauthorized
# → 检查板子屏幕上是否有 USB 调试授权弹窗

# 如果显示 offline
adb kill-server
adb start-server
adb devices -l
```

### 3. 端口占用检查

```bash
# 检查关键端口是否被占用
lsof -ti tcp:18787  # relay HTTP
lsof -ti tcp:18999  # 摄像头 API (forwarded)
lsof -ti tcp:18889  # WHEP (forwarded)
lsof -ti tcp:8081   # Metro bundler

# 如果有占用，杀死进程
kill -9 $(lsof -ti tcp:18787)
```

### 4. ADB Forward 状态

```bash
# 查看当前转发规则
adb forward --list

# 预期输出：
# ABC12345678 tcp:18999 tcp:8999
# ABC12345678 tcp:18889 tcp:8889
# ABC12345678 tcp:18190 tcp:18190

# 清理所有转发（重新启动会自动建立）
adb forward --remove-all
```

### 5. 板子服务状态

```bash
# 检查板子上的进程
adb shell "ps | grep -E '(net_server|board_webrtc)'"

# 预期输出：
# root  1234  ...  net_server_test
# root  5678  ...  board_webrtc_udp_tunnel

# 检查板子上的端口监听
adb shell "busybox netstat -ln | grep -E '(8999|8889|18190)'"

# 手动启动板子服务（如果缺失）
adb shell "cd /root/wifi_camera/app && ./net_server_test &"
adb shell "cd /root/wifi_camera/app && ./board_webrtc_udp_tunnel &"
```

### 6. launchd relay 服务状态

```bash
# 详细状态
launchctl print gui/$(id -u)/com.wificamera.usb-relay

# 查看关键字段
launchctl print gui/$(id -u)/com.wificamera.usb-relay | grep -E "(state|pid|exit)"

# 如果状态异常，手动重启
launchctl kickstart -k gui/$(id -u)/com.wificamera.usb-relay

# 查看 relay 进程
ps aux | grep server.mjs | grep -v grep
```

### 7. relay 健康检查

```bash
# 完整健康检查响应
curl -v http://127.0.0.1:18787/stream-health

# 预期响应（200 OK）：
# {"ready":true,"mode":"adb-udp-tunnel","whep":"127.0.0.1:18889","relay":"10.0.2.2:18189","tunnel":"127.0.0.1:18190"}

# 如果超时或拒绝连接
tail -20 /tmp/wifi-camera-usb/relay-error.log
```

### 8. 网络连通性测试

```bash
# 从 Mac 测试板子 API（通过 ADB forward）
curl -v http://127.0.0.1:18999/camera/v1/status

# 从模拟器测试（需要模拟器已启动）
adb -e shell "curl http://10.0.2.2:18999/camera/v1/status"

# 测试 relay WHEP 端点
curl -v http://127.0.0.1:18787/board-webrtc/cam0/whep
```

### 9. Expo Dev Server 检查

```bash
# 检查 Metro 是否运行
curl http://localhost:8081/status

# 预期响应：
# {"packager-status":"running"}

# 如果端口 8081 被占用
lsof -ti tcp:8081 | xargs kill -9
pnpm start
```

## 常见错误场景

### 场景 A：USB 链路脚本报错 "未找到物理设备"

**原因**：
- USB 线未连接或松动
- 板子未开启 USB 调试
- ADB 驱动未安装

**解决**：
1. 重新插拔 USB 线
2. 在板子上检查：设置 → 开发者选项 → USB 调试（已开启）
3. 运行 `adb devices`，确认设备显示 `device` 状态
4. 如果显示 `unauthorized`，在板子上点击"允许"

### 场景 B：relay 启动失败，日志显示 "Address already in use"

**原因**：
- 之前的 relay 进程未正常停止
- 其他程序占用了端口 18787

**解决**：
```bash
# 查找占用者
lsof -i tcp:18787

# 如果是旧的 relay 进程
bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh

# 如果是其他进程
kill -9 <PID>

# 重新启动
bash tools/usb-webrtc-relay/mac/start-usb-mode.sh
```

### 场景 C：健康检查一直超时

**原因**：
- Node.js 启动慢（首次需要加载依赖）
- plist 文件中路径错误
- 环境变量缺失

**解决**：
```bash
# 1. 查看 relay 错误日志
tail -50 /tmp/wifi-camera-usb/relay-error.log

# 2. 检查 plist 内容
cat ~/Library/LaunchAgents/com.wificamera.usb-relay.plist | grep ProgramArguments -A 3

# 3. 手动测试 relay 脚本
cd /Volumes/WorkStation/new/WifiCamera/tools/usb-webrtc-relay
RELAY_WEBRTC_ADVERTISE_HOST=10.0.2.2 node server.mjs
```

### 场景 D：App 显示 "Cannot connect to camera"

**原因**：
- .env 配置错误
- relay 未运行
- 板子服务崩溃
- ADB forward 断开

**解决**：
```bash
# 1. 确认 .env 配置
cat /Volumes/WorkStation/new/WifiCamera/.env | grep CAMERA

# 应该是：
# EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999
# EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep

# 2. 从模拟器测试连通性
adb -e shell "curl -v http://10.0.2.2:18999/camera/v1/status"

# 3. 检查完整链路
curl http://127.0.0.1:18787/stream-health
curl http://127.0.0.1:18999/camera/v1/status
adb forward --list

# 4. 如果链路断开，重启 USB 模式脚本
bash tools/usb-webrtc-relay/mac/start-usb-mode.sh
```

### 场景 E：WebRTC 流无画面（黑屏）

**原因**：
- UDP 隧道未建立
- board_webrtc_udp_tunnel 进程崩溃
- 防火墙阻止 UDP 流量

**解决**：
```bash
# 1. 检查板子 UDP 隧道进程
adb shell "ps | grep board_webrtc_udp_tunnel"

# 2. 检查板子端口监听
adb shell "busybox netstat -ln | grep 18190"

# 3. 手动重启板子服务
adb shell "killall board_webrtc_udp_tunnel"
adb shell "cd /root/wifi_camera/app && ./board_webrtc_udp_tunnel &"

# 4. 检查 relay UDP 转发
lsof -i udp:18189

# 5. 查看 relay 日志中的 WebRTC 握手信息
tail -f /tmp/wifi-camera-usb/relay.log | grep -i webrtc
```

### 场景 F：Metro bundler 报错 "Unable to resolve module"

**原因**：
- 依赖未安装
- node_modules 损坏
- Metro 缓存过期

**解决**：
```bash
# 1. 重新安装依赖
rm -rf node_modules
pnpm install

# 2. 清理 Metro 缓存
pnpm start --clear

# 3. 清理所有缓存并重启
rm -rf node_modules .expo
pnpm install
pnpm start --clear
```

## 完整重置流程（最后手段）

如果上述方法都无效，执行完整重置：

```bash
# 1. 停止所有服务
bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh
pkill -f "expo start"
pkill -f "metro"

# 2. 清理 ADB
adb kill-server
adb forward --remove-all

# 3. 清理板子进程
adb shell "killall net_server_test board_webrtc_udp_tunnel"

# 4. 清理 launchd 服务
launchctl unload ~/Library/LaunchAgents/com.wificamera.usb-relay.plist
rm ~/Library/LaunchAgents/com.wificamera.usb-relay.plist

# 5. 清理日志和临时文件
rm -rf /tmp/wifi-camera-usb

# 6. 清理项目缓存
cd /Volumes/WorkStation/new/WifiCamera
rm -rf node_modules .expo
pnpm install

# 7. 重新启动 ADB
adb start-server
adb devices

# 8. 重新启动服务
bash tools/usb-webrtc-relay/mac/start-usb-mode.sh
pnpm start
```

## 日志收集（用于报告问题）

```bash
# 创建诊断报告
mkdir -p ~/wifi-camera-debug

# 收集系统信息
echo "=== System Info ===" > ~/wifi-camera-debug/system.txt
uname -a >> ~/wifi-camera-debug/system.txt
node --version >> ~/wifi-camera-debug/system.txt
pnpm --version >> ~/wifi-camera-debug/system.txt

# 收集 ADB 信息
echo "=== ADB Devices ===" > ~/wifi-camera-debug/adb.txt
adb devices -l >> ~/wifi-camera-debug/adb.txt
echo "=== ADB Forward ===" >> ~/wifi-camera-debug/adb.txt
adb forward --list >> ~/wifi-camera-debug/adb.txt

# 收集 relay 日志
cp /tmp/wifi-camera-usb/relay.log ~/wifi-camera-debug/
cp /tmp/wifi-camera-usb/relay-error.log ~/wifi-camera-debug/

# 收集 launchd 状态
launchctl print gui/$(id -u)/com.wificamera.usb-relay > ~/wifi-camera-debug/launchd.txt

# 收集端口占用信息
lsof -i tcp:18787 > ~/wifi-camera-debug/ports.txt
lsof -i tcp:18999 >> ~/wifi-camera-debug/ports.txt
lsof -i tcp:8081 >> ~/wifi-camera-debug/ports.txt

echo "诊断报告已保存到 ~/wifi-camera-debug/"
```

## 联系支持

如果问题仍未解决，请提供：
1. `~/wifi-camera-debug/` 目录中的所有文件
2. 错误截图或完整错误信息
3. 操作步骤和预期行为
