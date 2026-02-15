#!/usr/bin/env bash
# =============================================================================
# ZRP Category L: Routing Spec Validation (CI Gate)
# Gates: ZRP-L-001 through ZRP-L-022
# Validates source configs match RELEASES/ROUTING_SPEC.json.
# Covers: web portals (retailer, supplier, admin), POS app API routes,
#         landing pages, nginx configs, gateway routes, deploy.yml parity.
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0
SPEC="RELEASES/ROUTING_SPEC.json"
DEPLOY_YML=".github/workflows/deploy.yml"

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP Category L: Routing Spec Validation ==="
echo ""

# =============================================================================
# L-001: Routing spec exists and is valid JSON
# =============================================================================
echo "--- L-001: Routing spec exists ---"
if [ ! -f "$SPEC" ]; then
  gate_fail "L-001" "Routing spec" "RELEASES/ROUTING_SPEC.json not found"
  echo ""
  echo "BLOCKED: Routing spec missing — cannot validate routing."
  exit 1
fi

if python3 -c "import json; json.load(open('$SPEC'))" 2>/dev/null || \
   node -e "JSON.parse(require('fs').readFileSync('$SPEC','utf8'))" 2>/dev/null; then
  gate_pass "L-001" "Routing spec exists and is valid JSON"
else
  gate_fail "L-001" "Routing spec" "File exists but is not valid JSON"
  echo ""
  echo "BLOCKED: Routing spec is malformed — cannot validate routing."
  exit 1
fi

# =============================================================================
# L-002: Retailer base path matches spec (/retailer/)
# =============================================================================
echo ""
echo "--- L-002: Retailer base path ---"
if grep -q "base:.*'/retailer/'" retailer-admin/vite.config.ts 2>/dev/null || \
   grep -q 'base:.*"/retailer/"' retailer-admin/vite.config.ts 2>/dev/null; then
  gate_pass "L-002" "Retailer vite.config base = /retailer/"
else
  gate_fail "L-002" "Retailer base path" "vite.config.ts base is not '/retailer/'"
fi

# =============================================================================
# L-003: Supplier basePath matches spec (/supplier)
# =============================================================================
echo ""
echo "--- L-003: Supplier basePath ---"
if grep -q "basePath:.*'/supplier'" supplier-portal/next.config.js 2>/dev/null || \
   grep -q 'basePath:.*"/supplier"' supplier-portal/next.config.js 2>/dev/null; then
  gate_pass "L-003" "Supplier next.config basePath = /supplier"
else
  gate_fail "L-003" "Supplier basePath" "next.config.js basePath is not '/supplier'"
fi

# =============================================================================
# L-004: SuperAdmin base path matches spec (/admin/)
# =============================================================================
echo ""
echo "--- L-004: SuperAdmin base path ---"
if grep -q "base:.*'/admin/'" supermandi-superadmin/vite.config.ts 2>/dev/null || \
   grep -q 'base:.*"/admin/"' supermandi-superadmin/vite.config.ts 2>/dev/null; then
  gate_pass "L-004" "SuperAdmin vite.config base = /admin/"
else
  gate_fail "L-004" "SuperAdmin base path" "vite.config.ts base is not '/admin/'"
fi

# =============================================================================
# L-005: deploy.yml service names match spec (all 6)
# =============================================================================
echo ""
echo "--- L-005: deploy.yml service names ---"
EXPECTED_SERVICES=("api-gateway" "main-backend" "retailer-admin" "supplier-portal" "superadmin" "landing")
MISSING_SVC=0
for svc in "${EXPECTED_SERVICES[@]}"; do
  if grep -q "\"$svc\"" "$DEPLOY_YML" 2>/dev/null || grep -q "'$svc'" "$DEPLOY_YML" 2>/dev/null; then
    echo "  OK: $svc found in deploy.yml"
  else
    echo "  MISSING: $svc not found in deploy.yml"
    MISSING_SVC=$((MISSING_SVC + 1))
  fi
done

if [ "$MISSING_SVC" -eq 0 ]; then
  gate_pass "L-005" "All 6 service names found in deploy.yml"
else
  gate_fail "L-005" "Service names" "$MISSING_SVC service(s) missing from deploy.yml"
fi

# =============================================================================
# L-006: PORTAL_BASE_URL in deploy.yml
# =============================================================================
echo ""
echo "--- L-006: PORTAL_BASE_URL ---"
if grep -q "PORTAL_BASE_URL=https://staging.supermandi.tech" "$DEPLOY_YML" 2>/dev/null; then
  gate_pass "L-006" "PORTAL_BASE_URL matches staging domain"
elif grep -q "PORTAL_BASE_URL" "$DEPLOY_YML" 2>/dev/null; then
  gate_fail "L-006" "PORTAL_BASE_URL" "Set but doesn't match https://staging.supermandi.tech"
else
  gate_fail "L-006" "PORTAL_BASE_URL" "Not found in deploy.yml"
fi

# =============================================================================
# L-007: ALLOWED_ORIGINS in deploy.yml
# =============================================================================
echo ""
echo "--- L-007: ALLOWED_ORIGINS ---"
if grep -q "ALLOWED_ORIGINS=https://staging.supermandi.tech" "$DEPLOY_YML" 2>/dev/null; then
  gate_pass "L-007" "ALLOWED_ORIGINS matches staging domain"
elif grep -q "ALLOWED_ORIGINS" "$DEPLOY_YML" 2>/dev/null; then
  gate_fail "L-007" "ALLOWED_ORIGINS" "Set but doesn't match staging domain"
else
  gate_fail "L-007" "ALLOWED_ORIGINS" "Not found in deploy.yml"
fi

# =============================================================================
# L-008: CORS_ALLOWED_ORIGINS in deploy.yml
# =============================================================================
echo ""
echo "--- L-008: CORS_ALLOWED_ORIGINS ---"
if grep -q "CORS_ALLOWED_ORIGINS=https://staging.supermandi.tech" "$DEPLOY_YML" 2>/dev/null; then
  gate_pass "L-008" "CORS_ALLOWED_ORIGINS matches staging domain"
elif grep -q "CORS_ALLOWED_ORIGINS" "$DEPLOY_YML" 2>/dev/null; then
  gate_fail "L-008" "CORS_ALLOWED_ORIGINS" "Set but doesn't match staging domain"
else
  gate_fail "L-008" "CORS_ALLOWED_ORIGINS" "Not found in deploy.yml"
fi

# =============================================================================
# L-009: Nginx retailer base path rewrites
# =============================================================================
echo ""
echo "--- L-009: Nginx retailer routing ---"
RETAILER_NGINX=""
for f in retailer-admin/nginx.conf retailer-admin/nginx-local-prod.conf retailer-admin/default.conf; do
  if [ -f "$f" ]; then RETAILER_NGINX="$f"; break; fi
done

if [ -n "$RETAILER_NGINX" ]; then
  if grep -q "/retailer/" "$RETAILER_NGINX" 2>/dev/null; then
    gate_pass "L-009" "Nginx retailer config references /retailer/ ($RETAILER_NGINX)"
  else
    gate_fail "L-009" "Nginx retailer" "Config $RETAILER_NGINX does not reference /retailer/"
  fi
else
  gate_warn "L-009" "Nginx retailer" "No nginx config found for retailer-admin"
fi

# =============================================================================
# L-010: Nginx superadmin base path rewrites
# =============================================================================
echo ""
echo "--- L-010: Nginx superadmin routing ---"
ADMIN_NGINX=""
for f in supermandi-superadmin/nginx.conf supermandi-superadmin/nginx-local-prod.conf supermandi-superadmin/default.conf; do
  if [ -f "$f" ]; then ADMIN_NGINX="$f"; break; fi
done

if [ -n "$ADMIN_NGINX" ]; then
  if grep -q "/admin/" "$ADMIN_NGINX" 2>/dev/null; then
    gate_pass "L-010" "Nginx superadmin config references /admin/ ($ADMIN_NGINX)"
  else
    gate_fail "L-010" "Nginx superadmin" "Config $ADMIN_NGINX does not reference /admin/"
  fi
else
  gate_warn "L-010" "Nginx superadmin" "No nginx config found for superadmin"
fi

# =============================================================================
# L-011: Gateway config has required route prefixes
# =============================================================================
echo ""
echo "--- L-011: Gateway route prefixes ---"
GW_CONFIG="backend/services/api-gateway/src/config.ts"
REQUIRED_PREFIXES=("/api/v1/admin" "/api/v1/pos" "/api/v1/auth" "/api/v1/supplier"
                   "/api/v1/catalog" "/api/v1/inventory" "/api/v1/orders"
                   "/api/v1/retailer-admin")
MISSING_ROUTES=0
if [ -f "$GW_CONFIG" ]; then
  for prefix in "${REQUIRED_PREFIXES[@]}"; do
    if grep -q "$prefix" "$GW_CONFIG" 2>/dev/null; then
      echo "  OK: $prefix"
    else
      echo "  MISSING: $prefix not in gateway config"
      MISSING_ROUTES=$((MISSING_ROUTES + 1))
    fi
  done
  if [ "$MISSING_ROUTES" -eq 0 ]; then
    gate_pass "L-011" "All ${#REQUIRED_PREFIXES[@]} required route prefixes found in gateway"
  else
    gate_fail "L-011" "Gateway routes" "$MISSING_ROUTES prefix(es) missing from gateway config"
  fi
else
  gate_fail "L-011" "Gateway routes" "Gateway config not found at $GW_CONFIG"
fi

# =============================================================================
# L-012: Supplier trailingSlash enabled
# =============================================================================
echo ""
echo "--- L-012: Supplier trailingSlash ---"
if grep -q "trailingSlash.*true" supplier-portal/next.config.js 2>/dev/null; then
  gate_pass "L-012" "Supplier next.config has trailingSlash: true"
else
  gate_fail "L-012" "Supplier trailingSlash" "next.config.js missing trailingSlash: true"
fi

# =============================================================================
# L-013: No wildcard CORS
# =============================================================================
echo ""
echo "--- L-013: No wildcard CORS ---"
if grep -qE "CORS_ALLOWED_ORIGINS=\*|ALLOWED_ORIGINS=\*" "$DEPLOY_YML" 2>/dev/null; then
  gate_fail "L-013" "Wildcard CORS" "deploy.yml contains CORS wildcard (*) — security risk"
else
  gate_pass "L-013" "No wildcard CORS in deploy.yml"
fi

# =============================================================================
# L-014: Dockerfiles expose correct ports
# =============================================================================
echo ""
echo "--- L-014: Dockerfile port parity ---"
PORT_ERRORS=0
check_port() {
  local dockerfile="$1" expected="$2" name="$3"
  if [ -f "$dockerfile" ]; then
    EXPOSED=$(grep -oP 'EXPOSE\s+\K\d+' "$dockerfile" 2>/dev/null | head -1 || echo "")
    if [ "$EXPOSED" = "$expected" ]; then
      echo "  OK: $name EXPOSE $expected"
    elif [ -z "$EXPOSED" ]; then
      echo "  WARN: $name — no EXPOSE directive (port $expected expected)"
    else
      echo "  MISMATCH: $name EXPOSE $EXPOSED (expected $expected)"
      PORT_ERRORS=$((PORT_ERRORS + 1))
    fi
  fi
}
check_port "backend/services/api-gateway/Dockerfile" "3000" "api-gateway"
check_port "backend/Dockerfile.main" "3010" "main-backend"
check_port "retailer-admin/Dockerfile" "80" "retailer-admin"
check_port "supplier-portal/Dockerfile" "3001" "supplier-portal"
check_port "supermandi-superadmin/Dockerfile" "80" "superadmin"
check_port "supermandi-landing/Dockerfile" "80" "landing"

if [ "$PORT_ERRORS" -eq 0 ]; then
  gate_pass "L-014" "Dockerfile ports match spec"
else
  gate_fail "L-014" "Dockerfile ports" "$PORT_ERRORS port mismatch(es)"
fi

# =============================================================================
# L-015: Retailer nginx SPA fallback
# =============================================================================
echo ""
echo "--- L-015: Retailer SPA fallback ---"
if [ -n "$RETAILER_NGINX" ]; then
  if grep -q "try_files" "$RETAILER_NGINX" 2>/dev/null && grep -q "index.html" "$RETAILER_NGINX" 2>/dev/null; then
    gate_pass "L-015" "Retailer nginx has try_files → index.html (SPA fallback)"
  else
    gate_fail "L-015" "Retailer SPA fallback" "Missing try_files → index.html in nginx config"
  fi
else
  gate_warn "L-015" "Retailer SPA fallback" "No nginx config found"
fi

# =============================================================================
# L-016: SuperAdmin nginx SPA fallback
# =============================================================================
echo ""
echo "--- L-016: SuperAdmin SPA fallback ---"
if [ -n "$ADMIN_NGINX" ]; then
  if grep -q "try_files" "$ADMIN_NGINX" 2>/dev/null && grep -q "index.html" "$ADMIN_NGINX" 2>/dev/null; then
    gate_pass "L-016" "SuperAdmin nginx has try_files → index.html (SPA fallback)"
  else
    gate_fail "L-016" "SuperAdmin SPA fallback" "Missing try_files → index.html in nginx config"
  fi
else
  gate_warn "L-016" "SuperAdmin SPA fallback" "No nginx config found"
fi

# =============================================================================
# L-017: Landing nginx does NOT have SPA fallback (static-only)
# =============================================================================
echo ""
echo "--- L-017: Landing no SPA fallback ---"
LANDING_NGINX=""
for f in supermandi-landing/nginx.conf supermandi-landing/default.conf; do
  if [ -f "$f" ]; then LANDING_NGINX="$f"; break; fi
done

if [ -n "$LANDING_NGINX" ]; then
  # Landing should return 404 on unknown routes, NOT serve index.html
  if grep -q "try_files.*index.html" "$LANDING_NGINX" 2>/dev/null; then
    # Check if it's the catch-all location (bad) or specific route (ok)
    if grep -A2 "location / {" "$LANDING_NGINX" 2>/dev/null | grep -q "try_files.*index.html"; then
      gate_fail "L-017" "Landing SPA fallback" "Catch-all serves index.html — should return 404 on unknown routes"
    else
      gate_pass "L-017" "Landing nginx: specific routes only, no catch-all SPA"
    fi
  else
    gate_pass "L-017" "Landing nginx: no SPA fallback (static routes only)"
  fi
else
  gate_warn "L-017" "Landing nginx" "No nginx config found"
fi

# =============================================================================
# L-018: API gateway ADMIN_SERVICE_URL in deploy.yml
# =============================================================================
echo ""
echo "--- L-018: ADMIN_SERVICE_URL ---"
if grep -q "ADMIN_SERVICE_URL" "$DEPLOY_YML" 2>/dev/null; then
  gate_pass "L-018" "ADMIN_SERVICE_URL configured in deploy.yml"
else
  gate_fail "L-018" "ADMIN_SERVICE_URL" "Not found in deploy.yml — gateway can't proxy to backend"
fi

# =============================================================================
# L-019: Every spec service has a deploy block
# =============================================================================
echo ""
echo "--- L-019: Spec-deploy service parity ---"
# Verify each service name appears in deploy contexts (gcloud run deploy)
PARITY_FAIL=0
for svc in "${EXPECTED_SERVICES[@]}"; do
  if grep -qE "gcloud run deploy.*$svc|gcloud run services.*$svc" "$DEPLOY_YML" 2>/dev/null; then
    echo "  OK: $svc has deploy block"
  else
    echo "  MISSING: $svc has no deploy block in deploy.yml"
    PARITY_FAIL=$((PARITY_FAIL + 1))
  fi
done

if [ "$PARITY_FAIL" -eq 0 ]; then
  gate_pass "L-019" "All 6 services have deploy blocks"
else
  gate_fail "L-019" "Spec-deploy parity" "$PARITY_FAIL service(s) missing deploy blocks"
fi

# =============================================================================
# L-020: POS app API routes in gateway (POS-specific)
# =============================================================================
echo ""
echo "--- L-020: POS API routes in gateway ---"
POS_PREFIXES=("/api/v1/pos" "/api/v1/auth" "/api/v1/orders" "/api/v1/inventory" "/api/v1/catalog")
POS_MISSING=0
if [ -f "$GW_CONFIG" ]; then
  for prefix in "${POS_PREFIXES[@]}"; do
    if grep -q "$prefix" "$GW_CONFIG" 2>/dev/null; then
      echo "  OK: $prefix (POS-critical route in gateway)"
    else
      echo "  MISSING: $prefix not in gateway — POS app will fail"
      POS_MISSING=$((POS_MISSING + 1))
    fi
  done
  if [ "$POS_MISSING" -eq 0 ]; then
    gate_pass "L-020" "All ${#POS_PREFIXES[@]} POS-critical API route prefixes in gateway"
  else
    gate_fail "L-020" "POS gateway routes" "$POS_MISSING POS-critical prefix(es) missing"
  fi
else
  gate_fail "L-020" "POS gateway routes" "Gateway config not found"
fi

# =============================================================================
# L-021: MIN_APP_VERSION in deploy.yml (POS version gating)
# =============================================================================
echo ""
echo "--- L-021: MIN_APP_VERSION ---"
if grep -q "MIN_APP_VERSION" "$DEPLOY_YML" 2>/dev/null; then
  gate_pass "L-021" "MIN_APP_VERSION configured in deploy.yml (POS version gate)"
else
  gate_fail "L-021" "MIN_APP_VERSION" "Not in deploy.yml — POS app version gating disabled"
fi

# =============================================================================
# L-022: Landing /pos download page exists
# =============================================================================
echo ""
echo "--- L-022: POS download page ---"
if [ -n "$LANDING_NGINX" ]; then
  if grep -q "/pos" "$LANDING_NGINX" 2>/dev/null; then
    gate_pass "L-022" "Landing nginx has /pos route (POS app download page)"
  else
    gate_fail "L-022" "POS download page" "/pos route not in landing nginx config"
  fi
else
  gate_warn "L-022" "POS download page" "No landing nginx config found"
fi

# Also check the HTML file exists
if [ -f "supermandi-landing/pos.html" ]; then
  echo "  OK: pos.html exists"
else
  gate_warn "L-022" "POS download page" "pos.html not found in supermandi-landing/"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ZRP Routing Spec Validation: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "═══════════════════════════════════════════════════════════════"

echo "ZRP_ROUTING_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_ROUTING_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_ROUTING_WARN=$WARN" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL routing gate(s) failed."
  exit 1
fi

echo ""
echo "Routing Spec Validation: All blocking gates passed."
exit 0
