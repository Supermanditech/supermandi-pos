#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SuperMandi Post-Boot Smoke Check
# ═══════════════════════════════════════════════════════════════════════════════
#
# This script runs after VM boot to verify all services are healthy.
# It's triggered by a systemd timer every 5 minutes for 30 minutes after boot.
#
# Logs to: /var/log/supermandi/post-boot-check.log
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

LOG_FILE="/var/log/supermandi/post-boot-check.log"
DOMAIN="${DOMAIN:-supermandi.tech}"
GATEWAY="${GATEWAY:-http://127.0.0.1:3000}"

# Ensure log directory exists
mkdir -p /var/log/supermandi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
UPTIME=$(uptime -p)

log() {
    echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

log "═══════════════════════════════════════════════════════════════"
log "POST-BOOT SMOKE CHECK"
log "Uptime: $UPTIME"
log "═══════════════════════════════════════════════════════════════"

FAILED=0

# Check services
log "Checking services..."

for service in nginx docker pm2-supermanditech; do
    if systemctl is-active --quiet "$service"; then
        log "  ✓ $service: active"
    else
        log "  ✗ $service: INACTIVE"
        FAILED=1
    fi
done

# Check endpoints
log "Checking endpoints..."

# Gateway
GW_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$GATEWAY/health" 2>/dev/null || echo "000")
if [ "$GW_STATUS" = "200" ]; then
    log "  ✓ Gateway /health: $GW_STATUS"
else
    log "  ✗ Gateway /health: $GW_STATUS"
    FAILED=1
fi

# Portals
for portal in retailer admin supplier; do
    STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "https://$DOMAIN/$portal/" 2>/dev/null || echo "000")
    if [ "$STATUS" = "200" ]; then
        log "  ✓ /$portal/: $STATUS"
    else
        log "  ✗ /$portal/: $STATUS"
        FAILED=1
    fi
done

# Check file existence
log "Checking files..."

for path in /var/www/retailer/index.html /var/www/admin/index.html; do
    if [ -f "$path" ] || [ -L "$(dirname $path)" ]; then
        log "  ✓ $path: exists"
    else
        log "  ✗ $path: MISSING"
        FAILED=1
    fi
done

# PM2 check
if sudo -u supermanditech pm2 list 2>/dev/null | grep -q "supplier-portal.*online"; then
    log "  ✓ PM2 supplier-portal: online"
else
    log "  ✗ PM2 supplier-portal: NOT ONLINE"
    FAILED=1
fi

log ""

if [ $FAILED -eq 1 ]; then
    log "═══════════════════════════════════════════════════════════════"
    log "POST-BOOT CHECK: ❌ FAILED"
    log "═══════════════════════════════════════════════════════════════"
    log ""
    log "ALERT: Services are unhealthy after boot!"
    log "Check logs: /var/log/nginx/supermandi.error.log"
    log ""

    # Optional: Send alert (uncomment and configure)
    # curl -X POST "https://hooks.slack.com/..." -d '{"text":"SuperMandi post-boot check FAILED"}'

    exit 1
else
    log "═══════════════════════════════════════════════════════════════"
    log "POST-BOOT CHECK: ✅ PASSED"
    log "═══════════════════════════════════════════════════════════════"
    log ""
    exit 0
fi
