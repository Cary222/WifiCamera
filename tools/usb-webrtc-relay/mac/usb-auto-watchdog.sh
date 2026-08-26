#!/bin/bash
# WiFi Camera Mac 端热插拔与链路守护进程
# 作用: 自动检测板子 USB 重新连接，毫秒级恢复 ADB 转发与板端守护，防止偶发闪断导致黑屏

find_adb() {
    if [ -n "$ANDROID_SDK_ROOT" ] && [ -x "$ANDROID_SDK_ROOT/platform-tools/adb" ]; then
        echo "$ANDROID_SDK_ROOT/platform-tools/adb"
    elif [ -n "$ANDROID_HOME" ] && [ -x "$ANDROID_HOME/platform-tools/adb" ]; then
        echo "$ANDROID_HOME/platform-tools/adb"
    elif command -v adb &>/dev/null; then
        command -v adb
    else
        echo "adb"
    fi
}

ADB=$(find_adb)

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [usb-watchdog] $*"
}

log "Mac 端 USB 守护进程已启动 (ADB: $ADB)"

LAST_BOARD=""

while true; do
    # 查找物理设备
    BOARD=$("$ADB" devices -l 2>/dev/null | grep -E '^[^*\s]+\s+device' | awk '{print $1}' | grep -v '^emulator-' | grep -v '^127\.' | grep -v '^localhost' | head -n 1 || true)

    if [ -n "$BOARD" ]; then
        # 检查是否需要补全转发规则
        FORWARDS=$("$ADB" forward --list 2>/dev/null || true)
        NEED_SETUP=false

        if [ "$BOARD" != "$LAST_BOARD" ]; then
            log "检测到相机板子接入: $BOARD"
            NEED_SETUP=true
        fi

        for PORT in 18999 18889 18190; do
            if ! echo "$FORWARDS" | grep "$BOARD" | grep -q "tcp:$PORT"; then
                NEED_SETUP=true
                break
            fi
        done

        if [ "$NEED_SETUP" = true ]; then
            log "正在自动恢复 ADB 端口转发 (18999, 18889, 18190)..."
            "$ADB" -s "$BOARD" forward tcp:18999 tcp:8999 2>/dev/null || true
            "$ADB" -s "$BOARD" forward tcp:18889 tcp:8889 2>/dev/null || true
            "$ADB" -s "$BOARD" forward tcp:18190 tcp:18190 2>/dev/null || true

            log "正在激活板端看门狗..."
            "$ADB" -s "$BOARD" shell "killall -0 watchdog.sh 2>/dev/null || start-stop-daemon -S -b -m -p /tmp/camera_watchdog.pid -x /bin/sh -- /userdata/hjc_test/watchdog.sh" 2>/dev/null || true

            LAST_BOARD="$BOARD"
            log "链路自动自愈完成！"
        fi
    else
        if [ -n "$LAST_BOARD" ]; then
            log "相机板子已断开 USB 连接"
            LAST_BOARD=""
        fi
    fi

    sleep 2
done
