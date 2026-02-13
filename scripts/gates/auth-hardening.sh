#!/usr/bin/env bash
# =============================================================================
# ZRP-F-071, F-073, F-077: Auth Hardening, PII Scan, SAST
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP-F-071/073/077: Auth Hardening & SAST ==="
echo ""

# =============================================================================
# ZRP-F-071: Rate limiting on login/OTP endpoints (BLOCKING P1)
# =============================================================================
echo "--- ZRP-F-071: Rate limiting on auth endpoints ---"

RATE_LIMIT_FOUND=false

# Check for rate-limiter middleware in api-gateway
RATELIMIT_FILES=$(grep -rlE 'rateLimit|rate-limit|rateLimiter|express-rate-limit|rate_limit' \
  backend/services/api-gateway/ backend/services/auth-service/ backend/src/ 2>/dev/null | \
  grep -vE 'node_modules|dist|\.test\.|\.spec\.' || echo "")

if [ -n "$RATELIMIT_FILES" ]; then
  echo "  Rate limiting references found:"
  echo "$RATELIMIT_FILES" | while read -r f; do echo "    - $f"; done
  RATE_LIMIT_FOUND=true
fi

# Check for express-rate-limit in dependencies
if grep -q "express-rate-limit" backend/package.json 2>/dev/null || \
   grep -q "rate-limiter-flexible" backend/package.json 2>/dev/null; then
  echo "  OK: Rate limiting package in dependencies"
  RATE_LIMIT_FOUND=true
fi

# Check env var RATE_LIMIT_MULTIPLIER (used in deploy.yml)
if grep -q "RATE_LIMIT_MULTIPLIER" backend/services/api-gateway/src/ 2>/dev/null || \
   grep -q "RATE_LIMIT_MULTIPLIER" backend/services/auth-service/src/ 2>/dev/null || \
   grep -q "RATE_LIMIT" backend/src/ 2>/dev/null; then
  RATE_LIMIT_FOUND=true
fi

if [ "$RATE_LIMIT_FOUND" = "true" ]; then
  gate_pass "ZRP-F-071" "Rate limiting configured on auth endpoints"
else
  gate_fail "ZRP-F-071" "Rate limiting" "No rate limiter found on auth/login/OTP endpoints"
fi

# =============================================================================
# ZRP-F-073: No sensitive data in logs — PII scan (BLOCKING P1)
# =============================================================================
echo ""
echo "--- ZRP-F-073: PII in logs scan ---"

PII_VIOLATIONS=0
PII_PATTERNS='console\.\(log\|info\|warn\|error\).*\(password\|token\|jwt\|secret\|ssn\|phone\|email\|otp\|credit.card\)'

# Scan backend code for logging patterns that include sensitive data
BACKEND_DIRS="backend/src backend/services backend/packages"
PII_FILES=""
for dir in $BACKEND_DIRS; do
  if [ -d "$dir" ]; then
    FOUND=$(grep -rlE 'console\.(log|info|warn|error|debug).*(\bpassword\b|\btoken\b|\bjwt\b|\bsecret\b|\bssn\b|\bcreditCard\b)' \
      "$dir" 2>/dev/null | grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$' || echo "")
    if [ -n "$FOUND" ]; then
      PII_FILES="$PII_FILES $FOUND"
    fi
  fi
done

# Also check for logger.* patterns
for dir in $BACKEND_DIRS; do
  if [ -d "$dir" ]; then
    FOUND=$(grep -rlE 'logger\.(log|info|warn|error|debug).*(\bpassword\b|\bsecret\b|\bjwt\b|\btoken\b)' \
      "$dir" 2>/dev/null | grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$' || echo "")
    if [ -n "$FOUND" ]; then
      PII_FILES="$PII_FILES $FOUND"
    fi
  fi
done

PII_FILES=$(echo "$PII_FILES" | tr ' ' '\n' | sort -u | grep -v '^$' || echo "")
if [ -n "$PII_FILES" ]; then
  PII_VIOLATIONS=$(echo "$PII_FILES" | wc -l)
  echo "  Found $PII_VIOLATIONS file(s) potentially logging sensitive data:"
  echo "$PII_FILES" | head -5 | while read -r f; do echo "    - $f"; done
fi

if [ "$PII_VIOLATIONS" -eq 0 ]; then
  gate_pass "ZRP-F-073" "No sensitive data in logging patterns"
else
  gate_fail "ZRP-F-073" "PII in logs" "$PII_VIOLATIONS file(s) may log sensitive data"
fi

# =============================================================================
# ZRP-F-077: Basic SAST — dangerous patterns (WARNING P2)
# =============================================================================
echo ""
echo "--- ZRP-F-077: Basic SAST scan ---"

SAST_ISSUES=0
ALL_SRC="backend/src backend/services backend/packages retailer-admin/src supplier-portal/src supermandi-superadmin/src"

# Check 1: eval() usage
EVAL_FILES=$(grep -rlE '\beval\s*\(' $ALL_SRC 2>/dev/null | grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$' || echo "")
if [ -n "$EVAL_FILES" ]; then
  COUNT=$(echo "$EVAL_FILES" | wc -l)
  echo "  ALERT: eval() found in $COUNT file(s)"
  echo "$EVAL_FILES" | head -3 | while read -r f; do echo "    - $f"; done
  SAST_ISSUES=$((SAST_ISSUES + COUNT))
fi

# Check 2: dangerouslySetInnerHTML
DANGER_FILES=$(grep -rl 'dangerouslySetInnerHTML' $ALL_SRC 2>/dev/null | grep -vE 'node_modules|dist|\.test\.|\.spec\.' || echo "")
if [ -n "$DANGER_FILES" ]; then
  COUNT=$(echo "$DANGER_FILES" | wc -l)
  echo "  ALERT: dangerouslySetInnerHTML in $COUNT file(s)"
  echo "$DANGER_FILES" | head -3 | while read -r f; do echo "    - $f"; done
  SAST_ISSUES=$((SAST_ISSUES + COUNT))
fi

# Check 3: child_process.exec with variable interpolation
EXEC_FILES=$(grep -rlE 'exec\s*\(`|exec\s*\(\s*[^"'"'"']' $ALL_SRC 2>/dev/null | grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$' || echo "")
if [ -n "$EXEC_FILES" ]; then
  COUNT=$(echo "$EXEC_FILES" | wc -l)
  echo "  ALERT: exec() with variable input in $COUNT file(s)"
  SAST_ISSUES=$((SAST_ISSUES + COUNT))
fi

# Check 4: SQL string concatenation (not parameterized)
SQL_CONCAT=$(grep -rnE "query\s*\(\s*['\"\`].*\\\$\{|query\s*\(\s*.*\+" $ALL_SRC 2>/dev/null | \
  grep -vE 'node_modules|dist|\.test\.|\.spec\.|\.d\.ts$' | \
  grep -iE 'SELECT|INSERT|UPDATE|DELETE' || echo "")
if [ -n "$SQL_CONCAT" ]; then
  COUNT=$(echo "$SQL_CONCAT" | wc -l)
  echo "  ALERT: SQL concatenation in $COUNT location(s)"
  echo "$SQL_CONCAT" | head -3 | while read -r line; do echo "    $line"; done
  SAST_ISSUES=$((SAST_ISSUES + COUNT))
fi

if [ "$SAST_ISSUES" -eq 0 ]; then
  gate_pass "ZRP-F-077" "No dangerous code patterns found"
else
  gate_warn "ZRP-F-077" "SAST" "$SAST_ISSUES potentially dangerous pattern(s) found"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "==============================================================="
echo "ZRP Auth Hardening Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "==============================================================="

echo "ZRP_AUTH_HARD_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_AUTH_HARD_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL auth hardening gate(s) failed."
  exit 1
fi

echo ""
echo "Auth Hardening: All blocking gates passed."
exit 0
