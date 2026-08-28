#!/bin/bash
# WiFi Camera 全链路状态检查与一键自愈脚本
# 使用方式: bash tools/usb-webrtc-relay/mac/check-status.sh [--fix]

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
  echo -e "${RED}[FAIL] 未找到 adb 命令！请设置 ANDROID_SDK_ROOT 或 ANDROID_HOME${NC}"
  exit 1
fi
echo -e "${GREEN}[OK]${NC} ADB 路径: $ADB"

# 确保 Rockchip 厂商 ID 已加入 adb_usb.ini
mkdir -p ~/.android
if ! grep -q "0x2207" ~/.android/adb_usb.ini 2>/dev/null; then
  echo "0x2207" >>~/.android/adb_usb.ini
fi

# 2. 检查物理硬件与 ADB 设备识别
get_board_serial() {
  "$ADB" devices -l 2>/dev/null | grep -E '^[^*\s]+\s+device' | awk '{print $1}' | grep -v '^emulator-' | grep -v '^127\.' | grep -v '^localhost' | head -n 1 || true
}

BOARD=$(get_board_serial)

# 如果 ADB 没认出来，检查 macOS 底层 USB 总线
if [ -z "$BOARD" ]; then
  USB_HARDWARE_FOUND=false
  if ioreg -p IOUSB -l -w 0 2>/dev/null | grep -i -E "2207|rockchip|rk3|WifiCamera" &>/dev/null; then
    USB_HARDWARE_FOUND=true
  fi

  if [ "$USB_HARDWARE_FOUND" = true ]; then
    echo -e "${YELLOW}[WARN] macOS USB 总线已识别到 Rockchip 相机硬件，但 ADB Server 处于假死状态！${NC}"
    echo -e "       正在自动重启 ADB Server (kill-server & start-server)..."
    "$ADB" kill-server >/dev/null 2>&1 || true
    "$ADB" start-server >/dev/null 2>&1 || true
    sleep 2
    BOARD=$(get_board_serial)
  fi
fi

# 如果仍然没有识别到设备
if [ -z "$BOARD" ]; then
  echo -e "\n${RED}[FAIL] 未检测到物理相机板子！${NC}"
  if ioreg -p IOUSB -l -w 0 2>/dev/null | grep -i -E "2207|rockchip|rk3|WifiCamera" &>/dev/null; then
    echo -e "${YELLOW}诊断提示: macOS USB 识别到设备，但 ADB 无法握手。请尝试重新插拔 Type-C 数据线。${NC}"
  else
    echo -e "${YELLOW}诊断提示: macOS USB 总线未发现任何 Rockchip 设备。请检查数据线是否插紧、是否插在 Mac 本机口。${NC}"
  fi
  echo -e "\n当前 ADB 设备列表:"
  "$ADB" devices -l

  if [ "$DO_FIX" = true ]; then
    echo -e "\n${YELLOW}正在尝试重启 ADB Server 深度探测...${NC}"
    "$ADB" kill-server >/dev/null 2>&1 || true
    "$ADB" start-server >/dev/null 2>&1 || true
    sleep 2
    BOARD=$(get_board_serial)
    if [ -n "$BOARD" ]; then
      echo -e "${GREEN}[OK] 重启 ADB 成功识别设备: $BOARD${NC}"
    else
      echo -e "${RED}[ERROR] 重启 ADB 仍无法识别，请物理重新插拔相机 USB 数据线。${NC}"
      exit 1
    fi
  else
    exit 1
  fi
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
  echo -e "若有 [FAIL] 项，请运行: ${GREEN}bash tools/usb-webrtc-relay/mac/check-status.sh --fix${NC} 进行一键自愈。"
fi
