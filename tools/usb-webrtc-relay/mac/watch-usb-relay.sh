#!/bin/bash
# macOS 版本的 USB WebRTC Relay 监控脚本
# 用途：监控设备连接状态,自动维护端口转发和 relay 服务

SERIAL="${1:-auto}"
PORT="${2:-18787}"
RELAY_UDP_PORT="${3:-18189}"
INTERVAL_SECONDS="${4:-5}"

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
    echo "[usb-relay-watch] ⚠️  未找到 adb,监控功能受限"
    ADB=""
fi

# 使用文件锁防止多个实例运行 (macOS 使用 shlock 或简单的 PID 文件)
LOCK_FILE="/tmp/wifi_camera_usb_relay_watcher.lock"

# macOS 没有 flock,使用 PID 文件方式
if [ -f "$LOCK_FILE" ]; then
    OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "[usb-relay-watch] 另一个监控实例正在运行 (PID: $OLD_PID)"
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"

# 清理函数
cleanup_lock() {
    rm -f "$LOCK_FILE"
}
trap cleanup_lock EXIT

log_watch() {
    echo "[usb-relay-watch] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

# 获取在线的物理设备序列号列表
get_online_physical_serials() {
    if [ -z "$ADB" ] || ! command -v "$ADB" &> /dev/null; then
        return
    fi
    "$ADB" devices -l 2>/dev/null | grep -E '^[^*\s]+\s+device' | \
    awk '{print $1}' | \
    grep -v '^emulator-' | \
    grep -v '^127\.0\.0\.1:' || true
}

# 解析目标设备序列号
resolve_board_serial() {
    local online_serials
    online_serials=$(get_online_physical_serials)
    local count=$(echo "$online_serials" | grep -c '^' || echo "0")
    
    if [ "$SERIAL" != "auto" ]; then
        if ! echo "$online_serials" | grep -q "^${SERIAL}$"; then
            log_watch "❌ 目标设备未在线: $SERIAL"
            return 1
        fi
        echo "$SERIAL"
        return 0
    fi
    
    if [ "$count" -eq 1 ]; then
        echo "$online_serials"
        return 0
    fi
    
    if [ "$count" -eq 0 ]; then
        log_watch "❌ 没有物理 ADB 设备在线"
        return 1
    fi
    
    log_watch "❌ 检测到多个物理设备,请明确指定 -Serial"
    return 1
}

# 初始化:解析设备序列号
if [ "$SERIAL" != "auto" ]; then
    TARGET_SERIAL="$SERIAL"
else
    TARGET_SERIAL=$(resolve_board_serial)
    if [ $? -ne 0 ]; then
        log_watch "初始化失败,退出监控"
        exit 1
    fi
fi

log_watch "选中设备序列号: $TARGET_SERIAL"

# 检查设备是否在线
test_board_online() {
    if [ -z "$ADB" ] || ! command -v "$ADB" &> /dev/null; then
        return 1
    fi
    local online_serials
    online_serials=$(get_online_physical_serials)
    echo "$online_serials" | grep -q "^${TARGET_SERIAL}$"
}

# 确保端口转发
ensure_forward() {
    local local_port=$1
    local remote_port=$2
    if [ -z "$ADB" ]; then
        return
    fi
    "$ADB" -s "$TARGET_SERIAL" forward tcp:$local_port tcp:$remote_port 2>/dev/null || true
}

# 检查板子隧道是否运行
check_board_tunnel() {
    if [ -z "$ADB" ]; then
        return 1
    fi
    # 检查板子上的进程是否存在
    "$ADB" -s "$TARGET_SERIAL" shell "ps" | grep -q "board_webrtc_udp_tunnel"
}

# 重启板子隧道
restart_board_tunnel() {
    log_watch "板子隧道未运行,正在重启..."
    # 先杀死可能存在的旧进程 (使用 start-stop-daemon -K)
    "$ADB" -s "$TARGET_SERIAL" shell "start-stop-daemon -K -x /userdata/hjc_test/board_webrtc_udp_tunnel 2>/dev/null || true" 2>/dev/null
    sleep 1
    # 启动新进程 (使用 start-stop-daemon 创建守护进程)
    "$ADB" -s "$TARGET_SERIAL" shell "start-stop-daemon -S -b -x /userdata/hjc_test/board_webrtc_udp_tunnel -- 18190 127.0.0.1 8189" 2>/dev/null
    sleep 2
}

# 启动 relay 服务(如果未运行)
start_relay_if_missing() {
    # 检查端口是否在监听
    if lsof -Pi tcp:$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        return
    fi
    
    log_watch "relay 未在监听,启动 server.mjs"

    export USB_RELAY_PORT="$PORT"
    export BOARD_WHEP_HOST="127.0.0.1"
    export BOARD_WHEP_PORT="18889"
    export BOARD_WEBRTC_TUNNEL_HOST="127.0.0.1"
    export BOARD_WEBRTC_TUNNEL_PORT="18190"
    export RELAY_WEBRTC_BIND_HOST="0.0.0.0"
    export RELAY_WEBRTC_ADVERTISE_HOST="10.0.2.2"
    export RELAY_WEBRTC_UDP_PORT="$RELAY_UDP_PORT"

    cd "$ROOT_DIR"
    nohup node "$ROOT_DIR/server.mjs" > /dev/null 2>&1 &
    echo $! > /tmp/wifi_camera_usb_relay.pid
}

# 主监控循环
log_watch "开始监控设备 $TARGET_SERIAL"
while true; do
    if test_board_online; then
        ensure_forward 18999 8999
        ensure_forward 18889 8889
        ensure_forward 18190 18190
        start_relay_if_missing
        # 检查并重启板子隧道
        if ! check_board_tunnel; then
            restart_board_tunnel
        fi
    else
        log_watch "⚠️  设备离线: $TARGET_SERIAL"
    fi
    
    sleep $([ $INTERVAL_SECONDS -lt 2 ] && echo 2 || echo $INTERVAL_SECONDS)
done
