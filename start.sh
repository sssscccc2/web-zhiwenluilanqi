#!/bin/bash
# FPBrowser Startup Script

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$BASEDIR/server.pid"
PORT="${PORT:-3000}"

start() {
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "[FPBrowser] Server already running (PID: $(cat "$PIDFILE"))"
        return
    fi

    echo "[FPBrowser] Starting server on port $PORT..."
    cd "$BASEDIR"
    nohup node server/index.js > "$BASEDIR/server.log" 2>&1 &
    echo $! > "$PIDFILE"
    echo "[FPBrowser] Server started (PID: $(cat "$PIDFILE"))"
    echo "[FPBrowser] Web Panel: http://$(hostname -I | awk '{print $1}'):$PORT"
    echo "[FPBrowser] Log file: $BASEDIR/server.log"
}

stop() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        echo "[FPBrowser] Stopping server (PID: $PID)..."
        kill "$PID" 2>/dev/null
        rm -f "$PIDFILE"

        # Clean up browser processes
        pkill -f "Xvfb :1[0-9][0-9]" 2>/dev/null
        pkill -f "x11vnc.*-rfbport 6" 2>/dev/null
        pkill -f "websockify.*6[0-9][0-9]" 2>/dev/null
        pkill -f "fluxbox" 2>/dev/null

        echo "[FPBrowser] Server stopped"
    else
        echo "[FPBrowser] No server running"
    fi
}

status() {
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "[FPBrowser] Server running (PID: $(cat "$PIDFILE"))"
        echo "[FPBrowser] Active browsers:"
        curl -s "http://localhost:$PORT/api/browsers/active" | python3 -m json.tool 2>/dev/null || echo "  Cannot connect to API"
    else
        echo "[FPBrowser] Server not running"
    fi
}

case "$1" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; sleep 2; start ;;
    status)  status ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
