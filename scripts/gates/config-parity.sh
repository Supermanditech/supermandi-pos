#!/usr/bin/env bash
# =============================================================================
# ZRP Category D: Config Drift & Parity Gate
# Gates: ZRP-D-002, ZRP-D-004, ZRP-D-006, ZRP-D-012, ZRP-D-013, ZRP-D-014
# Validates deploy.yml config matches code requirements.
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0
DEPLOY_YML=".github/workflows/deploy.yml"

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP Category D: Config Drift & Parity ==="
echo ""

if [ ! -f "$DEPLOY_YML" ]; then
  echo "FATAL: $DEPLOY_YML not found"
  exit 1
fi

# =============================================================================
# ZRP-D-002: Env var parity — code references vs deploy.yml
# Critical env vars that MUST be in deploy.yml if referenced in code
# =============================================================================
echo "--- ZRP-D-002: Env var parity (code vs deploy.yml) ---"

CRITICAL_VARS=(
  "DATABASE_URL"
  "JWT_SECRET"
  "REDIS_HOST"
  "REDIS_PORT"
  "REDIS_URL"
  "NODE_ENV"
  "GIT_SHA"
  "FIREBASE_ENABLED"
  "FIREBASE_PROJECT_ID"
  "CORS_ALLOWED_ORIGINS"
  "ALLOWED_ORIGINS"
  "DB_HOST"
  "DB_PORT"
  "DB_NAME"
  "DB_USER"
  "DB_PASSWORD"
  "ADMIN_TOKEN"
  "SMTP_PASS"
)

MISSING_VARS=0
for var in "${CRITICAL_VARS[@]}"; do
  # Check if referenced in backend code
  CODE_REF=$(grep -rlE "process\.env\.$var|process\.env\[.$var" backend/src/ backend/services/ 2>/dev/null | head -1 || echo "")
  if [ -n "$CODE_REF" ]; then
    # Check if present in deploy.yml (as env var or secret)
    if grep -qE "(${var}=|${var}:|\"${var}\")" "$DEPLOY_YML" 2>/dev/null; then
      echo "  OK: $var (in code + deploy.yml)"
    else
      echo "  MISSING: $var (referenced in code but NOT in deploy.yml)"
      MISSING_VARS=$((MISSING_VARS + 1))
    fi
  fi
done

if [ "$MISSING_VARS" -eq 0 ]; then
  gate_pass "ZRP-D-002" "Env var parity"
else
  gate_fail "ZRP-D-002" "Env var parity" "$MISSING_VARS critical env var(s) missing from deploy.yml"
fi

# =============================================================================
# ZRP-D-004: CORS_ALLOWED_ORIGINS matches deployment domain
# =============================================================================
echo ""
echo "--- ZRP-D-004: CORS origin matches domain ---"

# Capture full comma-separated origin list inside --set-env-vars string.
# Stop at ';' (next env var) or '"' (end of env var payload).
CORS_VALUE=$(grep -oP 'CORS_ALLOWED_ORIGINS=\K[^;"]+' "$DEPLOY_YML" 2>/dev/null | head -1 || echo "")
ALLOWED_VALUE=$(grep -oP 'ALLOWED_ORIGINS=\K[^;"]+' "$DEPLOY_YML" 2>/dev/null | head -1 || echo "")

if [ -n "$CORS_VALUE" ]; then
  if echo "$CORS_VALUE" | grep -qE '^https://'; then
    if echo "$CORS_VALUE" | grep -qE 'https://supermandi\.tech|https://www\.supermandi\.tech'; then
      gate_fail "ZRP-D-004" "CORS origin" "Staging CORS includes production origin(s): $CORS_VALUE"
    else
      gate_pass "ZRP-D-004" "CORS origin is HTTPS and staging-only ($CORS_VALUE)"
    fi
  else
    gate_fail "ZRP-D-004" "CORS origin" "CORS_ALLOWED_ORIGINS is not HTTPS: $CORS_VALUE"
  fi
else
  gate_warn "ZRP-D-004" "CORS origin" "CORS_ALLOWED_ORIGINS not found in deploy.yml"
fi

# =============================================================================
# ZRP-D-006: Firebase build-args reference secrets (not empty)
# =============================================================================
echo ""
echo "--- ZRP-D-006: Firebase config references secrets ---"

FIREBASE_ARGS=(
  "VITE_FIREBASE_API_KEY"
  "VITE_FIREBASE_AUTH_DOMAIN"
  "VITE_FIREBASE_PROJECT_ID"
  "NEXT_PUBLIC_FIREBASE_API_KEY"
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
)

EMPTY_FIREBASE=0
for arg in "${FIREBASE_ARGS[@]}"; do
  VALUE=$(grep -oP "${arg}=\K.*" "$DEPLOY_YML" 2>/dev/null | head -1 || echo "")
  if [ -z "$VALUE" ] || [ "$VALUE" = '""' ] || [ "$VALUE" = "''" ]; then
    # Check if it references a secret (which is fine)
    if grep -qE "${arg}.*secrets\." "$DEPLOY_YML" 2>/dev/null; then
      echo "  OK: $arg (references secret)"
    else
      echo "  EMPTY: $arg has no value and no secret reference"
      EMPTY_FIREBASE=$((EMPTY_FIREBASE + 1))
    fi
  else
    echo "  OK: $arg (has value or secret ref)"
  fi
done

if [ "$EMPTY_FIREBASE" -eq 0 ]; then
  gate_pass "ZRP-D-006" "Firebase config"
else
  gate_fail "ZRP-D-006" "Firebase config" "$EMPTY_FIREBASE Firebase build-arg(s) are empty without secret references"
fi

# =============================================================================
# ZRP-D-012: No .env.production in Dockerfiles or .dockerignore covers it
# =============================================================================
echo ""
echo "--- ZRP-D-012: No .env.production in Docker images ---"

DOCKERFILES=(
  "backend/services/api-gateway/Dockerfile"
  "backend/Dockerfile.main"
  "retailer-admin/Dockerfile"
  "supplier-portal/Dockerfile"
  "supermandi-superadmin/Dockerfile"
  "supermandi-landing/Dockerfile"
)

ENV_IN_DOCKER=0
for df in "${DOCKERFILES[@]}"; do
  if [ -f "$df" ]; then
    if grep -qE 'COPY.*\.env' "$df" 2>/dev/null; then
      echo "  FAIL: $df copies .env file into image"
      ENV_IN_DOCKER=$((ENV_IN_DOCKER + 1))
    fi
  fi
done

if [ "$ENV_IN_DOCKER" -eq 0 ]; then
  gate_pass "ZRP-D-012" "No .env in Docker images"
else
  gate_fail "ZRP-D-012" "No .env in Docker images" "$ENV_IN_DOCKER Dockerfile(s) copy .env files"
fi

# =============================================================================
# ZRP-D-013: ALLOWED_ORIGINS == CORS_ALLOWED_ORIGINS
# =============================================================================
echo ""
echo "--- ZRP-D-013: ALLOWED_ORIGINS matches CORS_ALLOWED_ORIGINS ---"

if [ -n "$CORS_VALUE" ] && [ -n "$ALLOWED_VALUE" ]; then
  if [ "$CORS_VALUE" = "$ALLOWED_VALUE" ]; then
    gate_pass "ZRP-D-013" "Origins match ($CORS_VALUE)"
  else
    gate_fail "ZRP-D-013" "Origins match" "CORS=$CORS_VALUE vs ALLOWED=$ALLOWED_VALUE"
  fi
elif [ -z "$CORS_VALUE" ] && [ -z "$ALLOWED_VALUE" ]; then
  gate_warn "ZRP-D-013" "Origins match" "Neither CORS_ALLOWED_ORIGINS nor ALLOWED_ORIGINS found"
else
  gate_warn "ZRP-D-013" "Origins match" "Only one of CORS/ALLOWED origins is set"
fi

# =============================================================================
# ZRP-D-014: Service URL cross-references valid
# =============================================================================
echo ""
echo "--- ZRP-D-014: Service URL cross-references ---"

# api-gateway must reference main-backend URL (ADMIN_SERVICE_URL)
if grep -q 'ADMIN_SERVICE_URL' "$DEPLOY_YML" 2>/dev/null; then
  gate_pass "ZRP-D-014" "ADMIN_SERVICE_URL configured in api-gateway deploy"
else
  gate_fail "ZRP-D-014" "Service URL cross-refs" "ADMIN_SERVICE_URL not found in api-gateway deploy config"
fi

# =============================================================================
# ZRP-D-015: No deprecated retailer auth path in scripts
# RETAILER.AUTH.PROBE_PATH.001: Probe scripts must use /retailer-admin/auth/
# not the deprecated /retailer/auth/ (which returns 404 and creates false alarms)
# =============================================================================
echo ""
echo "--- ZRP-D-015: Deprecated retailer auth path check ---"

DEPRECATED_HITS=$(grep -rn '/api/v1/retailer/auth/' \
  scripts/ e2e-tests/ .github/workflows/ backend/scripts/ \
  --include='*.sh' --include='*.ps1' --include='*.js' --include='*.ts' --include='*.yml' \
  2>/dev/null || true)

if [ -z "$DEPRECATED_HITS" ]; then
  gate_pass "ZRP-D-015" "No deprecated /api/v1/retailer/auth/ path found in scripts"
else
  echo "$DEPRECATED_HITS"
  gate_fail "ZRP-D-015" "Deprecated auth path" "Scripts still reference /api/v1/retailer/auth/ — use /api/v1/retailer-admin/auth/ instead"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ZRP Config Parity Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "═══════════════════════════════════════════════════════════════"

echo "ZRP_CONFIG_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_CONFIG_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL config parity gate(s) failed."
  exit 1
fi

echo ""
echo "Config Parity: All blocking gates passed."
exit 0
