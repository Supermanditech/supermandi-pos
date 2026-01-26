#!/usr/bin/env sh
REPORT_DIR="$(dirname "$0")"
REPORT="$REPORT_DIR/go-live-audit_f130cd0_2026-01-27.html"

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$REPORT"
elif command -v open >/dev/null 2>&1; then
  open "$REPORT"
else
  echo "Open $REPORT"
fi
