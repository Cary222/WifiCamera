#!/bin/bash
# WiFi Camera USB 模式一键启动脚本
# 用途：启动并维护板子 → ADB → relay → MuMu 模拟器的完整链路
# 使用：bash tools/usb-webrtc-relay/mac/start-usb-mode.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="/tmp/wifi-camera-usb"
mkdir -p "$LOG_DIR"

RELAY_LOG="$LOG_DIR/relay.log"
RELAY_ERROR_LOG="$LOG_DIR/relay-error.log"
BOARD_LOG="$LOG_DIR/board.log"

# === 颜色输出 ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# === 1. 查找 ADB ===
find_adb() {
    if [ -n "$ANDROID_SDK_ROOT" ] && [ -x "$ANDROID_SDK_ROOT/platform-tools/adb" ]; then
        echo "$ANDROID_SDK_ROOT/platform-tools/adb"
    elif [ -n "$ANDROID_HOME" ] && [ -x "$ANDROID_HOME/platform-tools/adb" ]; then
        echo "$ANDROID_HOME/platform-tools/adb"
    elif command -v adb &>/dev/null; then
        command -v adb
    else
        log_error "未找到 adb，请设置 ANDROID_SDK_ROOT 或 ANDROID_HOME"
        exit 1
    fi
}

ADB=$(find_adb)
log_info "ADB: $ADB"

# === 2. 查找板子设备 ===
find_board() {
    local serials
    serials=$("$ADB" devices -l 2>/dev/null | grep -E '^[^*\s]+\s+device' | awk '{print $1}' | grep -v '^emulator-' | grep -v '^127\.' | grep -v '^localhost' || true)

    if [ -z "$serials" ]; then
        # 尝试重启 ADB server 深度恢复
        log_warn "未通过 ADB 发现设备，正在自动重启 ADB Server (kill-server & start-server)..."
        "$ADB" kill-server >/dev/null 2>&1 || true
        "$ADB" start-server >/dev/null 2>&1 || true
        sleep 2
        serials=$("$ADB" devices -l 2>/dev/null | grep -E '^[^*\s]+\s+device' | awk '{print $1}' | grep -v '^emulator-' | grep -v '^127\.' | grep -v '^localhost' || true)
    fi

    if [ -z "$serials" ]; then
        log_error "未找到物理设备，请检查 USB 数据线是否插紧"
        exit 1
    fi

    local count
    count=$(echo "$serials" | wc -l | tr -d ' ')
    if [ "$count" -gt 1 ]; then
        log_error "检测到多个物理设备："
        echo "$serials" | sed 's/^/  /'
        exit 1
    fi

    echo "$serials"
}

BOARD=$(find_board)
log_info "板子: $BOARD"

# === 3. 停止旧 relay (launchd) ===
cleanup_old_relay() {
    log_info "停止旧 relay 服务..."

    # 停止 launchd 管理的 relay
    if launchctl print gui/$(id -u)/com.wificamera.usb-relay &>/dev/null; then
        launchctl bootout gui/$(id -u)/com.wificamera.usb-relay 2>/dev/null || true
        log_info "  已停止旧 relay (launchd)"
        sleep 1
    fi

    # 清理可能占用端口的残留进程
    for port in 18787 18189; do
        local pid=$(lsof -ti tcp:$port 2>/dev/null || true)
        if [ -n "$pid" ]; then
            kill -9 "$pid" 2>/dev/null || true
            log_info "  已清理端口 $port (PID: $pid)"
        fi
    done
}

# === 4. 建立 ADB 转发 ===
setup_adb_forward() {
    log_info "建立 ADB 端口转发..."
    "$ADB" -s "$BOARD" forward --remove-all 2>/dev/null || true
    "$ADB" -s "$BOARD" forward tcp:18999 tcp:8999  # 控制 API
    "$ADB" -s "$BOARD" forward tcp:18889 tcp:8889  # WHEP
    "$ADB" -s "$BOARD" forward tcp:18190 tcp:18190 # UDP 隧道
    log_info "  18999 → 8999 (API)"
    log_info "  18889 → 8889 (WHEP)"
    log_info "  18190 → 18190 (UDP)"
}

# === 5. 启动板子服务 ===
start_board_services() {
    log_info "启动板子服务与守护进程..."

    # 启动/重启看门狗（自动拉起并守护 8999 控制、8889 WHEP、18190 UDP 隧道）
    "$ADB" -s "$BOARD" shell "killall watchdog.sh 2>/dev/null || true; start-stop-daemon -S -b -m -p /tmp/camera_watchdog.pid -x /bin/sh -- /userdata/hjc_test/watchdog.sh" 2>/dev/null || true

    sleep 2

    # 验证端口监听
    local tcp_hex=$("$ADB" -s "$BOARD" shell "cat /proc/net/tcp" 2>/dev/null || true)
    if echo "$tcp_hex" | grep -q "2327"; then # 8999 = 0x2327
        log_info "  ✓ net_server_test (8999)"
    else
        log_warn "  ✗ net_server_test 未监听 8999"
    fi

    if echo "$tcp_hex" | grep -q "22B9"; then # 8889 = 0x22B9
        log_info "  ✓ mediamtx (8889)"
    else
        log_warn "  ✗ mediamtx 未监听 8889"
    fi

    if echo "$tcp_hex" | grep -q "470E"; then # 18190 = 0x470E
        log_info "  ✓ board_webrtc_udp_tunnel (18190)"
    else
        log_warn "  ✗ board_webrtc_udp_tunnel 未监听 18190"
    fi
}

# === 6. 安装并启动 relay (launchd) ===
install_and_start_relay() {
    log_info "安装 launchd 服务..."

    # 职责边界：relay 生命周期交给 launchd，不自己 fork
    # 每次启动动态检测当前 node 路径（适配版本升级）
    local node_path
    node_path="$(command -v node)"
    if [[ -z "$node_path" ]]; then
        log_error "  ✗ node 未安装"
        exit 1
    fi

    local plist_template="$SCRIPT_DIR/com.wificamera.usb-relay.plist"
    local plist_install="$HOME/Library/LaunchAgents/com.wificamera.usb-relay.plist"

    # 替换占位符生成最终 plist（不硬编码用户路径到 Git）
    sed -e "s|{{NODE_PATH}}|$node_path|g" \
        -e "s|{{ROOT_DIR}}|$ROOT_DIR|g" \
        "$plist_template" >"$plist_install"

    # 卸载旧服务（如果存在）
    launchctl bootout gui/$(id -u)/com.wificamera.usb-relay 2>/dev/null || true

    # 加载并启动
    launchctl bootstrap gui/$(id -u) "$plist_install"
    launchctl kickstart gui/$(id -u)/com.wificamera.usb-relay

    # 应用层健康检查（重试最多 10 秒）
    local retry=0
    local max_retry=10
    while [[ $retry -lt $max_retry ]]; do
        if curl -s --max-time 1 http://127.0.0.1:18787/stream-health >/dev/null 2>&1; then
            log_info "  ✓ relay 启动成功"
            return 0
        fi
        retry=$((retry + 1))
        sleep 1
    done

    log_error "  ✗ relay 启动失败（超时 ${max_retry}s）"
    log_info "  查看日志: tail -f $RELAY_ERROR_LOG"
    log_info "  查看服务: launchctl print gui/$(id -u)/com.wificamera.usb-relay"
    exit 1
}

# === 7. 显示状态 ===
show_status() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "USB 模式启动完成！"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  板子: $BOARD"
    echo "  relay: launchd 管理 (com.wificamera.usb-relay)"
    echo ""
    echo "  App 配置 (.env):"
    echo "    EXPO_PUBLIC_CAMERA_BASE_URL=http://10.0.2.2:18999"
    echo "    EXPO_PUBLIC_CAMERA_WHEP_URL=http://10.0.2.2:18787/board-webrtc/cam0/whep"
    echo ""
    echo "  查看 relay 状态:"
    echo "    launchctl print gui/\$(id -u)/com.wificamera.usb-relay"
    echo ""
    echo "  查看日志:"
    echo "    tail -f $RELAY_LOG"
    echo "    tail -f $RELAY_ERROR_LOG"
    echo ""
    echo "  停止 relay:"
    echo "    bash tools/usb-webrtc-relay/mac/stop-usb-relay.sh"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# === 7. 启动 Mac 端热插拔与链路守护进程 ===
start_host_watchdog() {
    log_info "启动 Mac 链路守护进程..."
    pkill -f "usb-auto-watchdog.sh" 2>/dev/null || true
    nohup /bin/bash "$(dirname "$0")/usb-auto-watchdog.sh" >/tmp/wifi-camera-usb/watchdog-host.log 2>&1 &
    log_info "  ✓ Mac 热插拔守护进程已就绪"
}

# === 主流程 ===
cleanup_old_relay
setup_adb_forward
start_board_services
install_and_start_relay
start_host_watchdog
show_status
