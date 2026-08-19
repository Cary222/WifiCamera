#!/bin/bash
# 一键恢复 USB WiFi Camera 链路 (6 步验证)
# 用法: bash tools/usb-webrtc-relay/restore-usb链路.sh
#
# 链路路径:
#   App WS → MuMu:18999 → ADB forward → 板子:8999 → net_server_test
#   App WHEP → MuMu:18787 → relay → ADB forward:18889 → 板子:8889 → MediaMTX
#   App UDP  → MuMu:18189 → relay → ADB forward:18190 → 板子:18190

set -e

RELAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$RELAY_DIR")"

echo "=== USB WiFi Camera 链路恢复 ==="
echo ""

# 1. 找板子 serial
echo "[1/6] 查找物理板子..."
BOARD=""
for serial in $(adb devices -l 2>/dev/null | grep -E '^[^* ]+' | awk '{print $1}' | grep -v 'emulator-' | grep -v '^127\.' | grep -v '^localhost'); do
    # getprop 不一定在所有设备上可用，改用 cpuinfo Serial
    SERIAL_CHIP=$(adb -s "$serial" shell "cat /proc/cpuinfo" 2>/dev/null | grep -i 'Serial' | head -1 | tr -d '\r' || echo "")
    if echo "$SERIAL_CHIP" | grep -qiE 'rockchip|rv1106|rv1103|Serial'; then
        BOARD="$serial"
        echo "  找到板子: $serial ($SERIAL_CHIP)"
        break
    fi
done

if [ -z "$BOARD" ]; then
    echo "❌ 未找到物理板子，请确认 USB 已连接"
    exit 1
fi

# 2. 清理旧 forward，重建 3 个转发
echo "[2/6] 重建 ADB 端口转发..."
adb -s "$BOARD" forward --remove-all 2>/dev/null || true
adb -s "$BOARD" forward tcp:18999 tcp:8999
adb -s "$BOARD" forward tcp:18889 tcp:8889
adb -s "$BOARD" forward tcp:18190 tcp:18190
adb forward --list | grep "$BOARD"

# 3. 清理旧 relay
echo "[3/6] 停止旧 relay..."
for pid in $(lsof -ti tcp:18787 2>/dev/null || true); do
    kill "$pid" 2>/dev/null && echo "  kill $pid" || true
done
sleep 1

# 4. 启动 relay
echo "[4/6] 启动 relay..."
cd "$ROOT_DIR"
node "$ROOT_DIR/server.mjs" &
RELAY_PID=$!
sleep 2

# 5. 验证 relay
echo "[5/6] 健康检查..."
HEALTH=$(curl -s --max-time 3 http://127.0.0.1:18787/stream-health 2>/dev/null || echo '{}')
echo "  relay: $HEALTH"
echo ""

# 6. 验证 WebSocket 通道 (板子 8999)
echo "[6/6] 验证 WebSocket 通道..."
WS_RESP=$(python3 -c "
import socket, os, base64, json, struct

key = base64.b64encode(os.urandom(16)).decode()
sock = socket.socket()
sock.settimeout(5)
sock.connect(('127.0.0.1', 18999))
sock.sendall(
    'GET /ws/device/ HTTP/1.1\r\nHost: 127.0.0.1:18999\r\n'
    'Upgrade: websocket\r\nConnection: Upgrade\r\n'
    f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode()
)
resp = sock.recv(256).decode()
sock.sendall(bytes([0x88, 0x80]) + os.urandom(4))  # close frame
sock.close()
first_line = resp.split('\r\n')[0]
if '101' in first_line:
    print('✅ WS 101 Switching Protocols')
else:
    print(f'❌ {first_line}')
    exit(1)
" 2>&1)
WS_STATUS=$?
echo "  $WS_RESP"

if [ $WS_STATUS -ne 0 ]; then
    echo "❌ WebSocket 通道验证失败，请检查板子 net_server_test 进程"
    exit 1
fi

echo ""
echo "=== 链路就绪 ==="
echo "  板子 serial: $BOARD"
echo "  App → WebSocket: ws://10.0.2.2:18999/ws/device/"
echo "  App → WHEP: http://10.0.2.2:18787/board-webrtc/cam0/whep"
echo "  relay PID: $RELAY_PID"
echo ""
echo "✅ 现在进入 MuMu Dev Client 测试"
