#!/bin/bash
set -euo pipefail
# GCP-STG MIGRATION POST-APPLY VERIFICATION
# Runs AFTER migrations are applied to verify success.
# Checks version, table existence, column existence, and service health.

echo "================================================================"
echo "  MIGRATION POST-APPLY VERIFICATION"
echo "================================================================"

FAIL=0
WARN=0

# Step 1: Verify migration version
echo "[1/4] Verify migration version..."
if [ -n "${DATABASE_URL:-}" ] && command -v psql &>/dev/null; then
  CURRENT_VERSION=$(psql "$DATABASE_URL" -t -c "SELECT COALESCE(MAX(version), 0) FROM schema_migrations;" 2>/dev/null | tr -d ' ' || echo "UNKNOWN")
  EXPECTED_VERSION="${EXPECTED_MIGRATION_VERSION:-250}"
  echo "  Current version: $CURRENT_VERSION (expected: $EXPECTED_VERSION)"
  if [ "$CURRENT_VERSION" = "$EXPECTED_VERSION" ]; then
    echo "  PASS Migration version matches expected"
  elif [ "$CURRENT_VERSION" = "UNKNOWN" ]; then
    echo "  FAIL Could not read migration version"
    FAIL=$((FAIL + 1))
  else
    echo "  FAIL Version mismatch: got $CURRENT_VERSION, expected $EXPECTED_VERSION"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  INFO Manual check required:"
  echo "    Run: SELECT MAX(version) FROM schema_migrations;"
  echo "    Expected: ${EXPECTED_MIGRATION_VERSION:-250}"
fi

# Step 2: Verify new tables exist
echo "[2/4] Verify new tables exist..."
TABLES=(
  "orders.customer_ledger"
  "orders.sale_returns"
  "invoicing.credit_notes"
  "invoicing.goods_returns"
  "platform.store_alerts"
  "orders.order_status_history"
  "platform.notifications"
  "auth.admin_totp"
  "auth.user_totp"
  "auth.auth_events"
  "platform.analytics_events"
  "platform.cta_config_history"
)
if [ -n "${DATABASE_URL:-}" ] && command -v psql &>/dev/null; then
  for tbl in "${TABLES[@]}"; do
    SCHEMA=$(echo "$tbl" | cut -d. -f1)
    TABLE=$(echo "$tbl" | cut -d. -f2)
    EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.tables WHERE table_schema='$SCHEMA' AND table_name='$TABLE';" 2>/dev/null | tr -d ' ' || echo "")
    if [ "$EXISTS" = "1" ]; then
      echo "  PASS $tbl exists"
    else
      echo "  FAIL $tbl NOT FOUND"
      FAIL=$((FAIL + 1))
    fi
  done
else
  echo "  INFO Manual check required — verify these tables exist:"
  for tbl in "${TABLES[@]}"; do
    SCHEMA=$(echo "$tbl" | cut -d. -f1)
    TABLE=$(echo "$tbl" | cut -d. -f2)
    echo "    SELECT 1 FROM information_schema.tables WHERE table_schema='$SCHEMA' AND table_name='$TABLE';"
  done
fi

# Step 3: Verify new columns exist
echo "[3/4] Verify new columns exist..."
COLUMNS=(
  "auth.admin_totp.password_hash:migration 238"
  "pos.pos_devices.token_expires_at:migration 234"
  "platform.stores.max_pos_devices:migration 237"
  "auth.users.must_change_pin:migration 242"
)
if [ -n "${DATABASE_URL:-}" ] && command -v psql &>/dev/null; then
  for col_entry in "${COLUMNS[@]}"; do
    COL_PATH=$(echo "$col_entry" | cut -d: -f1)
    COL_DESC=$(echo "$col_entry" | cut -d: -f2)
    SCHEMA=$(echo "$COL_PATH" | cut -d. -f1)
    TABLE=$(echo "$COL_PATH" | cut -d. -f2)
    COLUMN=$(echo "$COL_PATH" | cut -d. -f3)
    EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.columns WHERE table_schema='$SCHEMA' AND table_name='$TABLE' AND column_name='$COLUMN';" 2>/dev/null | tr -d ' ' || echo "")
    if [ "$EXISTS" = "1" ]; then
      echo "  PASS $COL_PATH ($COL_DESC)"
    else
      echo "  FAIL $COL_PATH NOT FOUND ($COL_DESC)"
      FAIL=$((FAIL + 1))
    fi
  done
else
  echo "  INFO Manual check required — verify these columns exist:"
  for col_entry in "${COLUMNS[@]}"; do
    COL_PATH=$(echo "$col_entry" | cut -d: -f1)
    COL_DESC=$(echo "$col_entry" | cut -d: -f2)
    echo "    $COL_PATH ($COL_DESC)"
  done
fi

# Step 4: Health check
echo "[4/4] Service health check..."
STAGING_URL="${STAGING_URL:-https://staging.supermandi.tech}"
if command -v curl &>/dev/null; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/api/v1/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "  PASS Health endpoint returned 200"
  elif [ "$HTTP_CODE" = "000" ]; then
    echo "  WARN Could not reach $STAGING_URL/api/v1/health (network issue?)"
    WARN=$((WARN + 1))
  else
    echo "  FAIL Health endpoint returned $HTTP_CODE"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  INFO Manual check required:"
  echo "    curl $STAGING_URL/api/v1/health"
  echo "    Expected: 200 OK"
fi

# SUMMARY
echo ""
echo "================================================================"
echo "  POST-APPLY VERIFICATION SUMMARY"
echo "================================================================"
echo "  Failures: $FAIL"
echo "  Warnings: $WARN"
echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "  VERIFICATION FAILED — $FAIL issue(s) detected"
  echo "  Investigate failures before routing traffic to new revision"
  exit 1
else
  if [ "$WARN" -gt 0 ]; then
    echo "  VERIFICATION PASSED WITH WARNINGS ($WARN)"
  else
    echo "  VERIFICATION PASSED — Migrations applied successfully"
  fi
fi
echo "================================================================"
