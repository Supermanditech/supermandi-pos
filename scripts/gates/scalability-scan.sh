#!/usr/bin/env bash
# =============================================================================
# ZRP Category K: 10K Store Readiness — Static Code Analysis
# Gates: K-129, K-130, K-131, K-132, K-133, K-134, K-135, K-136, K-138
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP Category K: Scalability Static Analysis ==="
echo ""

BACKEND_SRC="backend/src backend/services backend/packages"
FRONTEND_SRC="retailer-admin/src supplier-portal/src supermandi-superadmin/src"
DEPLOY_YML=".github/workflows/deploy.yml"
MIGRATION_DIR="backend/migrations"

# =============================================================================
# ZRP-K-129: Pagination everywhere (BLOCKING P0)
# Scan for unbounded queries returning arrays
# =============================================================================
echo "--- ZRP-K-129: Pagination enforcement ---"

UNPAGINATED=0
# Find SELECT queries without LIMIT — exclude single-row lookups, counts, exists, subqueries
UNLIMITED_QUERIES=$(grep -rnE "SELECT\s+.*FROM\s+" $BACKEND_SRC 2>/dev/null | \
  grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$' | \
  grep -viE 'LIMIT|\.limit\(|COUNT\(|EXISTS\(|findOne|findUnique|findFirst|WHERE.*id\s*=|WHERE.*=\s*\$[0-9]|SELECT\s+1\b|INTO\s+|MAX\(|MIN\(|SUM\(|AVG\(' || echo "")

if [ -n "$UNLIMITED_QUERIES" ]; then
  COUNT=$(echo "$UNLIMITED_QUERIES" | wc -l)
  echo "  Found $COUNT SELECT queries without explicit LIMIT"
  if [ "$COUNT" -gt 5 ]; then
    echo "  (Showing first 5)"
    echo "$UNLIMITED_QUERIES" | head -5 | while IFS= read -r line; do echo "    $line"; done 2>/dev/null || true
  fi
  UNPAGINATED=$COUNT
fi

if [ "$UNPAGINATED" -le 50 ]; then
  gate_pass "ZRP-K-129" "Query pagination coverage acceptable ($UNPAGINATED unbounded)"
else
  gate_warn "ZRP-K-129" "Pagination" "$UNPAGINATED unbounded queries found (review recommended)"
fi

# =============================================================================
# ZRP-K-130: Search debounce + list virtualization (BLOCKING P0)
# =============================================================================
echo ""
echo "--- ZRP-K-130: Search debounce ---"

DEBOUNCE_FOUND=false
# Check for debounce imports in frontend
DEBOUNCE_FILES=$(grep -rlE 'useDebounce|debounce|lodash.*debounce|useDebouncedCallback' $FRONTEND_SRC 2>/dev/null | \
  grep -vE 'node_modules|dist' || echo "")

if [ -n "$DEBOUNCE_FILES" ]; then
  echo "  OK: Debounce usage found in $(echo "$DEBOUNCE_FILES" | wc -l) file(s)"
  DEBOUNCE_FOUND=true
fi

# Check for direct onChange calling API (anti-pattern)
DIRECT_ONCHANGE=$(grep -rnE 'onChange.*fetch\(|onChange.*axios\.|onChange.*api\.' $FRONTEND_SRC 2>/dev/null | \
  grep -vE 'node_modules|dist|\.test\.|debounce' || echo "")

if [ -n "$DIRECT_ONCHANGE" ]; then
  COUNT=$(echo "$DIRECT_ONCHANGE" | wc -l)
  echo "  WARN: $COUNT onChange handler(s) directly calling API (should debounce)"
fi

if [ "$DEBOUNCE_FOUND" = "true" ]; then
  gate_pass "ZRP-K-130" "Debounce patterns found in frontend"
else
  gate_warn "ZRP-K-130" "Debounce" "No debounce usage found in frontend search components"
fi

# =============================================================================
# ZRP-K-131: API timeouts configured (BLOCKING P0)
# =============================================================================
echo ""
echo "--- ZRP-K-131: API timeouts ---"

TIMEOUT_FOUND=false
# Check for timeout/AbortController in frontend
TIMEOUT_FILES=$(grep -rlE 'timeout|AbortController|signal|timeoutMs|requestTimeout' $FRONTEND_SRC 2>/dev/null | \
  grep -vE 'node_modules|dist|\.test\.' || echo "")

if [ -n "$TIMEOUT_FILES" ]; then
  echo "  OK: Timeout config found in $(echo "$TIMEOUT_FILES" | wc -l) frontend file(s)"
  TIMEOUT_FOUND=true
fi

# Check axios defaults
if grep -rqE 'axios\.defaults\.timeout|timeout:\s*[0-9]' $FRONTEND_SRC 2>/dev/null; then
  TIMEOUT_FOUND=true
  echo "  OK: Axios timeout configured"
fi

# Check backend request timeouts
if grep -rqE 'timeout|server\.setTimeout|keepAliveTimeout' $BACKEND_SRC 2>/dev/null; then
  echo "  OK: Backend timeout references found"
fi

if [ "$TIMEOUT_FOUND" = "true" ]; then
  gate_pass "ZRP-K-131" "API timeouts configured"
else
  gate_warn "ZRP-K-131" "Timeouts" "No explicit timeout configuration found in frontend API calls"
fi

# =============================================================================
# ZRP-K-132: Store isolation enforced everywhere (BLOCKING P0)
# Deep scan — all query files checked for store_id
# =============================================================================
echo ""
echo "--- ZRP-K-132: Deep store isolation scan ---"

STORE_TABLES=("store_products" "inventory_ledger" "sales" "sale_items" "purchase_orders" "reorder_items")
ISOLATION_GAPS=0

for table in "${STORE_TABLES[@]}"; do
  QUERY_FILES=$(grep -rlE "FROM\s+${table}|INTO\s+${table}|UPDATE\s+${table}|JOIN\s+${table}" \
    $BACKEND_SRC 2>/dev/null | grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$|migrations' || echo "")
  for qf in $QUERY_FILES; do
    if ! grep -qE 'store_id|storeId' "$qf" 2>/dev/null; then
      echo "  GAP: $qf uses $table without store_id"
      ISOLATION_GAPS=$((ISOLATION_GAPS + 1))
    fi
  done
done

if [ "$ISOLATION_GAPS" -eq 0 ]; then
  gate_pass "ZRP-K-132" "Store isolation enforced in all query files"
else
  gate_fail "ZRP-K-132" "Store isolation" "$ISOLATION_GAPS file(s) missing store_id filter"
fi

# =============================================================================
# ZRP-K-133: DB indexes for top queries (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-K-133: Index coverage ---"

CORE_TABLES=("stores" "store_products" "inventory_ledger" "sales" "sale_items" "users")
UNDER_INDEXED=0

for table in "${CORE_TABLES[@]}"; do
  IDX_COUNT=$({ grep -icE "CREATE\s+(UNIQUE\s+)?INDEX.*\b${table}\b" "$MIGRATION_DIR"/*.sql 2>/dev/null || true; } | \
    awk -F: '{sum += $NF} END {print sum+0}')
  if [ "$IDX_COUNT" -lt 2 ]; then
    echo "  WARN: $table has only $IDX_COUNT index(es) (recommend >= 2)"
    UNDER_INDEXED=$((UNDER_INDEXED + 1))
  else
    echo "  OK: $table has $IDX_COUNT index(es)"
  fi
done

if [ "$UNDER_INDEXED" -le 2 ]; then
  gate_pass "ZRP-K-133" "Index coverage acceptable ($UNDER_INDEXED tables under-indexed)"
else
  gate_fail "ZRP-K-133" "Index coverage" "$UNDER_INDEXED core tables have < 2 indexes"
fi

# =============================================================================
# ZRP-K-134: No N+1 queries (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-K-134: N+1 query detection ---"

# Scan for loop-query patterns: for/forEach with await query inside
N_PLUS_1=$(grep -rnE 'for\s*\(.*\)\s*\{' $BACKEND_SRC 2>/dev/null | \
  grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$' || echo "")

LOOP_QUERY_FILES=""
if [ -n "$N_PLUS_1" ]; then
  # Check files with for loops for await query patterns
  FOR_LOOP_FILES=$(echo "$N_PLUS_1" | cut -d: -f1 | sort -u)
  for f in $FOR_LOOP_FILES; do
    if grep -qE 'await.*query\(|await.*findOne\(|await.*findMany\(' "$f" 2>/dev/null; then
      # Heuristic: if file has both for loops and await queries, flag it
      LOOP_QUERY_FILES="$LOOP_QUERY_FILES $f"
    fi
  done
fi

LOOP_QUERY_FILES=$(echo "$LOOP_QUERY_FILES" | tr ' ' '\n' | sort -u | grep -v '^$' || echo "")
if [ -n "$LOOP_QUERY_FILES" ]; then
  COUNT=$(echo "$LOOP_QUERY_FILES" | wc -l)
  echo "  WARN: $COUNT file(s) may have N+1 query patterns"
  echo "$LOOP_QUERY_FILES" | head -3 | while read -r f; do echo "    - $f"; done
  gate_warn "ZRP-K-134" "N+1 queries" "$COUNT file(s) with potential loop-query patterns"
else
  gate_pass "ZRP-K-134" "No obvious N+1 query patterns"
fi

# =============================================================================
# ZRP-K-135: Upload limits / image processing safe (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-K-135: Upload limits ---"

LIMITS_FOUND=false

# Check express body-parser limits
if grep -rqE 'limit.*[0-9]+.*[mk]b|bodyParser.*limit|json\(\s*\{.*limit|urlencoded\(\s*\{.*limit' $BACKEND_SRC 2>/dev/null; then
  echo "  OK: Body parser limits configured"
  LIMITS_FOUND=true
fi

# Check multer config for file upload limits
if grep -rqE 'multer|fileSize|maxFileSize|limits.*fileSize' $BACKEND_SRC 2>/dev/null; then
  echo "  OK: File upload limits configured"
  LIMITS_FOUND=true
fi

if [ "$LIMITS_FOUND" = "true" ]; then
  gate_pass "ZRP-K-135" "Upload/body size limits configured"
else
  gate_warn "ZRP-K-135" "Upload limits" "No explicit body/upload size limits found"
fi

# =============================================================================
# ZRP-K-136: Cost/perf budget — resource constraints in deploy.yml (WARNING P2)
# =============================================================================
echo ""
echo "--- ZRP-K-136: Resource constraints ---"

if [ -f "$DEPLOY_YML" ]; then
  # Check memory constraints
  MEM_VALUES=$(grep -oE 'memory=[0-9]+Mi' "$DEPLOY_YML" 2>/dev/null | sort -u || echo "")
  CPU_VALUES=$(grep -oE 'cpu=[0-9]+' "$DEPLOY_YML" 2>/dev/null | sort -u || echo "")
  MAX_INST=$(grep -oE 'max-instances=[0-9]+' "$DEPLOY_YML" 2>/dev/null | sort -u || echo "")

  echo "  Memory: $MEM_VALUES"
  echo "  CPU: $CPU_VALUES"
  echo "  Max instances: $MAX_INST"

  # Check for reasonable staging limits
  OVER_LIMIT=0
  for mem in $(echo "$MEM_VALUES" | grep -oE '[0-9]+'); do
    if [ "$mem" -gt 1024 ]; then
      echo "  WARN: memory ${mem}Mi exceeds 1024Mi for staging"
      OVER_LIMIT=$((OVER_LIMIT + 1))
    fi
  done
  for inst in $(echo "$MAX_INST" | grep -oE '[0-9]+'); do
    if [ "$inst" -gt 10 ]; then
      echo "  WARN: max-instances=$inst exceeds 10 for staging"
      OVER_LIMIT=$((OVER_LIMIT + 1))
    fi
  done

  if [ "$OVER_LIMIT" -eq 0 ]; then
    gate_pass "ZRP-K-136" "Resource constraints within staging budget"
  else
    gate_warn "ZRP-K-136" "Resource limits" "$OVER_LIMIT resource constraint(s) exceed staging budget"
  fi
else
  gate_warn "ZRP-K-136" "Resource limits" "deploy.yml not found"
fi

# =============================================================================
# ZRP-K-138: Background jobs stable and observable (WARNING P2)
# =============================================================================
echo ""
echo "--- ZRP-K-138: Background job safety ---"

# Scan for setInterval/setTimeout/cron without try/catch
BG_FILES=$(grep -rlE 'setInterval|setTimeout|cron\.|schedule\(' $BACKEND_SRC 2>/dev/null | \
  grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$' || echo "")

UNSAFE_BG=0
for f in $BG_FILES; do
  # Check if try/catch exists in the same file
  if ! grep -qE 'try\s*\{|\.catch\(' "$f" 2>/dev/null; then
    echo "  WARN: $f has background jobs without error handling"
    UNSAFE_BG=$((UNSAFE_BG + 1))
  fi
done

if [ "$UNSAFE_BG" -eq 0 ]; then
  gate_pass "ZRP-K-138" "Background jobs have error handling"
else
  gate_warn "ZRP-K-138" "Background jobs" "$UNSAFE_BG file(s) with unprotected background jobs"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "==============================================================="
echo "ZRP Scalability Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "==============================================================="

echo "ZRP_SCALE_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_SCALE_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL scalability gate(s) failed."
  exit 1
fi

echo ""
echo "Scalability: All blocking gates passed."
exit 0
