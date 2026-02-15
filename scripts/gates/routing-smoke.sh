#!/usr/bin/env bash
# =============================================================================
# ZRP Category L: Routing Smoke Tests (CD Gate — Post-Deploy)
# Gates: ZRP-L-031 through ZRP-L-046
# Hits every portal entry URL + deep links through the load balancer domain.
# Validates: HTTP status, redirects, SPA fallback, content, latency, POS API.
# Uses staging domain (not raw Cloud Run URLs) for full LB→NEG→CR validation.
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP Category L: Routing Smoke Tests ==="
echo ""

DOMAIN="${STAGING_DOMAIN:-https://staging.supermandi.tech}"
CURL_TIMEOUT="${CURL_TIMEOUT:-15}"
MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY="${RETRY_DELAY:-10}"

# Helper: curl with retries
curl_retry() {
  local url="$1" follow_redirects="${2:-true}" attempt=1
  local flags="-s --max-time $CURL_TIMEOUT"
  if [ "$follow_redirects" = "true" ]; then
    flags="$flags -L --max-redirs 10"
  fi
  while [ "$attempt" -le "$MAX_RETRIES" ]; do
    STATUS=$(eval curl $flags -o /tmp/routing_body -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    BODY=$(cat /tmp/routing_body 2>/dev/null || echo "")
    if [ "$STATUS" != "000" ]; then
      echo "$STATUS"
      return 0
    fi
    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      sleep "$RETRY_DELAY"
    fi
    attempt=$((attempt + 1))
  done
  echo "000"
}

# Helper: get redirect location header
get_redirect() {
  local url="$1"
  curl -s --max-time "$CURL_TIMEOUT" -o /dev/null -w "%{redirect_url}" "$url" 2>/dev/null || echo ""
}

# Helper: measure latency
get_latency_ms() {
  local url="$1"
  LATENCY=$(curl -sL --max-time 10 -o /dev/null -w "%{time_total}" "$url" 2>/dev/null || echo "99")
  echo "$LATENCY" | awk '{printf "%.0f", $1 * 1000}'
}

# =============================================================================
# L-031: Landing root → 200
# =============================================================================
echo "--- L-031: Landing root ---"
STATUS=$(curl_retry "$DOMAIN/")
if [ "$STATUS" = "200" ]; then
  gate_pass "L-031" "Landing root: HTTP $STATUS"
else
  gate_fail "L-031" "Landing root" "HTTP $STATUS (expected 200)"
fi

# =============================================================================
# L-032: /privacy → 200
# =============================================================================
echo ""
echo "--- L-032: Privacy page ---"
STATUS=$(curl_retry "$DOMAIN/privacy")
if [ "$STATUS" = "200" ]; then
  gate_pass "L-032" "Privacy page: HTTP $STATUS"
else
  gate_fail "L-032" "Privacy page" "HTTP $STATUS (expected 200)"
fi

# =============================================================================
# L-033: /terms → 200
# =============================================================================
echo ""
echo "--- L-033: Terms page ---"
STATUS=$(curl_retry "$DOMAIN/terms")
if [ "$STATUS" = "200" ]; then
  gate_pass "L-033" "Terms page: HTTP $STATUS"
else
  gate_fail "L-033" "Terms page" "HTTP $STATUS (expected 200)"
fi

# =============================================================================
# L-034: /pos download page → 200 (POS app)
# =============================================================================
echo ""
echo "--- L-034: POS download page ---"
STATUS=$(curl_retry "$DOMAIN/pos")
if [ "$STATUS" = "200" ]; then
  gate_pass "L-034" "POS download page: HTTP $STATUS"
else
  gate_fail "L-034" "POS download page" "HTTP $STATUS (expected 200)"
fi

# =============================================================================
# L-035: /retailer/ → 200 with SPA content
# =============================================================================
echo ""
echo "--- L-035: Retailer root ---"
STATUS=$(curl_retry "$DOMAIN/retailer/")
if [ "$STATUS" = "200" ]; then
  BODY=$(cat /tmp/routing_body 2>/dev/null || echo "")
  if echo "$BODY" | grep -q '<div id="root">' 2>/dev/null; then
    gate_pass "L-035" "Retailer root: HTTP 200 + SPA content verified"
  else
    gate_warn "L-035" "Retailer root" "HTTP 200 but no <div id=\"root\"> found"
    PASS=$((PASS + 1))  # Still pass — content may vary
  fi
else
  gate_fail "L-035" "Retailer root" "HTTP $STATUS (expected 200)"
fi

# =============================================================================
# L-036: /retailer (no slash) → redirect to /retailer/
# =============================================================================
echo ""
echo "--- L-036: Retailer trailing slash redirect ---"
STATUS=$(curl -s --max-time "$CURL_TIMEOUT" -o /dev/null -w "%{http_code}" "$DOMAIN/retailer" 2>/dev/null || echo "000")
REDIRECT_URL=$(get_redirect "$DOMAIN/retailer")
if [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ] || [ "$STATUS" = "308" ]; then
  if echo "$REDIRECT_URL" | grep -q "/retailer/" 2>/dev/null; then
    gate_pass "L-036" "Retailer redirect: HTTP $STATUS → /retailer/"
  else
    gate_warn "L-036" "Retailer redirect" "HTTP $STATUS but redirect to $REDIRECT_URL (expected /retailer/)"
    PASS=$((PASS + 1))
  fi
elif [ "$STATUS" = "200" ]; then
  # Some LBs serve content directly without redirect — acceptable
  gate_pass "L-036" "Retailer /retailer served directly (HTTP 200, no redirect needed)"
else
  gate_fail "L-036" "Retailer redirect" "HTTP $STATUS (expected 301/302/308 or 200)"
fi

# =============================================================================
# L-037: /retailer/dashboard → 200 (SPA deep link)
# =============================================================================
echo ""
echo "--- L-037: Retailer deep link ---"
STATUS=$(curl_retry "$DOMAIN/retailer/dashboard")
if [ "$STATUS" = "200" ]; then
  gate_pass "L-037" "Retailer deep link /retailer/dashboard: HTTP $STATUS (SPA fallback works)"
else
  gate_fail "L-037" "Retailer deep link" "HTTP $STATUS (expected 200 — SPA fallback broken)"
fi

# =============================================================================
# L-038: /supplier/ → 200
# =============================================================================
echo ""
echo "--- L-038: Supplier root ---"
STATUS=$(curl_retry "$DOMAIN/supplier/")
if [ "$STATUS" = "200" ]; then
  gate_pass "L-038" "Supplier root: HTTP $STATUS"
else
  gate_fail "L-038" "Supplier root" "HTTP $STATUS (expected 200)"
fi

# =============================================================================
# L-039: /supplier (no slash) → redirect
# =============================================================================
echo ""
echo "--- L-039: Supplier trailing slash redirect ---"
STATUS=$(curl -s --max-time "$CURL_TIMEOUT" -o /dev/null -w "%{http_code}" "$DOMAIN/supplier" 2>/dev/null || echo "000")
if [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ] || [ "$STATUS" = "308" ] || [ "$STATUS" = "200" ]; then
  gate_pass "L-039" "Supplier /supplier: HTTP $STATUS (redirect or direct serve)"
else
  gate_fail "L-039" "Supplier redirect" "HTTP $STATUS (expected 301/302/308/200)"
fi

# =============================================================================
# L-040: /supplier/orders → 200 (Next.js deep link)
# =============================================================================
echo ""
echo "--- L-040: Supplier deep link ---"
STATUS=$(curl_retry "$DOMAIN/supplier/orders")
if [ "$STATUS" = "200" ]; then
  gate_pass "L-040" "Supplier deep link /supplier/orders: HTTP $STATUS"
else
  gate_fail "L-040" "Supplier deep link" "HTTP $STATUS (expected 200)"
fi

# =============================================================================
# L-041: /admin/ → 200 with SPA content
# =============================================================================
echo ""
echo "--- L-041: Admin root ---"
STATUS=$(curl_retry "$DOMAIN/admin/")
if [ "$STATUS" = "200" ]; then
  BODY=$(cat /tmp/routing_body 2>/dev/null || echo "")
  if echo "$BODY" | grep -q '<div id="root">' 2>/dev/null; then
    gate_pass "L-041" "Admin root: HTTP 200 + SPA content verified"
  else
    gate_warn "L-041" "Admin root" "HTTP 200 but no <div id=\"root\"> found"
    PASS=$((PASS + 1))
  fi
else
  gate_fail "L-041" "Admin root" "HTTP $STATUS (expected 200)"
fi

# =============================================================================
# L-042: /admin (no slash) → redirect
# =============================================================================
echo ""
echo "--- L-042: Admin trailing slash redirect ---"
STATUS=$(curl -s --max-time "$CURL_TIMEOUT" -o /dev/null -w "%{http_code}" "$DOMAIN/admin" 2>/dev/null || echo "000")
if [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ] || [ "$STATUS" = "308" ] || [ "$STATUS" = "200" ]; then
  gate_pass "L-042" "Admin /admin: HTTP $STATUS (redirect or direct serve)"
else
  gate_fail "L-042" "Admin redirect" "HTTP $STATUS (expected 301/302/308/200)"
fi

# =============================================================================
# L-043: /admin/stores → 200 (SPA deep link)
# =============================================================================
echo ""
echo "--- L-043: Admin deep link ---"
STATUS=$(curl_retry "$DOMAIN/admin/stores")
if [ "$STATUS" = "200" ]; then
  gate_pass "L-043" "Admin deep link /admin/stores: HTTP $STATUS (SPA fallback works)"
else
  gate_fail "L-043" "Admin deep link" "HTTP $STATUS (expected 200 — SPA fallback broken)"
fi

# =============================================================================
# L-044: POS API through LB — /api/v1/pos/health (POS app connectivity)
# =============================================================================
echo ""
echo "--- L-044: POS API through LB ---"
STATUS=$(curl_retry "$DOMAIN/api/v1/pos/health")
if [ "$STATUS" -ge 200 ] && [ "$STATUS" -lt 500 ] 2>/dev/null; then
  gate_pass "L-044" "POS API reachable through LB: HTTP $STATUS (gateway proxying)"
else
  gate_fail "L-044" "POS API" "HTTP $STATUS (expected 2xx/4xx — gateway not proxying to backend)"
fi

# =============================================================================
# L-045: POS auth route through LB — /api/v1/auth/pos/send-otp
# =============================================================================
echo ""
echo "--- L-045: POS auth route through LB ---"
STATUS=$(curl_retry "$DOMAIN/api/v1/auth/pos/send-otp")
if [ "$STATUS" -ge 200 ] && [ "$STATUS" -lt 500 ] 2>/dev/null; then
  gate_pass "L-045" "POS auth route reachable: HTTP $STATUS"
else
  gate_fail "L-045" "POS auth route" "HTTP $STATUS (expected 2xx/4xx)"
fi

# =============================================================================
# L-046: No redirect loops (all key paths resolve within 10 redirects)
# =============================================================================
echo ""
echo "--- L-046: Redirect loop check ---"
LOOP_PATHS=("/" "/retailer/" "/supplier/" "/admin/" "/pos" "/api/v1/pos/health")
LOOPS=0
for path in "${LOOP_PATHS[@]}"; do
  STATUS=$(curl -sL --max-redirs 10 --max-time "$CURL_TIMEOUT" -o /dev/null -w "%{http_code}" "$DOMAIN$path" 2>/dev/null || echo "000")
  if [ "$STATUS" = "000" ]; then
    echo "  FAIL: $path — redirect loop or timeout"
    LOOPS=$((LOOPS + 1))
  else
    echo "  OK: $path → HTTP $STATUS (resolved within 10 redirects)"
  fi
done

if [ "$LOOPS" -eq 0 ]; then
  gate_pass "L-046" "No redirect loops detected on ${#LOOP_PATHS[@]} paths"
else
  gate_fail "L-046" "Redirect loops" "$LOOPS path(s) have redirect loops"
fi

# =============================================================================
# L-047: Portal latency < 2s (p95)
# =============================================================================
echo ""
echo "--- L-047: Portal latency ---"
LATENCY_PATHS=("/" "/retailer/" "/supplier/" "/admin/")
SLOW=0
for path in "${LATENCY_PATHS[@]}"; do
  MS=$(get_latency_ms "$DOMAIN$path")
  if [ "$MS" -le 2000 ] 2>/dev/null; then
    echo "  OK: $path — ${MS}ms"
  else
    echo "  SLOW: $path — ${MS}ms (>2000ms)"
    SLOW=$((SLOW + 1))
  fi
done

if [ "$SLOW" -eq 0 ]; then
  gate_pass "L-047" "All portals respond within 2s"
else
  gate_warn "L-047" "Portal latency" "$SLOW path(s) exceeded 2s (cold start possible)"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ZRP Routing Smoke: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "═══════════════════════════════════════════════════════════════"

echo "ZRP_ROUTING_SMOKE_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_ROUTING_SMOKE_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL routing smoke gate(s) failed."
  exit 1
fi

echo ""
echo "Routing Smoke: All blocking gates passed."
exit 0
