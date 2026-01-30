#!/bin/bash
# GO-LIVE-091: Database Backup Strategy
# Automated PostgreSQL backup script for SuperMandi
#
# Usage:
#   ./backup-db.sh                    # Local backup to /backups
#   ./backup-db.sh --gcs              # Backup to Google Cloud Storage
#   ./backup-db.sh --retention 7      # Keep only last 7 days of backups
#
# Environment variables:
#   POSTGRES_HOST      - Database host (default: localhost)
#   POSTGRES_PORT      - Database port (default: 5432)
#   POSTGRES_USER      - Database user (default: supermandi)
#   POSTGRES_PASSWORD  - Database password (required)
#   POSTGRES_DB        - Database name (default: supermandi)
#   BACKUP_DIR         - Local backup directory (default: /backups)
#   GCS_BUCKET         - GCS bucket for remote backups (optional)
#   BACKUP_RETENTION   - Days to keep backups (default: 7)

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-supermandi}"
POSTGRES_DB="${POSTGRES_DB:-supermandi}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-7}"

# Timestamp for backup file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="supermandi_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# =============================================================================
# FUNCTIONS
# =============================================================================

log() {
    echo "[$(date -Iseconds)] $1"
}

error() {
    log "ERROR: $1" >&2
    exit 1
}

check_dependencies() {
    command -v pg_dump >/dev/null 2>&1 || error "pg_dump not found"
    command -v gzip >/dev/null 2>&1 || error "gzip not found"
}

create_backup() {
    log "Starting database backup..."
    log "  Host: ${POSTGRES_HOST}:${POSTGRES_PORT}"
    log "  Database: ${POSTGRES_DB}"
    log "  Output: ${BACKUP_PATH}"

    # Create backup directory if it doesn't exist
    mkdir -p "${BACKUP_DIR}"

    # Export password for pg_dump
    export PGPASSWORD="${POSTGRES_PASSWORD}"

    # Create backup with custom format for flexibility, then compress
    pg_dump \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        --verbose \
        2>&1 | gzip > "${BACKUP_PATH}"

    # Verify backup was created and has content
    if [ ! -f "${BACKUP_PATH}" ] || [ ! -s "${BACKUP_PATH}" ]; then
        error "Backup file was not created or is empty"
    fi

    BACKUP_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)
    log "Backup created successfully: ${BACKUP_FILE} (${BACKUP_SIZE})"
}

upload_to_gcs() {
    if [ -z "${GCS_BUCKET:-}" ]; then
        log "GCS_BUCKET not set, skipping upload"
        return
    fi

    command -v gsutil >/dev/null 2>&1 || {
        log "gsutil not found, skipping GCS upload"
        return
    }

    log "Uploading backup to GCS: gs://${GCS_BUCKET}/backups/${BACKUP_FILE}"
    gsutil cp "${BACKUP_PATH}" "gs://${GCS_BUCKET}/backups/${BACKUP_FILE}"
    log "Upload completed successfully"
}

cleanup_old_backups() {
    log "Cleaning up backups older than ${BACKUP_RETENTION} days..."

    # Local cleanup
    find "${BACKUP_DIR}" -name "supermandi_*.sql.gz" -mtime "+${BACKUP_RETENTION}" -delete 2>/dev/null || true

    # GCS cleanup if bucket is set
    if [ -n "${GCS_BUCKET:-}" ] && command -v gsutil >/dev/null 2>&1; then
        CUTOFF_DATE=$(date -d "-${BACKUP_RETENTION} days" +%Y%m%d)
        log "Removing GCS backups older than ${CUTOFF_DATE}..."

        # List and delete old backups
        gsutil ls "gs://${GCS_BUCKET}/backups/supermandi_*.sql.gz" 2>/dev/null | while read -r file; do
            FILE_DATE=$(echo "${file}" | grep -oP 'supermandi_\K\d{8}')
            if [ "${FILE_DATE}" -lt "${CUTOFF_DATE}" ]; then
                log "  Deleting: ${file}"
                gsutil rm "${file}" || true
            fi
        done
    fi

    log "Cleanup completed"
}

verify_backup() {
    log "Verifying backup integrity..."

    # Test that the file can be decompressed
    if ! gzip -t "${BACKUP_PATH}" 2>/dev/null; then
        error "Backup file is corrupted (gzip test failed)"
    fi

    # Check for SQL content
    if ! zcat "${BACKUP_PATH}" | head -n 5 | grep -q "PostgreSQL"; then
        error "Backup file does not appear to contain valid PostgreSQL dump"
    fi

    log "Backup verification passed"
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    log "=========================================="
    log "SuperMandi Database Backup"
    log "=========================================="

    # Check required password
    if [ -z "${POSTGRES_PASSWORD:-}" ]; then
        error "POSTGRES_PASSWORD environment variable is required"
    fi

    check_dependencies
    create_backup
    verify_backup

    # Handle arguments
    for arg in "$@"; do
        case "${arg}" in
            --gcs)
                upload_to_gcs
                ;;
            --retention)
                # Already set via BACKUP_RETENTION, just run cleanup
                ;;
            *)
                log "Unknown argument: ${arg}"
                ;;
        esac
    done

    cleanup_old_backups

    log "=========================================="
    log "Backup completed successfully"
    log "  File: ${BACKUP_PATH}"
    log "=========================================="
}

main "$@"
