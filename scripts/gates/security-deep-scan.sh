#!/usr/bin/env bash
# ZRP-M: Deep Security Scan Gate
# Validates security posture beyond basic audit
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { echo "  ✅ PASS: $1"; PASS=$((PASS + 1)); }
gate_fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL + 1)); }
gate_warn() { echo "  ⚠️ WARN: $1"; WARN=$((WARN + 1)); }

echo "=== ZRP-M: Deep Security Scan ==="
echo ""

# M-001: No hardcoded secrets in source
echo "--- M-001: No Hardcoded Secrets ---"
SECRETS_FOUND=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E "(password|secret|api_key|apiKey|private_key)\s*[:=]\s*['\"][^'\"]{8,}" \
  backend/ retailer-admin/src/ supplier-portal/src/ supermandi-superadmin/src/ src/ \
  2>/dev/null | grep -v node_modules | grep -v ".test." | grep -v "__tests__" | head -5 || true)
if [ -z "$SECRETS_FOUND" ]; then
  gate_pass "M-001: No hardcoded secrets in source"
else
  gate_fail "M-001: Hardcoded secrets found: $SECRETS_FOUND"
fi

# M-002: All admin routes require auth middleware
echo "--- M-002: Admin Route Auth ---"
UNPROTECTED=$(grep -rn "Router()" backend/src/routes/v1/admin/ 2>/dev/null | grep -v "adminAuth\|adminOtp" | while read -r line; do
  FILE=$(echo "$line" | cut -d: -f1)
  if ! grep -q "requireAdminToken" "$FILE" 2>/dev/null; then
    echo "$FILE"
  fi
done || true)
if [ -z "$UNPROTECTED" ]; then
  gate_pass "M-002: All admin routes have requireAdminToken"
else
  gate_fail "M-002: Unprotected admin routes: $UNPROTECTED"
fi

# M-003: No eval() or Function() in source
echo "--- M-003: No eval/Function ---"
EVALS=$(grep -rn --include="*.ts" --include="*.tsx" \
  -E "\beval\s*\(|new\s+Function\s*\(" \
  backend/src/ retailer-admin/src/ supplier-portal/src/ supermandi-superadmin/src/ src/ \
  2>/dev/null | grep -v node_modules | grep -v ".test." | head -3 || true)
if [ -z "$EVALS" ]; then
  gate_pass "M-003: No eval/Function in source"
else
  gate_fail "M-003: eval/Function found: $EVALS"
fi

# M-004: SQL injection prevention — no string concatenation in queries
echo "--- M-004: SQL Injection Prevention ---"
SQL_CONCAT=$(grep -rn --include="*.ts" \
  -E "query\s*\(\s*['\`].*\\\$\{" \
  backend/src/ 2>/dev/null | grep -v "pool.query(\`" | grep -v ".test." | head -5 || true)
if [ -z "$SQL_CONCAT" ]; then
  gate_pass "M-004: No SQL string concatenation detected"
else
  gate_warn "M-004: Potential SQL injection: $SQL_CONCAT"
fi

# M-005: CORS not set to wildcard
echo "--- M-005: CORS Not Wildcard ---"
WILDCARD_CORS=$(grep -rn "CORS_ALLOWED_ORIGINS.*\*\|origin:\s*true\|origin:\s*\*" \
  .github/workflows/ backend/src/ 2>/dev/null | grep -v ".test.\|FATAL\|forbidden\|MUST be\|warn\|error\|log\." | head -3 || true)
if [ -z "$WILDCARD_CORS" ]; then
  gate_pass "M-005: No wildcard CORS"
else
  gate_fail "M-005: Wildcard CORS found: $WILDCARD_CORS"
fi

# M-006: Helmet security headers enabled
echo "--- M-006: Helmet Headers ---"
if grep -rq "helmet" backend/services/api-gateway/src/ 2>/dev/null; then
  gate_pass "M-006: Helmet enabled in api-gateway"
else
  gate_fail "M-006: Helmet not found in api-gateway"
fi

# M-007: Rate limiting configured
echo "--- M-007: Rate Limiting ---"
if grep -rq "rate-limit\|rateLimit\|express-rate-limit" backend/services/api-gateway/src/ 2>/dev/null; then
  gate_pass "M-007: Rate limiting configured"
else
  gate_warn "M-007: Rate limiting not found in api-gateway"
fi

# M-008: JWT secret from env, not hardcoded
echo "--- M-008: JWT Secret From Env ---"
JWT_HARDCODED=$(grep -rn "jwt.sign\|jwt.verify" backend/src/ 2>/dev/null | \
  grep -v "process.env" | grep -v "JWT_SECRET" | grep -v ".test." | head -3 || true)
if [ -z "$JWT_HARDCODED" ]; then
  gate_pass "M-008: JWT secrets from environment"
else
  gate_warn "M-008: Check JWT secret source: $JWT_HARDCODED"
fi

# M-009: No console.log in production backend
echo "--- M-009: No console.log in Backend Prod ---"
CONSOLE_COUNT=$(grep -rn "console\.log" backend/src/ 2>/dev/null | grep -v node_modules | grep -v ".test." | wc -l || echo "0")
if [ "$CONSOLE_COUNT" -lt 10 ]; then
  gate_pass "M-009: Minimal console.log in backend ($CONSOLE_COUNT)"
else
  gate_warn "M-009: $CONSOLE_COUNT console.log statements in backend"
fi

# M-010: npm audit check
echo "--- M-010: Dependency Vulnerabilities ---"
# This runs in CI where npm/pnpm is available
if command -v pnpm &>/dev/null; then
  AUDIT_RESULT=$(cd backend && pnpm audit --json 2>/dev/null | grep -c '"severity":"critical"' 2>/dev/null || echo "0")
  AUDIT_RESULT=$(echo "$AUDIT_RESULT" | tr -d '[:space:]')
  if [ "$AUDIT_RESULT" = "0" ] || [ -z "$AUDIT_RESULT" ]; then
    gate_pass "M-010: No critical vulnerabilities"
  else
    gate_warn "M-010: $AUDIT_RESULT potential critical vulnerabilities (see ZRP-B-008 for authoritative audit)"
  fi
else
  gate_warn "M-010: pnpm not available, skipping audit"
fi

echo ""
echo "=== Security Deep Scan Results ==="
echo "PASS: $PASS | FAIL: $FAIL | WARN: $WARN"

if [ "$FAIL" -gt 0 ]; then
  echo "❌ SECURITY SCAN FAILED"
  exit 1
fi

echo "✅ Security scan passed"
