#!/bin/bash
# Retailer Admin Portal - Production Verification Script
# Run this on VM with Docker available to generate proof logs

set -e

echo "=============================================="
echo "RETAILER ADMIN PORTAL VERIFICATION"
echo "=============================================="

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"  # Set this to a valid superadmin JWT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_fail() { echo -e "${RED}❌ $1${NC}"; }
log_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

# =============================================================================
# STEP 1: DATABASE MIGRATION
# =============================================================================
echo ""
echo "=== STEP 1: Database Migration ==="

cd "$(dirname "$0")/.."

log_info "Starting Docker containers..."
pnpm docker:up
sleep 5  # Wait for postgres to be ready

log_info "Running migrations..."
pnpm migrate:up

log_info "Verifying idempotency (run again)..."
pnpm migrate:up

log_info "Checking migration status..."
pnpm migrate:status

log_info "Verifying tables exist..."
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_name IN ('store_users', 'compliance_documents', 'csv_imports', 'impersonation_logs')
ORDER BY table_schema, table_name;
"

log_info "Verifying inventory_ledger columns..."
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'inventory' AND table_name = 'inventory_ledger'
AND column_name IN ('source', 'source_id');
"

log_info "Verifying roles created..."
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "
SELECT name, description FROM auth.roles WHERE name IN ('RETAILER_ADMIN', 'RETAILER_STAFF');
"

log_success "Migration verification complete"

# =============================================================================
# STEP 2: GET DEMO STORE UUID
# =============================================================================
echo ""
echo "=== STEP 2: Get Demo Store UUID ==="

if [ -z "$ADMIN_TOKEN" ]; then
  log_info "ADMIN_TOKEN not set, skipping API tests"
  log_info "Set ADMIN_TOKEN environment variable with a valid superadmin JWT"
  exit 0
fi

# Get demo store UUID
DEMO_STORE_RESPONSE=$(curl -s "${GATEWAY_URL}/api/v1/platform/stores?code=DEMO001" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

DEMO_STORE_ID=$(echo "$DEMO_STORE_RESPONSE" | jq -r '.data[0].id // empty')

if [ -z "$DEMO_STORE_ID" ]; then
  log_fail "Could not find DEMO001 store"
  echo "Response: $DEMO_STORE_RESPONSE"
  exit 1
fi

log_success "Demo store UUID: $DEMO_STORE_ID"

# =============================================================================
# STEP 3: SUPERADMIN PORTAL INIT
# =============================================================================
echo ""
echo "=== STEP 3: SuperAdmin Portal Init ==="

INIT_RESPONSE=$(curl -s -X POST "${GATEWAY_URL}/api/v1/platform/admin/stores/${DEMO_STORE_ID}/retailer-admin/init" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}')

echo "Init Response: $INIT_RESPONSE"

if echo "$INIT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  log_success "Portal init successful"
elif echo "$INIT_RESPONSE" | jq -e '.error.code == "PORTAL_ALREADY_ENABLED"' > /dev/null 2>&1; then
  log_info "Portal already enabled (expected on re-run)"
else
  log_fail "Portal init failed"
fi

# =============================================================================
# STEP 4: GET PORTAL STATUS
# =============================================================================
echo ""
echo "=== STEP 4: Get Portal Status ==="

STATUS_RESPONSE=$(curl -s "${GATEWAY_URL}/api/v1/platform/admin/stores/${DEMO_STORE_ID}/retailer-admin" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

echo "Status Response: $STATUS_RESPONSE"

if echo "$STATUS_RESPONSE" | jq -e '.data.portalEnabled == true' > /dev/null 2>&1; then
  log_success "Portal enabled confirmed"
  PORTAL_URL=$(echo "$STATUS_RESPONSE" | jq -r '.data.portalUrl')
  MASKED_PHONE=$(echo "$STATUS_RESPONSE" | jq -r '.data.maskedPhone')
  log_info "Portal URL: $PORTAL_URL"
  log_info "Masked Phone: $MASKED_PHONE"
else
  log_fail "Portal not enabled"
fi

# =============================================================================
# STEP 5: FIREBASE LOGIN (requires valid Firebase ID token)
# =============================================================================
echo ""
echo "=== STEP 5: Firebase Login (skipped - requires Firebase ID token) ==="
log_info "To test Firebase login, use the retailer-admin frontend to generate a Firebase ID token"
log_info "Then call: POST /api/v1/retailer-admin/auth/firebase-login"

# =============================================================================
# STEP 6: COMPLIANCE UPLOAD URL (requires retailer JWT)
# =============================================================================
echo ""
echo "=== STEP 6: Compliance Upload (skipped - requires retailer JWT) ==="
log_info "After Firebase login, test compliance upload with retailer JWT:"
log_info "POST /api/v1/retailer-admin/compliance/upload"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "=============================================="
echo "VERIFICATION SUMMARY"
echo "=============================================="
echo "Demo Store ID: $DEMO_STORE_ID"
echo ""
echo "Manual tests required:"
echo "1. Firebase login with real phone OTP"
echo "2. Compliance document upload with signed URL"
echo "3. CSV import validate + commit"
echo ""
echo "All gateway routes should be via :3000 only"
echo "=============================================="
