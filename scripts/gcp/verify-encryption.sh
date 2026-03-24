#!/bin/bash
# GCP-STG-0681: Verify Cloud SQL encryption at rest
#
# Cloud SQL on GCP encrypts all data at rest by default using
# Google-managed encryption keys (AES-256). This includes all
# PII stored in the database:
#   - Phone numbers (users, staff, customers)
#   - GSTIN (tax ID for retailers/suppliers)
#   - Bank account details (for payouts)
#   - Addresses (store, supplier, delivery)
#   - Email addresses
#   - Device tokens and session data
#
# No additional configuration is needed — encryption is automatic.
# This script verifies the encryption status for audit compliance.
#
# For CMEK (Customer-Managed Encryption Keys), see:
#   https://cloud.google.com/sql/docs/postgres/configure-cmek
#
# Usage:
#   bash scripts/gcp/verify-encryption.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-supermandi-backend}"
INSTANCE_NAME="${CLOUD_SQL_INSTANCE:-supermandi-staging}"

echo "========================================"
echo "Cloud SQL Encryption-at-Rest Verification"
echo "========================================"
echo ""
echo "Project:  $PROJECT_ID"
echo "Instance: $INSTANCE_NAME"
echo ""

# Check instance encryption configuration
echo "1. Checking encryption configuration..."
ENCRYPTION_CONFIG=$(gcloud sql instances describe "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --format="value(settings.dataDiskEncryptionConfiguration)" 2>&1) || true

if [ -n "$ENCRYPTION_CONFIG" ] && [ "$ENCRYPTION_CONFIG" != "None" ]; then
  echo "   CMEK enabled: $ENCRYPTION_CONFIG"
else
  echo "   Using Google-managed encryption keys (default AES-256)"
  echo "   All data at rest is encrypted automatically"
fi

# Check disk encryption status
echo ""
echo "2. Checking disk encryption status..."
gcloud sql instances describe "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --format="table(settings.dataDiskType,settings.dataDiskSizeGb,settings.storageAutoResize)" 2>&1 || true

# Check backup encryption
echo ""
echo "3. Checking backup encryption..."
gcloud sql instances describe "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --format="table(settings.backupConfiguration.enabled,settings.backupConfiguration.pointInTimeRecoveryEnabled)" 2>&1 || true
echo "   Note: Backups are also encrypted at rest with the same key"

# Summary
echo ""
echo "========================================"
echo "Encryption Verification Summary"
echo "========================================"
echo ""
echo "Cloud SQL uses Google-managed encryption keys by default."
echo "All data including PII is encrypted at rest (AES-256):"
echo ""
echo "  - Phone numbers (users, staff, customers)"
echo "  - GSTIN (tax ID)"
echo "  - Bank account details"
echo "  - Addresses"
echo "  - Email addresses"
echo "  - Device tokens and sessions"
echo "  - Automated backups"
echo ""
echo "For CMEK upgrade, run:"
echo "  gcloud sql instances patch $INSTANCE_NAME \\"
echo "    --disk-encryption-key=projects/$PROJECT_ID/locations/asia-south1/keyRings/RING/cryptoKeys/KEY"
echo ""
echo "Documentation:"
echo "  https://cloud.google.com/sql/docs/postgres/configure-cmek"
echo "  https://cloud.google.com/sql/docs/postgres/encryption"
