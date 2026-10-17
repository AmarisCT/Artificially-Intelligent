#!/usr/bin/env bash
# Build the preview and production-config test sites, serve them with Range support, run every automated test.
# Usage: scripts/listening-room/tests/run_tests.sh [--only T04,T10]
set -u
cd "$(dirname "$0")/../../.."
WORK=${LR_WORK:-/home/claude/build/lr}
python3 scripts/listening-room/build_testsite.py "$WORK/site" >/dev/null
python3 scripts/listening-room/build_testsite.py "$WORK/site-prod" --production >/dev/null
serve() {  # dir port
  if ! curl -s -o /dev/null "localhost:$2/listening-room/"; then
    (setsid nohup python3 scripts/listening-room/tests/range_server.py "$WORK/$1" "$2" >"$WORK/server-$2.log" 2>&1 &)
  fi
}
serve site 8765; serve site-prod 8766
# Two stand-ins for an audio host on another origin: one configured for CORS, one not (see T28)
if ! curl -s -o /dev/null "localhost:8771/listening-room/audio/LR001.mp3"; then (LR_CORS=1 setsid nohup python3 scripts/listening-room/tests/range_server.py "$WORK/site" 8771 >"$WORK/server-8771.log" 2>&1 &); fi
if ! curl -s -o /dev/null "localhost:8772/listening-room/audio/LR001.mp3"; then (setsid nohup python3 scripts/listening-room/tests/range_server.py "$WORK/site" 8772 >"$WORK/server-8772.log" 2>&1 &); fi
sleep 1.5
node scripts/listening-room/tests/test_sync.js || exit 1
python3 scripts/listening-room/tests/test_queue.py || exit 1
python3 scripts/listening-room/tests/test_feed.py || exit 1
python3 scripts/listening-room/tests/e2e.py "${@}"
