#!/bin/bash
# 停止 relay 服务（launchd 生命周期管理器）
# 注意：此脚本只停止 relay，不停止 ADB forward 和板端服务
#       ADB forward 和板端服务是 USB session 的一部分，随 USB 拔插自然失效

set -e

launchctl bootout gui/$(id -u)/com.wificamera.usb-relay 2>/dev/null || true
echo "✓ relay 已停止"

# 提示用户可以清理 ADB forward
echo ""
echo "如需清理 ADB forward，可手动执行:"
echo "  adb forward --remove-all"
