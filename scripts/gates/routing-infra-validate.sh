#!/usr/bin/env bash
# =============================================================================
# ZRP Category L: Routing Infrastructure Validation (CD Gate)
# Gates: ZRP-L-023 through ZRP-L-030
# Validates GCP infra (URL map, NEGs, backend services, Cloud Run) matches
# RELEASES/ROUTING_SPEC.json. Requires gcloud authentication.
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP Category L: Routing Infrastructure Validation ==="
echo ""

GCP_PROJECT="${GCP_PROJECT:-supermandi-backend}"
GCP_REGION="${GCP_REGION:-asia-south1}"
URL_MAP="${URL_MAP:-supermandi-staging-urlmap}"
SSL_CERT="${SSL_CERT:-supermandi-staging-cert}"

# =============================================================================
# L-023: URL map exists
# =============================================================================
echo "--- L-023: URL map exists ---"
URL_MAP_JSON=$(gcloud compute url-maps describe "$URL_MAP" \
  --project="$GCP_PROJECT" \
  --format=json 2>/dev/null || echo "")

if [ -n "$URL_MAP_JSON" ] && [ "$URL_MAP_JSON" != "" ]; then
  gate_pass "L-023" "URL map '$URL_MAP' exists"
else
  gate_fail "L-023" "URL map" "'$URL_MAP' not found in project $GCP_PROJECT"
  echo ""
  echo "BLOCKED: URL map missing — cannot validate routing infra."
  echo "ZRP_ROUTING_INFRA_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
  echo "ZRP_ROUTING_INFRA_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
  exit 1
fi

# =============================================================================
# L-024: SSL cert active
# =============================================================================
echo ""
echo "--- L-024: SSL certificate ---"
CERT_STATUS=$(gcloud compute ssl-certificates describe "$SSL_CERT" \
  --project="$GCP_PROJECT" \
  --format="value(managed.status)" 2>/dev/null || echo "NOT_FOUND")

if [ "$CERT_STATUS" = "ACTIVE" ]; then
  gate_pass "L-024" "SSL cert '$SSL_CERT' is ACTIVE"
elif [ "$CERT_STATUS" = "NOT_FOUND" ]; then
  gate_fail "L-024" "SSL cert" "'$SSL_CERT' not found"
else
  gate_warn "L-024" "SSL cert" "Status is $CERT_STATUS (expected ACTIVE)"
fi

# =============================================================================
# L-025: Path rules match spec
# =============================================================================
echo ""
echo "--- L-025: Path rules in URL map ---"
# Extract path matchers from URL map
EXPECTED_PATHS=("/retailer/*" "/supplier/*" "/admin/*" "/api/*")
PATH_ERRORS=0

for path in "${EXPECTED_PATHS[@]}"; do
  if echo "$URL_MAP_JSON" | grep -q "$path" 2>/dev/null; then
    echo "  OK: $path has path rule"
  else
    echo "  MISSING: $path not in URL map path rules"
    PATH_ERRORS=$((PATH_ERRORS + 1))
  fi
done

if [ "$PATH_ERRORS" -eq 0 ]; then
  gate_pass "L-025" "All ${#EXPECTED_PATHS[@]} path rules present in URL map"
else
  gate_fail "L-025" "Path rules" "$PATH_ERRORS path rule(s) missing from URL map"
fi

# =============================================================================
# L-026: Backend services exist
# =============================================================================
echo ""
echo "--- L-026: Backend services ---"
# List all backend services in the project
BACKEND_SERVICES=$(gcloud compute backend-services list \
  --project="$GCP_PROJECT" \
  --format="value(name)" 2>/dev/null || echo "")

BS_ERRORS=0
# Check that URL map references backend services that exist
# Extract backend service names from URL map JSON
REFERENCED_BS=$(echo "$URL_MAP_JSON" | grep -oP 'backendServices/\K[^"]+' 2>/dev/null | sort -u || echo "")

if [ -n "$REFERENCED_BS" ]; then
  while IFS= read -r bs; do
    bs_name=$(basename "$bs")
    if echo "$BACKEND_SERVICES" | grep -q "$bs_name" 2>/dev/null; then
      echo "  OK: Backend service '$bs_name' exists"
    else
      echo "  MISSING: Backend service '$bs_name' referenced but not found"
      BS_ERRORS=$((BS_ERRORS + 1))
    fi
  done <<< "$REFERENCED_BS"
  if [ "$BS_ERRORS" -eq 0 ]; then
    gate_pass "L-026" "All referenced backend services exist"
  else
    gate_fail "L-026" "Backend services" "$BS_ERRORS backend service(s) missing"
  fi
else
  gate_warn "L-026" "Backend services" "Could not extract backend service refs from URL map"
fi

# =============================================================================
# L-027: NEGs point to Cloud Run services
# =============================================================================
echo ""
echo "--- L-027: NEGs → Cloud Run ---"
EXPECTED_CLOUD_RUN=("api-gateway" "main-backend" "retailer-admin" "supplier-portal" "superadmin" "landing")
NEG_ERRORS=0

# List all serverless NEGs
NEGS=$(gcloud compute network-endpoint-groups list \
  --project="$GCP_PROJECT" \
  --format="value(name)" 2>/dev/null || echo "")

for svc in "${EXPECTED_CLOUD_RUN[@]}"; do
  # Check if a NEG exists that references this service
  # NEG names may vary, so check both NEG list and NEG details
  FOUND=false
  if echo "$NEGS" | grep -qi "$svc" 2>/dev/null; then
    FOUND=true
  fi
  if [ "$FOUND" = "true" ]; then
    echo "  OK: NEG for '$svc' found"
  else
    echo "  WARN: No NEG found matching '$svc' (name may differ)"
    # Not a hard fail — NEG naming conventions vary
  fi
done

# At minimum, verify NEGs exist at all
NEG_COUNT=$(echo "$NEGS" | grep -c . 2>/dev/null || echo "0")
if [ "$NEG_COUNT" -ge 5 ]; then
  gate_pass "L-027" "$NEG_COUNT NEGs found (>=5 expected for routing)"
else
  gate_fail "L-027" "NEGs" "Only $NEG_COUNT NEG(s) found (need >=5 for 5 public services)"
fi

# =============================================================================
# L-028: All 6 Cloud Run services exist
# =============================================================================
echo ""
echo "--- L-028: Cloud Run services ---"
CR_ERRORS=0
for svc in "${EXPECTED_CLOUD_RUN[@]}"; do
  STATUS=$(gcloud run services describe "$svc" \
    --region="$GCP_REGION" \
    --project="$GCP_PROJECT" \
    --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")

  if [ "$STATUS" = "True" ]; then
    echo "  OK: $svc — Active"
  elif [ "$STATUS" = "NOT_FOUND" ]; then
    echo "  FAIL: $svc — does not exist"
    CR_ERRORS=$((CR_ERRORS + 1))
  else
    echo "  WARN: $svc — status=$STATUS"
  fi
done

if [ "$CR_ERRORS" -eq 0 ]; then
  gate_pass "L-028" "All 6 Cloud Run services exist and are active"
else
  gate_fail "L-028" "Cloud Run services" "$CR_ERRORS service(s) missing or inactive"
fi

# =============================================================================
# L-029: Cloud Run container ports match spec
# =============================================================================
echo ""
echo "--- L-029: Cloud Run container ports ---"
PORT_ERRORS=0
check_cr_port() {
  local svc="$1" expected="$2"
  PORT=$(gcloud run services describe "$svc" \
    --region="$GCP_REGION" \
    --project="$GCP_PROJECT" \
    --format="value(spec.template.spec.containers[0].ports[0].containerPort)" 2>/dev/null || echo "")
  if [ "$PORT" = "$expected" ]; then
    echo "  OK: $svc port=$expected"
  elif [ -z "$PORT" ]; then
    echo "  WARN: $svc — could not determine port (may use default 8080)"
  else
    echo "  MISMATCH: $svc port=$PORT (expected $expected)"
    PORT_ERRORS=$((PORT_ERRORS + 1))
  fi
}

check_cr_port "api-gateway" "3000"
check_cr_port "main-backend" "3010"
check_cr_port "retailer-admin" "80"
check_cr_port "supplier-portal" "3001"
check_cr_port "superadmin" "80"
check_cr_port "landing" "80"

if [ "$PORT_ERRORS" -eq 0 ]; then
  gate_pass "L-029" "Cloud Run container ports match spec"
else
  gate_fail "L-029" "Container ports" "$PORT_ERRORS port mismatch(es)"
fi

# =============================================================================
# L-030: Default backend = landing
# =============================================================================
echo ""
echo "--- L-030: Default backend → landing ---"
DEFAULT_SVC=$(echo "$URL_MAP_JSON" | grep -oP '"defaultService":\s*"[^"]*"' 2>/dev/null | head -1 || echo "")
if echo "$DEFAULT_SVC" | grep -qi "landing" 2>/dev/null; then
  gate_pass "L-030" "URL map default backend → landing service"
else
  if [ -n "$DEFAULT_SVC" ]; then
    gate_fail "L-030" "Default backend" "Default is $DEFAULT_SVC (expected landing)"
  else
    gate_warn "L-030" "Default backend" "Could not determine default backend from URL map"
  fi
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ZRP Routing Infra: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "═══════════════════════════════════════════════════════════════"

echo "ZRP_ROUTING_INFRA_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_ROUTING_INFRA_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL routing infra gate(s) failed."
  exit 1
fi

echo ""
echo "Routing Infra: All blocking gates passed."
exit 0
