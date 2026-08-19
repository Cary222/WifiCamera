#!/bin/sh
# Tunnel watchdog - keeps board_webrtc_udp_tunnel running

TUNNEL_BIN="/userdata/hjc_test/board_webrtc_udp_tunnel"
PID_FILE="/tmp/tunnel.pid"
LOG_FILE="/tmp/tunnel_watchdog.log"

echo "$(date) Watchdog started" >> $LOG_FILE

while true; do
    # Check if tunnel is running
    if ! ps | grep -q "$TUNNEL_BIN" | grep -v grep; then
        echo "$(date) Starting tunnel..." >> $LOG_FILE
        $TUNNEL_BIN 18190 127.0.0.1 8189 >> $LOG_FILE 2>&1 &
        echo $! > $PID_FILE
        echo "$(date) Tunnel started with PID $(cat $PID_FILE)" >> $LOG_FILE
    fi
    sleep 5
done
