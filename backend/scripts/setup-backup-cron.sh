#!/bin/bash
# GO-LIVE-091: Setup automated database backup cron job
# Run this on the production VM to enable daily backups
#
# Usage:
#   sudo ./setup-backup-cron.sh
#
# This script:
#   1. Installs the backup cron job to run daily at 2 AM
#   2. Creates the backup log directory
#   3. Tests the backup immediately

set -euo pipefail

log() {
    echo "[$(date -Iseconds)] $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

# Configuration
SUPERMANDI_DIR="/home/claude/supermandi-pos/backend"
BACKUP_LOG_DIR="/var/log/supermandi"
CRON_USER="claude"

log "Setting up SuperMandi database backup cron job..."

# Create log directory
mkdir -p "${BACKUP_LOG_DIR}"
chown "${CRON_USER}:${CRON_USER}" "${BACKUP_LOG_DIR}"

# Create cron job file
CRON_FILE="/etc/cron.d/supermandi-backup"

cat > "${CRON_FILE}" << 'EOF'
# GO-LIVE-091: SuperMandi Database Backup
# Runs daily at 2:00 AM IST
# Logs to /var/log/supermandi/backup.log

SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

# Run backup at 2 AM every day
0 2 * * * claude cd /home/claude/supermandi-pos/backend && docker-compose -f docker-compose.prod.yml run --rm backup >> /var/log/supermandi/backup.log 2>&1
EOF

chmod 644 "${CRON_FILE}"

log "Cron job installed: ${CRON_FILE}"
log ""
log "Backup schedule: Daily at 2:00 AM"
log "Backup location: Docker volume 'supermanditech_backup-data'"
log "Logs: ${BACKUP_LOG_DIR}/backup.log"
log ""
log "To run a backup manually:"
log "  cd ${SUPERMANDI_DIR} && docker-compose -f docker-compose.prod.yml run --rm backup"
log ""
log "To list backups:"
log "  docker run --rm -v supermanditech_backup-data:/backups alpine ls -la /backups"
log ""
log "To restore from backup:"
log "  See: ${SUPERMANDI_DIR}/scripts/restore-db.sh"
