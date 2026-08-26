#!/bin/bash
# WiFi Camera 全链路状态检查与一键自愈脚本
# 使用方式: bash tools/usb-webrtc-relay/mac/check-status.sh [--fix]

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DO_FIX=false
if [ "$1" == "--fix" ]; then
  DO_FIX=true
fi

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}   WiFi Camera USB / WebRTC 全链路状态诊断与自检     ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. 查找 ADB
find_adb() {
  if [ -n "$ANDROID_SDK_ROOT" ] && [ -x "$ANDROID_SDK_ROOT/platform-tools/adb" ]; then
    echo "$ANDROID_SDK_ROOT/platform-tools/adb"
  elif [ -n "$ANDROID_HOME" ] && [ -x "$ANDROID_HOME/platform-tools/adb" ]; then
    echo "$ANDROID_HOME/platform-tools/adb"
  elif command -v adb &>/dev/null; then
    command -v adb
  else
    echo ""
  fi
}

ADB=$(find_adb)
if [ -z "$ADB" ]; then
  echo -e "${RED}[FAIL] 未找到 adb 命令！${NC}"
  exit 1
fi
echo -e "${GREEN}[OK]${NC} ADB 路径: $ADB"

# 2. 检查物理设备
BOARD=$("$ADB" devices -l 2>/dev/null | grep -E '^[^*\s]+\s+device' | awk '{print $1}' | grep -v '^emulator-' | grep -v '^127\.' | head -n 1 || true)
if [ -z "$BOARD" ]; then
  echo -e "${RED}[FAIL] 未检测到物理相机板子！请检查 USB 数据线是否连接。${NC}"
  "$ADB" devices -l
  exit 1
fi
echo -e "${GREEN}[OK]${NC} 板子序列号: $BOARD"

# 3. 检查板端 3 大服务
echo -e "\n${CYAN}--- [板端服务检查] ---${NC}"
TCP_HEX=$("$ADB" -s "$BOARD" shell "cat /proc/net/tcp 2>/dev/null" || true)

# 8999: net_server_test
if echo "$TCP_HEX" | grep -q "2327"; then
  echo -e "${GREEN}[OK]${NC} 板端 8999 控制服务 (net_server_test) 正在监听"
else
  echo -e "${RED}[FAIL] 板端 8999 控制服务未运行！${NC}"
fi

# 8889: MediaMTX WHEP
if echo "$TCP_HEX" | grep -q "22B9"; then
  echo -e "${GREEN}[OK]${NC} 板端 8889 WebRTC 服务 (MediaMTX) 正在监听"
else
  echo -e "${RED}[FAIL] 板端 8889 WebRTC 服务未运行！${NC}"
fi

# 18190: board_webrtc_udp_tunnel
if echo "$TCP_HEX" | grep -q "470E"; then
  echo -e "${GREEN}[OK]${NC} 板端 18190 UDP 媒体隧道 (board_webrtc_udp_tunnel) 正在监听"
else
  echo -e "${RED}[FAIL] 板端 18190 UDP 媒体隧道未运行！${NC}"
fi

# 检查看门狗
WATCHDOG_RUNNING=$("$ADB" -s "$BOARD" shell "ps 2>/dev/null | grep -E 'watchdog.sh' | grep -v grep" || true)
if [ -n "$WATCHDOG_RUNNING" ]; then
  echo -e "${GREEN}[OK]${NC} 板端守护进程 (watchdog.sh) 正常运行"
else
  echo -e "${YELLOW}[WARN] 板端守护进程未运行（服务崩溃后无法自动拉起）${NC}"
fi

# 4. 检查主机 ADB Forward
echo -e "\n${CYAN}--- [主机 ADB 端口映射检查] ---${NC}"
FORWARDS=$("$ADB" forward --list 2>/dev/null || true)
for PORT in 18999 18889 18190; do
  if echo "$FORWARDS" | grep "$BOARD" | grep -q "tcp:$PORT"; then
    echo -e "${GREEN}[OK]${NC} ADB forward tcp:$PORT 正常"
  else
    echo -e "${RED}[FAIL] ADB forward tcp:$PORT 缺失！${NC}"
  fi
done

# 5. 检查主机 USB Relay 服务
echo -e "\n${CYAN}--- [主机 Relay 转发服务检查] ---${NC}"
RELAY_HEALTH=$(curl -s --max-time 1 http://127.0.0.1:18787/stream-health 2>/dev/null || true)
if echo "$RELAY_HEALTH" | grep -q '"ready":true'; then
  echo -e "${GREEN}[OK]${NC} 主机 Relay HTTP/UDP 转发服务 (18787/18189) 正常"
else
  echo -e "${RED}[FAIL] 主机 Relay 转发服务 (18787) 未运行或异常！${NC}"
fi

# 6. 检查摄像头 RTSP 视频流就绪状态
echo -e "\n${CYAN}--- [摄像头流 (cam0) 状态检查] ---${NC}"
"$ADB" -s "$BOARD" forward tcp:19997 tcp:9997 >/dev/null 2>&1 || true
CAM_STATUS=$(curl -s --max-time 1 http://127.0.0.1:19997/v3/paths/list 2>/dev/null || true)
"$ADB" -s "$BOARD" forward --remove tcp:19997 >/dev/null 2>&1 || true

if echo "$CAM_STATUS" | grep -q '"ready":true'; then
  BYTES_RECV=$(echo "$CAM_STATUS" | grep -o '"bytesReceived":[0-9]*' | cut -d: -f2 || echo "0")
  echo -e "${GREEN}[OK]${NC} 摄像头 RTSP 源正常推流 (cam0: ready=true, 已传输 $BYTES_RECV 字节)"
else
  echo -e "${YELLOW}[WARN] 摄像头未在推流或正在等待开流指令${NC}"
fi

echo -e "\n${CYAN}======================================================${NC}"
if [ "$DO_FIX" = true ]; then
  echo -e "${YELLOW}正在执行一键自动修复与重启...${NC}"
  bash "$(dirname "$0")/start-usb-mode.sh"
else
  echo -e "💡 提示: 若有 [FAIL] 项，请直接运行一键修复命令: ${GREEN}bash tools/usb-webrtc-relay/mac/start-usb-mode.sh${NC}"
fi
