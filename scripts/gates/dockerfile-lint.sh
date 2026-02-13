#!/usr/bin/env bash
# =============================================================================
# ZRP-B-014: Dockerfile Lint Gate
# Validates all deployment Dockerfiles using hadolint.
# Falls back to basic checks if hadolint is not available.
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP-B-014: Dockerfile Lint Gate ==="
echo ""

DOCKERFILES=(
  "backend/services/api-gateway/Dockerfile"
  "backend/Dockerfile.main"
  "retailer-admin/Dockerfile"
  "supplier-portal/Dockerfile"
  "supermandi-superadmin/Dockerfile"
  "supermandi-landing/Dockerfile"
)

# Check if hadolint is available
HAS_HADOLINT=false
if command -v hadolint &>/dev/null; then
  HAS_HADOLINT=true
  echo "Using hadolint for Dockerfile linting"
else
  echo "hadolint not found — using basic Dockerfile checks"
fi

LINT_ERRORS=0
LINT_WARNINGS=0

for df in "${DOCKERFILES[@]}"; do
  if [ ! -f "$df" ]; then
    echo "  SKIP: $df (not found)"
    continue
  fi

  echo "  Checking: $df"

  if [ "$HAS_HADOLINT" = "true" ]; then
    # Run hadolint, capture output
    HADOLINT_OUTPUT=$(hadolint --no-color "$df" 2>&1 || true)
    ERRORS=$(echo "$HADOLINT_OUTPUT" | grep -c "error" 2>/dev/null || echo "0")
    WARNINGS=$(echo "$HADOLINT_OUTPUT" | grep -c "warning" 2>/dev/null || echo "0")
    if [ "$ERRORS" -gt 0 ]; then
      echo "    ERRORS: $ERRORS"
      echo "$HADOLINT_OUTPUT" | grep "error" | head -5
      LINT_ERRORS=$((LINT_ERRORS + ERRORS))
    fi
    if [ "$WARNINGS" -gt 0 ]; then
      LINT_WARNINGS=$((LINT_WARNINGS + WARNINGS))
    fi
  else
    # Basic checks without hadolint
    # Check 1: FROM uses specific tag (not :latest)
    if grep -qE '^FROM\s+\S+:latest' "$df" 2>/dev/null; then
      echo "    WARN: Uses :latest tag (pin to specific version)"
      LINT_WARNINGS=$((LINT_WARNINGS + 1))
    fi
    # Check 2: Has WORKDIR set
    if ! grep -qE '^WORKDIR' "$df" 2>/dev/null; then
      echo "    WARN: No WORKDIR set"
      LINT_WARNINGS=$((LINT_WARNINGS + 1))
    fi
    # Check 3: No ADD when COPY would work (security: ADD can fetch URLs)
    ADD_COUNT=$(grep -cE '^\s*ADD\s' "$df" 2>/dev/null || echo "0")
    if [ "$ADD_COUNT" -gt 0 ]; then
      echo "    WARN: Uses ADD ($ADD_COUNT times) — prefer COPY unless extracting archives"
      LINT_WARNINGS=$((LINT_WARNINGS + ADD_COUNT))
    fi
    # Check 4: No apt-get without -y
    if grep -qE 'apt-get install(?!.*-y)' "$df" 2>/dev/null; then
      echo "    WARN: apt-get install without -y flag"
      LINT_WARNINGS=$((LINT_WARNINGS + 1))
    fi
    # Check 5: USER instruction present (don't run as root)
    if ! grep -qE '^\s*USER\s' "$df" 2>/dev/null; then
      echo "    INFO: No USER instruction (runs as root)"
    fi
  fi

  echo "    OK"
done

if [ "$LINT_ERRORS" -eq 0 ]; then
  gate_pass "ZRP-B-014" "Dockerfile lint ($LINT_WARNINGS warnings)"
else
  gate_fail "ZRP-B-014" "Dockerfile lint" "$LINT_ERRORS error(s) across Dockerfiles"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ZRP Dockerfile Lint Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "═══════════════════════════════════════════════════════════════"

echo "ZRP_DOCKER_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_DOCKER_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
