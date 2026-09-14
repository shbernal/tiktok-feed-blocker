#!/usr/bin/env bash
# Runs a media capture stage inside a transient systemd user unit, so the
# kernel enforces the limits on node and on every Chromium, ffmpeg, gifski, and
# ImageMagick process it starts:
#
#   MemoryMax=3G, MemorySwapMax=0  an overrun is OOM-killed inside the unit,
#                                  never globally, and never thrashes swap
#   CPUQuota=400%, Nice=10         at most four cores, at low priority
#   RuntimeMaxSec                  hard wall clock for the whole unit
#   KillMode=control-group         no browser outlives the unit
#
# Without these, a capture against real TikTok once exhausted memory on a 15G
# machine, and Chromium processes orphaned by `timeout` kept running.
#
# Usage: scripts/capture-media.sh capture|encode [--help]
set -u

stage=${1:-}
shift || true

case $stage in
  capture)
    script=scripts/capture-media.mjs
    runtime=240
    ;;
  encode)
    script=scripts/capture-media-encode.mjs
    runtime=180
    ;;
  *)
    echo "Usage: scripts/capture-media.sh capture|encode [--help]" >&2
    exit 2
    ;;
esac

for argument in "$@"; do
  if [ "$argument" = --help ] || [ "$argument" = -h ]; then
    exec node "$script" --help
  fi
done

if ! systemd-run --user --quiet --wait --collect -p RuntimeMaxSec=5 true \
  2>/dev/null; then
  echo "systemd-run --user is unavailable, so the capture cannot be capped." >&2
  echo "It is not run uncapped; see docs/media-capture.md." >&2
  exit 1
fi

leftovers() {
  echo "== leftovers ($1)"
  pgrep -af 'ttfb-media-|capture-media(-encode)?\.mjs|gifski' |
    grep -vE 'pgrep|capture-media\.sh' || echo "no leftover processes"
  if compgen -G '/tmp/ttfb-media-*' >/dev/null; then
    ls -d /tmp/ttfb-media-*
  else
    echo "no leftover profiles"
  fi
}

leftovers before

unit=ttfb-media-$stage
env_args=(--setenv=MEDIA_CAPTURE_CAPPED=1)
for name in MEDIA_CAPTURE_DIR MEDIA_CAPTURE_WATCHDOG_MS \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE; do
  if [ -n "${!name:-}" ]; then
    env_args+=("--setenv=$name=${!name}")
  fi
done

systemd-run --user --unit="$unit" --wait --collect --pipe --quiet --same-dir \
  -p MemoryHigh=2G -p MemoryMax=3G -p MemorySwapMax=0 \
  -p CPUQuota=400% -p TasksMax=512 -p Nice=10 \
  -p KillMode=control-group -p RuntimeMaxSec="$runtime" \
  "${env_args[@]}" \
  "$(command -v node)" "$script"
status=$?

echo "== $stage exit $status"
leftovers after
exit "$status"
