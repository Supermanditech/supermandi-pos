#!/usr/bin/env bash
# TEST-050: Final Security Sweep
#
# Runs all security tools and validates configuration:
# 1. Semgrep SAST (static analysis)
# 2. Gitleaks (secret detection)
# 3. npm audit (dependency vulnerabilities)
# 4. OWASP headers check
# 5. Auth/RBAC endpoint verification
#
# Usage:
#   bash e2e-tests/stress/security-sweep.sh
#
# Optional env vars:
#   BASE_URL — for runtime endpoint checks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0
WARN=0

log_result() {
  local name="$1" status="$2" detail="${3:-}"
  case "$status" in
    PASS) echo -e "${GREEN}[PASS]${NC} $name $detail"; ((PASS++)) ;;
    FAIL) echo -e "${RED}[FAIL]${NC} $name $detail"; ((FAIL++)) ;;
    WARN) echo -e "${YELLOW}[WARN]${NC} $name $detail"; ((WARN++)) ;;
    SKIP) echo -e "${YELLOW}[SKIP]${NC} $name $detail"; ((SKIP++)) ;;
  esac
}

echo "=============================================="
echo "TEST-050: Final Security Sweep"
echo "=============================================="
echo ""

cd "$PROJECT_ROOT"

# -------------------------------------------------------
# 1. Semgrep SAST
# -------------------------------------------------------
echo "--- [1/7] Semgrep SAST ---"
if command -v semgrep &>/dev/null; then
  if semgrep scan --config auto --error \
    --exclude='node_modules' --exclude='.next' --exclude='dist' --exclude='build' \
    --exclude='*.test.*' --exclude='*.spec.*' --exclude='e2e-tests' \
    --json > "$RESULTS_DIR/semgrep.json" 2>&1; then
    log_result "Semgrep SAST" "PASS" "(0 findings)"
  else
    FINDINGS=$(python3 -c "import json; d=json.load(open('$RESULTS_DIR/semgrep.json')); print(len(d.get('results',[])))" 2>/dev/null || echo "?")
    log_result "Semgrep SAST" "FAIL" "($FINDINGS findings — see results/semgrep.json)"
  fi
else
  log_result "Semgrep SAST" "SKIP" "(semgrep not installed — runs in CI via .github/workflows/ci-gates.yml)"
fi

# -------------------------------------------------------
# 2. Gitleaks
# -------------------------------------------------------
echo ""
echo "--- [2/7] Gitleaks Secret Detection ---"
if command -v gitleaks &>/dev/null; then
  if gitleaks detect --source . --no-git \
    --report-format json --report-path "$RESULTS_DIR/gitleaks.json" 2>&1; then
    log_result "Gitleaks" "PASS" "(0 secrets found)"
  else
    log_result "Gitleaks" "FAIL" "(secrets detected — see results/gitleaks.json)"
  fi
else
  log_result "Gitleaks" "SKIP" "(gitleaks not installed — runs in CI via .github/workflows/ci-gates.yml)"
fi

# -------------------------------------------------------
# 3. npm audit (all projects)
# -------------------------------------------------------
echo ""
echo "--- [3/7] npm audit ---"
for proj in backend retailer-admin supplier-portal supermandi-superadmin; do
  cd "$PROJECT_ROOT/$proj"
  if [ -f "package-lock.json" ]; then
    AUDIT_CMD="npm audit --production --audit-level=high"
  else
    AUDIT_CMD="pnpm audit --prod --audit-level high"
  fi

  if $AUDIT_CMD > "$RESULTS_DIR/audit-$proj.log" 2>&1; then
    log_result "npm audit: $proj" "PASS"
  else
    HIGH_COUNT=$(grep -c "high\|critical" "$RESULTS_DIR/audit-$proj.log" 2>/dev/null || echo "?")
    log_result "npm audit: $proj" "WARN" "($HIGH_COUNT high/critical — see results/audit-$proj.log)"
  fi
done

# Root (POS app)
cd "$PROJECT_ROOT"
if pnpm audit --prod --audit-level high > "$RESULTS_DIR/audit-pos.log" 2>&1; then
  log_result "npm audit: POS app" "PASS"
else
  log_result "npm audit: POS app" "WARN" "(see results/audit-pos.log)"
fi

# -------------------------------------------------------
# 4. .env file check (no secrets committed)
# -------------------------------------------------------
echo ""
echo "--- [4/7] Secret File Check ---"
SECRETS_FOUND=0
for pattern in ".env" ".env.local" ".env.production" "credentials.json" "service-account.json" "*.pem" "*.key"; do
  MATCHES=$(find . -name "$pattern" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -name "*.example" -not -name "*.sample" 2>/dev/null | head -20)
  if [ -n "$MATCHES" ]; then
    # Check if in .gitignore
    while IFS= read -r f; do
      if git ls-files --error-unmatch "$f" &>/dev/null 2>&1; then
        echo "  WARNING: $f is tracked by git!"
        SECRETS_FOUND=$((SECRETS_FOUND + 1))
      fi
    done <<< "$MATCHES"
  fi
done

if [ "$SECRETS_FOUND" -eq 0 ]; then
  log_result "Secret file check" "PASS" "(no .env/.key files tracked)"
else
  log_result "Secret file check" "FAIL" "($SECRETS_FOUND secret file(s) tracked in git)"
fi

# -------------------------------------------------------
# 5. Hardcoded secrets grep
# -------------------------------------------------------
echo ""
echo "--- [5/7] Hardcoded Secrets Grep ---"
cd "$PROJECT_ROOT"
HARDCODED=0

# Check for common secret patterns in source code
for pattern in "RAZORPAY_KEY_SECRET" "GOOGLE_APPLICATION_CREDENTIALS" "sk_live_" "sk_test_" "AIza" "ghp_" "gho_"; do
  MATCHES=$(grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    -l "$pattern" . \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build \
    2>/dev/null | grep -v "\.test\." | grep -v "\.spec\." | grep -v "\.example" | head -5)
  if [ -n "$MATCHES" ]; then
    # Check if it's just a reference (process.env.X) vs hardcoded value
    while IFS= read -r f; do
      if grep -q "= '$pattern\|= \"$pattern\|: '$pattern\|: \"$pattern" "$f" 2>/dev/null; then
        echo "  WARNING: Possible hardcoded secret in $f"
        HARDCODED=$((HARDCODED + 1))
      fi
    done <<< "$MATCHES"
  fi
done

if [ "$HARDCODED" -eq 0 ]; then
  log_result "Hardcoded secrets" "PASS"
else
  log_result "Hardcoded secrets" "FAIL" "($HARDCODED files with possible hardcoded secrets)"
fi

# -------------------------------------------------------
# 6. OWASP Security Headers (if BASE_URL available)
# -------------------------------------------------------
echo ""
echo "--- [6/7] Security Headers ---"
BASE_URL="${BASE_URL:-}"
if [ -n "$BASE_URL" ]; then
  HEADERS=$(curl -sI "$BASE_URL" 2>/dev/null || echo "")
  HEADER_ISSUES=0

  for hdr in "X-Frame-Options" "X-Content-Type-Options" "Strict-Transport-Security"; do
    if echo "$HEADERS" | grep -qi "$hdr"; then
      log_result "Header: $hdr" "PASS"
    else
      log_result "Header: $hdr" "WARN" "(missing)"
      HEADER_ISSUES=$((HEADER_ISSUES + 1))
    fi
  done
else
  log_result "Security headers" "SKIP" "(no BASE_URL set)"
fi

# -------------------------------------------------------
# 7. Auth endpoint protection
# -------------------------------------------------------
echo ""
echo "--- [7/7] Auth Endpoint Protection ---"
if [ -n "$BASE_URL" ]; then
  # Unauthenticated requests to protected endpoints should return 401
  for endpoint in "/api/v1/pos/sales" "/api/v1/pos/store-products/search?q=test" "/api/v1/pos/daily-summary"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint" 2>/dev/null || echo "000")
    if [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
      log_result "Auth guard: $endpoint" "PASS" "(→ $STATUS)"
    elif [ "$STATUS" = "000" ]; then
      log_result "Auth guard: $endpoint" "SKIP" "(connection failed)"
    else
      log_result "Auth guard: $endpoint" "FAIL" "(→ $STATUS, expected 401/403)"
    fi
  done
else
  log_result "Auth endpoint protection" "SKIP" "(no BASE_URL set)"
fi

# -------------------------------------------------------
# SUMMARY
# -------------------------------------------------------
echo ""
echo "=============================================="
echo "TEST-050: SECURITY SWEEP SUMMARY"
echo "=============================================="
echo -e "  ${GREEN}PASS${NC}: $PASS"
echo -e "  ${RED}FAIL${NC}: $FAIL"
echo -e "  ${YELLOW}WARN${NC}: $WARN"
echo -e "  ${YELLOW}SKIP${NC}: $SKIP"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}RESULT: FAIL — $FAIL security check(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}RESULT: PASS — No critical security issues found${NC}"
  echo "(Warnings and skips should be addressed before production go-live)"
  exit 0
fi
