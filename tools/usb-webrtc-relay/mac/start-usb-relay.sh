#!/bin/bash
# macOS 版本的 USB WebRTC Relay 启动脚本
# 用途：通过 ADB 将 USB 连接的物理设备的 WebRTC 流代理到模拟器可访问的地址

set -e

# 参数配置
SERIAL="${1:-auto}"
PORT="${2:-18787}"
RELAY_UDP_PORT="${3:-18189}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# 查找 adb
if [ -n "$ANDROID_SDK_ROOT" ]; then
    ADB="$ANDROID_SDK_ROOT/platform-tools/adb"
elif [ -n "$ANDROID_HOME" ]; then
    ADB="$ANDROID_HOME/platform-tools/adb"
elif command -v adb &> /dev/null; then
    ADB="adb"
else
    echo "❌ 未找到 adb,请设置 ANDROID_SDK_ROOT 或 ANDROID_HOME 环境变量"
    exit 1
fi

if ! command -v "$ADB" &> /dev/null; then
    echo "❌ adb 不存在: $ADB"
    exit 1
fi

# 获取在线的物理设备序列号列表
get_online_physical_serials() {
    "$ADB" devices -l | grep -E '^[^*\s]+\s+device' | \
    awk '{print $1}' | \
    grep -v '^emulator-' | \
    grep -v '^127\.0\.0\.1:'
}

# 解析目标设备序列号
resolve_board_serial() {
    local online_serials
    online_serials=$(get_online_physical_serials)
    local count=$(echo "$online_serials" | grep -c '^' || echo "0")
    
    if [ "$SERIAL" != "auto" ]; then
        if ! echo "$online_serials" | grep -q "^${SERIAL}$"; then
            local candidates="${online_serials:-<none>}"
            echo "❌ 目标设备未在线: $SERIAL"
            echo "   物理设备候选: $candidates"
            exit 1
        fi
        echo "$SERIAL"
        return
    fi
    
    if [ "$count" -eq 1 ]; then
        echo "$online_serials"
        return
    fi
    
    if [ "$count" -eq 0 ]; then
        echo "❌ 没有物理 ADB 设备在线,MuMu 模拟器不被接受"
        exit 1
    fi
    
    echo "❌ 检测到多个物理 ADB 设备在线,请明确指定 -Serial:"
    echo "$online_serials" | sed 's/^/   /'
    exit 1
}

SERIAL=$(resolve_board_serial)
echo "[usb-relay] 选中设备序列号: $SERIAL"

# 设置 ADB 端口转发
# 所有转发都是临时的主机端映射,此脚本不会修改设备文件
echo "[usb-relay] 设置 ADB 端口转发..."
"$ADB" -s "$SERIAL" forward tcp:18999 tcp:8999   # 控制 API
"$ADB" -s "$SERIAL" forward tcp:18889 tcp:8889   # WHEP 端点
"$ADB" -s "$SERIAL" forward tcp:18190 tcp:18190  # WebRTC UDP 隧道

# 检查设备上的 UDP 桥接
echo "[usb-relay] 检查设备 UDP 桥接状态..."
BRIDGE_CHECK=$("$ADB" -s "$SERIAL" shell "busybox netstat -ln 2>/dev/null | grep ':18190' || echo 'not found'" | tr -d '\r')
if ! echo "$BRIDGE_CHECK" | grep -q 'LISTEN\|18190'; then
    echo "⚠️  设备 UDP 桥接 18190 检查返回非 LISTEN 状态,继续尝试..."
fi

# 停止占用端口的进程 (macOS 使用 lsof)
echo "[usb-relay] 检查并清理端口占用..."
for port in $PORT $RELAY_UDP_PORT; do
    pid=$(lsof -ti tcp:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "   终止占用端口 $port 的进程 $pid"
        kill -9 $pid 2>/dev/null || true
        sleep 0.5
    fi
done

# 设置环境变量并启动 Node.js 服务器
export USB_RELAY_PORT="$PORT"
export BOARD_WHEP_HOST="127.0.0.1"
export BOARD_WHEP_PORT="18889"
export BOARD_WEBRTC_TUNNEL_HOST="127.0.0.1"
export BOARD_WEBRTC_TUNNEL_PORT="18190"
export RELAY_WEBRTC_BIND_HOST="0.0.0.0"
export RELAY_WEBRTC_ADVERTISE_HOST="10.0.2.2"
export RELAY_WEBRTC_UDP_PORT="$RELAY_UDP_PORT"

echo "[usb-relay] 启动 Node.js 服务器..."
cd "$ROOT_DIR"
node "$ROOT_DIR/server.mjs" &
SERVER_PID=$!
echo "$SERVER_PID" > /tmp/wifi_camera_usb_relay.pid

# 等待服务器启动
sleep 1

# 健康检查
echo "[usb-relay] 健康检查..."
if ! curl -s --max-time 5 "http://127.0.0.1:$PORT/stream-health" > /dev/null; then
    echo "❌ 服务器健康检查失败"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

HEALTH=$(curl -s "http://127.0.0.1:$PORT/stream-health")
echo "[usb-relay] 就绪: $(echo "$HEALTH" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)"
echo "[usb-relay] WHEP: http://10.0.2.2:$PORT/board-webrtc/cam0/whep"
echo "[usb-relay] 控制/图像 API: http://10.0.2.2:18999"
echo ""
echo "✅ USB WebRTC Relay 启动成功!"
echo "   进程 PID: $SERVER_PID"
echo ""
echo "📝 请确保 .env 配置:"
echo "   EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999"
echo "   EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:$PORT/board-webrtc/cam0/whep"
echo ""
echo "🔧 启动监控脚本..."

# 启动监控脚本 (后台运行，完全脱离终端)
"$SCRIPT_DIR/watch-usb-relay.sh" "$SERIAL" "$PORT" "$RELAY_UDP_PORT" &
DISOWNED_PID=$!
echo "$DISOWNED_PID" > /tmp/wifi_camera_usb_relay_watcher.pid

# disown 防止 SIGHUP
disown $DISOWNED_PID 2>/dev/null || true

echo ""
echo "✅ USB WebRTC Relay 启动成功!"
echo "   relay PID:  $SERVER_PID"
echo "   监控 PID:  $DISOWNED_PID"
echo ""
HEALTH=$(curl -s "http://127.0.0.1:$PORT/stream-health")
echo "   就绪:      $(echo "$HEALTH" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)"
echo "   WHEP:      http://10.0.2.2:$PORT/board-webrtc/cam0/whep"
echo "   API:       http://10.0.2.2:18999"
echo ""
echo "停止命令:"
echo "   relay:  kill $SERVER_PID"
echo "   监控:   kill $DISOWNED_PID"

# 将 keep-alive 和 cleanup trap 放到后台子 shell，避免占用终端
(
    cleanup() {
        kill $SERVER_PID 2>/dev/null || true
        kill $DISOWNED_PID 2>/dev/null || true
        rm -f /tmp/wifi_camera_usb_relay.pid /tmp/wifi_camera_usb_relay_watcher.pid
    }
    trap cleanup EXIT

    # 等待 relay 进程，relay 退出时自动清理
    while kill -0 $SERVER_PID 2>/dev/null; do
        sleep 2
    done
) &
