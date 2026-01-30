#!/bin/bash
# GO-LIVE-091: Database Restore Script
# Restore PostgreSQL database from backup
#
# Usage:
#   ./restore-db.sh /backups/supermandi_20260130_120000.sql.gz
#   ./restore-db.sh --from-gcs supermandi_20260130_120000.sql.gz
#
# WARNING: This will DROP and recreate the database!
#
# Environment variables:
#   POSTGRES_HOST      - Database host (default: localhost)
#   POSTGRES_PORT      - Database port (default: 5432)
#   POSTGRES_USER      - Database user (default: supermandi)
#   POSTGRES_PASSWORD  - Database password (required)
#   POSTGRES_DB        - Database name (default: supermandi)
#   GCS_BUCKET         - GCS bucket for remote backups (optional)

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-supermandi}"
POSTGRES_DB="${POSTGRES_DB:-supermandi}"

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
    command -v psql >/dev/null 2>&1 || error "psql not found"
    command -v gzip >/dev/null 2>&1 || error "gzip not found"
}

download_from_gcs() {
    local BACKUP_NAME="$1"
    local LOCAL_PATH="/tmp/${BACKUP_NAME}"

    if [ -z "${GCS_BUCKET:-}" ]; then
        error "GCS_BUCKET environment variable is required for --from-gcs"
    fi

    command -v gsutil >/dev/null 2>&1 || error "gsutil not found"

    log "Downloading backup from GCS: gs://${GCS_BUCKET}/backups/${BACKUP_NAME}"
    gsutil cp "gs://${GCS_BUCKET}/backups/${BACKUP_NAME}" "${LOCAL_PATH}"
    echo "${LOCAL_PATH}"
}

verify_backup() {
    local BACKUP_FILE="$1"

    log "Verifying backup file: ${BACKUP_FILE}"

    if [ ! -f "${BACKUP_FILE}" ]; then
        error "Backup file not found: ${BACKUP_FILE}"
    fi

    if [ ! -s "${BACKUP_FILE}" ]; then
        error "Backup file is empty: ${BACKUP_FILE}"
    fi

    if ! gzip -t "${BACKUP_FILE}" 2>/dev/null; then
        error "Backup file is corrupted (gzip test failed)"
    fi

    log "Backup file verified"
}

confirm_restore() {
    log ""
    log "=========================================="
    log "WARNING: DATABASE RESTORE"
    log "=========================================="
    log ""
    log "This will restore the database from backup."
    log "  Host: ${POSTGRES_HOST}:${POSTGRES_PORT}"
    log "  Database: ${POSTGRES_DB}"
    log ""
    log "The --clean flag in the backup will DROP existing objects."
    log ""
    read -p "Are you sure you want to continue? (yes/no): " CONFIRM

    if [ "${CONFIRM}" != "yes" ]; then
        log "Restore cancelled"
        exit 0
    fi
}

restore_backup() {
    local BACKUP_FILE="$1"

    log "Starting database restore..."
    log "  Source: ${BACKUP_FILE}"
    log "  Target: ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

    # Export password for psql
    export PGPASSWORD="${POSTGRES_PASSWORD}"

    # Restore from gzipped backup
    # The backup was created with --clean --if-exists, so it will drop and recreate
    zcat "${BACKUP_FILE}" | psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -v ON_ERROR_STOP=1 \
        --quiet

    log "Restore completed successfully"
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    log "=========================================="
    log "SuperMandi Database Restore"
    log "=========================================="

    # Check required password
    if [ -z "${POSTGRES_PASSWORD:-}" ]; then
        error "POSTGRES_PASSWORD environment variable is required"
    fi

    check_dependencies

    # Parse arguments
    local BACKUP_FILE=""
    local FROM_GCS=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --from-gcs)
                FROM_GCS=true
                shift
                BACKUP_FILE="$1"
                ;;
            *)
                BACKUP_FILE="$1"
                ;;
        esac
        shift
    done

    if [ -z "${BACKUP_FILE}" ]; then
        error "Usage: $0 <backup_file> or $0 --from-gcs <backup_name>"
    fi

    # Download from GCS if requested
    if [ "${FROM_GCS}" = true ]; then
        BACKUP_FILE=$(download_from_gcs "${BACKUP_FILE}")
    fi

    verify_backup "${BACKUP_FILE}"
    confirm_restore
    restore_backup "${BACKUP_FILE}"

    log "=========================================="
    log "Database restore completed successfully"
    log "=========================================="
}

main "$@"
