#!/bin/bash
# =============================================================================
# SuperMandi Deploy Verification Script
# =============================================================================
# Runs comprehensive CI-style + VM-style verification after every deploy.
# Outputs evidence to docs/go-live-evidence/<timestamp>/
#
# Usage: ./scripts/verification/deploy-verify.sh [--target <url>] [--output <dir>]
#
# Example:
#   ./scripts/verification/deploy-verify.sh
#   ./scripts/verification/deploy-verify.sh --target https://supermandi.tech
#   ./scripts/verification/deploy-verify.sh --target http://localhost:3000 --output ./my-evidence
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
TARGET_URL="${TARGET_URL:-https://supermandi.tech}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
EVIDENCE_DIR="${EVIDENCE_DIR:-docs/go-live-evidence/${TIMESTAMP}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# =============================================================================
# Parse Arguments
# =============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGET_URL="$2"
            shift 2
            ;;
        --output)
            EVIDENCE_DIR="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--target <url>] [--output <dir>]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# =============================================================================
# Helper Functions
# =============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASS_COUNT++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAIL_COUNT++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARN_COUNT++))
}

# Create evidence directory
setup_evidence_dir() {
    mkdir -p "$EVIDENCE_DIR"/{api,headers,routing,assets,security}
    echo "Evidence directory: $EVIDENCE_DIR"
    echo "Target URL: $TARGET_URL"
    echo "Timestamp: $TIMESTAMP"
    echo "---"
}

# Save curl output with headers
curl_with_evidence() {
    local url="$1"
    local output_file="$2"
    local method="${3:-GET}"
    local data="${4:-}"

    if [ -n "$data" ]; then
        curl -sS -X "$method" -H "Content-Type: application/json" -d "$data" \
            -w "\n---HTTP_CODE:%{http_code}---\n---TIME_TOTAL:%{time_total}s---\n" \
            -D "${output_file}.headers" \
            "$url" > "${output_file}.body" 2>&1
    else
        curl -sS -X "$method" \
            -w "\n---HTTP_CODE:%{http_code}---\n---TIME_TOTAL:%{time_total}s---\n" \
            -D "${output_file}.headers" \
            "$url" > "${output_file}.body" 2>&1
    fi

    # Extract HTTP code
    grep -o "HTTP_CODE:[0-9]*" "${output_file}.body" | cut -d: -f2 || echo "000"
}

# Check HTTP status
check_status() {
    local name="$1"
    local url="$2"
    local expected="$3"
    local output_file="$EVIDENCE_DIR/api/${name}"

    local actual=$(curl_with_evidence "$url" "$output_file")

    if [ "$actual" == "$expected" ]; then
        log_pass "$name: $url → $actual (expected $expected)"
        return 0
    else
        log_fail "$name: $url → $actual (expected $expected)"
        return 1
    fi
}

# Check header exists and matches pattern
check_header() {
    local name="$1"
    local headers_file="$2"
    local header_name="$3"
    local pattern="$4"

    if grep -qi "^$header_name:" "$headers_file"; then
        local value=$(grep -i "^$header_name:" "$headers_file" | head -1 | cut -d: -f2- | tr -d '\r')
        if echo "$value" | grep -qE "$pattern"; then
            log_pass "$name: $header_name matches '$pattern'"
            return 0
        else
            log_fail "$name: $header_name = '$value' (expected pattern: $pattern)"
            return 1
        fi
    else
        log_fail "$name: $header_name header missing"
        return 1
    fi
}

# Check response body is JSON (not HTML error page)
check_json_response() {
    local name="$1"
    local body_file="$2"

    # Check if body starts with { or [ (JSON)
    if head -c1 "$body_file" | grep -qE '[\{\[]'; then
        log_pass "$name: Response is JSON"
        return 0
    else
        log_fail "$name: Response is not JSON (likely HTML error page)"
        return 1
    fi
}

# =============================================================================
# Section 1: Health + Version Fingerprint
# =============================================================================
verify_health() {
    echo ""
    echo "=============================================="
    echo "1. HEALTH + VERSION FINGERPRINT"
    echo "=============================================="

    # API Health endpoint
    check_status "health_api" "$TARGET_URL/api/v1/health" "200"

    # Verify health response is JSON with expected structure
    if [ -f "$EVIDENCE_DIR/api/health_api.body" ]; then
        if grep -q '"status"' "$EVIDENCE_DIR/api/health_api.body" 2>/dev/null; then
            log_pass "health_api: Response contains 'status' field"
        else
            log_warn "health_api: Response missing 'status' field"
        fi
    fi

    # Version endpoint (if exists)
    local version_status=$(curl -sS -o /dev/null -w "%{http_code}" "$TARGET_URL/api/v1/version" 2>/dev/null || echo "000")
    if [ "$version_status" == "200" ]; then
        check_status "version_api" "$TARGET_URL/api/v1/version" "200"
    else
        log_info "version_api: Endpoint not found (optional)"
    fi

    # Check retailer HTML for build fingerprint
    curl -sS "$TARGET_URL/retailer/" > "$EVIDENCE_DIR/assets/retailer_html.body" 2>&1
    if grep -qE 'index-[A-Za-z0-9]+\.js' "$EVIDENCE_DIR/assets/retailer_html.body"; then
        local js_hash=$(grep -oE 'index-[A-Za-z0-9]+\.js' "$EVIDENCE_DIR/assets/retailer_html.body" | head -1)
        log_pass "build_fingerprint: Found JS hash '$js_hash'"
        echo "$js_hash" > "$EVIDENCE_DIR/assets/js_hash.txt"
    else
        log_fail "build_fingerprint: No JS hash found in HTML"
    fi
}

# =============================================================================
# Section 2: Critical API Endpoints
# =============================================================================
verify_api_endpoints() {
    echo ""
    echo "=============================================="
    echo "2. CRITICAL API ENDPOINTS"
    echo "=============================================="

    # Auth endpoints (expect 400/401 without proper data)
    check_status "auth_lookup" "$TARGET_URL/api/v1/retailer-admin/registration/lookup?phone=%2B919999999999" "200"

    # Check lookup response is JSON
    check_json_response "auth_lookup_json" "$EVIDENCE_DIR/api/auth_lookup.body"

    # Protected endpoints should return 401 without auth
    check_status "dashboard_unauth" "$TARGET_URL/api/v1/retailer-admin/dashboard" "401"
    check_json_response "dashboard_unauth_json" "$EVIDENCE_DIR/api/dashboard_unauth.body"

    check_status "admin_stores_unauth" "$TARGET_URL/api/v1/admin/stores" "401"
    check_json_response "admin_stores_unauth_json" "$EVIDENCE_DIR/api/admin_stores_unauth.body"

    # Token refresh (should return 401 with invalid token)
    curl_with_evidence "$TARGET_URL/api/v1/retailer-admin/auth/refresh" "$EVIDENCE_DIR/api/auth_refresh" "POST" '{"refreshToken":"invalid"}'
    local refresh_status=$(grep -o "HTTP_CODE:[0-9]*" "$EVIDENCE_DIR/api/auth_refresh.body" | cut -d: -f2)
    if [ "$refresh_status" == "401" ]; then
        log_pass "auth_refresh: Returns 401 for invalid token"
    else
        log_fail "auth_refresh: Expected 401, got $refresh_status"
    fi

    # Firebase OTP login (should return error for invalid token)
    curl_with_evidence "$TARGET_URL/api/v1/retailer-admin/auth/firebase-otp-login" "$EVIDENCE_DIR/api/firebase_login" "POST" '{"idToken":"invalid"}'
    check_json_response "firebase_login_json" "$EVIDENCE_DIR/api/firebase_login.body"

    # Registration create (validation error expected)
    curl_with_evidence "$TARGET_URL/api/v1/retailer-admin/registration/create" "$EVIDENCE_DIR/api/registration_create" "POST" '{"phone":"+919999999999"}'
    check_json_response "registration_create_json" "$EVIDENCE_DIR/api/registration_create.body"

    # Verify error responses are structured JSON, not HTML
    for file in "$EVIDENCE_DIR/api"/*.body; do
        if [ -f "$file" ]; then
            local basename=$(basename "$file" .body)
            if grep -q "<!DOCTYPE html>" "$file" 2>/dev/null; then
                log_fail "${basename}: Response is HTML (nginx error page)"
            fi
        fi
    done
}

# =============================================================================
# Section 3: Static Asset Caching
# =============================================================================
verify_asset_caching() {
    echo ""
    echo "=============================================="
    echo "3. STATIC ASSET CACHING"
    echo "=============================================="

    # Get JS hash from HTML
    local js_hash=""
    local css_hash=""
    if [ -f "$EVIDENCE_DIR/assets/retailer_html.body" ]; then
        js_hash=$(grep -oE 'index-[A-Za-z0-9]+\.js' "$EVIDENCE_DIR/assets/retailer_html.body" | head -1)
        css_hash=$(grep -oE 'index-[A-Za-z0-9]+\.css' "$EVIDENCE_DIR/assets/retailer_html.body" | head -1)
    fi

    # Verify JS asset accessible and has immutable cache
    if [ -n "$js_hash" ]; then
        curl -sS -I "$TARGET_URL/retailer/assets/$js_hash" > "$EVIDENCE_DIR/assets/js_asset.headers" 2>&1

        local js_status=$(grep -oE "HTTP/[0-9.]+ [0-9]+" "$EVIDENCE_DIR/assets/js_asset.headers" | head -1 | awk '{print $2}')
        if [ "$js_status" == "200" ]; then
            log_pass "js_asset: $js_hash accessible (200)"
        else
            log_fail "js_asset: $js_hash returned $js_status"
        fi

        # Check Cache-Control for immutable
        if grep -qi "cache-control:.*immutable" "$EVIDENCE_DIR/assets/js_asset.headers" 2>/dev/null; then
            log_pass "js_cache: Has 'immutable' directive"
        else
            log_warn "js_cache: Missing 'immutable' directive (recommended for hashed assets)"
        fi

        # Check for long max-age (should be ~1 year for hashed assets)
        if grep -qiE "max-age=(31536000|315360000|2592000)" "$EVIDENCE_DIR/assets/js_asset.headers" 2>/dev/null; then
            log_pass "js_cache: Has appropriate max-age"
        else
            log_warn "js_cache: max-age may be too short for hashed assets"
        fi
    fi

    # Verify CSS asset
    if [ -n "$css_hash" ]; then
        curl -sS -I "$TARGET_URL/retailer/assets/$css_hash" > "$EVIDENCE_DIR/assets/css_asset.headers" 2>&1

        local css_status=$(grep -oE "HTTP/[0-9.]+ [0-9]+" "$EVIDENCE_DIR/assets/css_asset.headers" | head -1 | awk '{print $2}')
        if [ "$css_status" == "200" ]; then
            log_pass "css_asset: $css_hash accessible (200)"
        else
            log_fail "css_asset: $css_hash returned $css_status"
        fi
    fi

    # Verify HTML does NOT have immutable (should be short-cache)
    curl -sS -I "$TARGET_URL/retailer/" > "$EVIDENCE_DIR/assets/html_index.headers" 2>&1

    if grep -qi "cache-control:.*immutable" "$EVIDENCE_DIR/assets/html_index.headers" 2>/dev/null; then
        log_fail "html_cache: index.html has 'immutable' (should NOT for HTML)"
    else
        log_pass "html_cache: index.html does not have 'immutable' (correct)"
    fi

    if grep -qi "cache-control:.*no-store\|no-cache\|must-revalidate" "$EVIDENCE_DIR/assets/html_index.headers" 2>/dev/null; then
        log_pass "html_cache: index.html has appropriate cache control"
    else
        log_warn "html_cache: index.html should have no-store/no-cache/must-revalidate"
    fi
}

# =============================================================================
# Section 4: Gateway Routing
# =============================================================================
verify_routing() {
    echo ""
    echo "=============================================="
    echo "4. GATEWAY ROUTING"
    echo "=============================================="

    # All portal routes should return 200 (SPA catch-all)
    local routes=(
        "/"
        "/retailer/"
        "/retailer/login"
        "/retailer/register"
        "/retailer/dashboard"
        "/retailer/catalog"
        "/retailer/ledger"
        "/retailer/payments"
        "/retailer/devices"
        "/retailer/orders"
        "/retailer/settings"
        "/admin/"
        "/supplier/"
    )

    for route in "${routes[@]}"; do
        local name=$(echo "$route" | tr '/' '_' | sed 's/^_//' | sed 's/_$//')
        [ -z "$name" ] && name="root"

        curl -sS -I "$TARGET_URL$route" > "$EVIDENCE_DIR/routing/${name}.headers" 2>&1
        local status=$(grep -oE "HTTP/[0-9.]+ [0-9]+" "$EVIDENCE_DIR/routing/${name}.headers" | head -1 | awk '{print $2}')

        # 200 or 308 (redirect) are acceptable
        if [ "$status" == "200" ] || [ "$status" == "308" ]; then
            log_pass "route_$name: $route → $status"
        else
            log_fail "route_$name: $route → $status (expected 200 or 308)"
        fi
    done

    # Verify API routes don't get stripped incorrectly
    curl -sS "$TARGET_URL/api/v1/health" > "$EVIDENCE_DIR/routing/api_health.body" 2>&1
    if grep -q '"status"' "$EVIDENCE_DIR/routing/api_health.body" 2>/dev/null; then
        log_pass "api_routing: /api/v1/* routes correctly"
    else
        log_fail "api_routing: /api/v1/* may have proxy path stripping issues"
    fi

    # Check for accidental redirects
    local retailer_headers="$EVIDENCE_DIR/routing/retailer_.headers"
    if [ -f "$retailer_headers" ]; then
        if grep -qi "location:.*login" "$retailer_headers" 2>/dev/null; then
            log_warn "retailer_redirect: /retailer/ redirects to login (check if intentional)"
        fi
    fi
}

# =============================================================================
# Section 5: Security Headers
# =============================================================================
verify_security_headers() {
    echo ""
    echo "=============================================="
    echo "5. CSP + SECURITY HEADERS"
    echo "=============================================="

    # Get headers from API endpoint
    curl -sS -I "$TARGET_URL/api/v1/health" > "$EVIDENCE_DIR/security/api_headers.txt" 2>&1
    local api_headers="$EVIDENCE_DIR/security/api_headers.txt"

    # HSTS
    if grep -qi "strict-transport-security:" "$api_headers" 2>/dev/null; then
        log_pass "hsts: Strict-Transport-Security header present"
        grep -i "strict-transport-security:" "$api_headers" >> "$EVIDENCE_DIR/security/hsts.txt"
    else
        log_warn "hsts: Strict-Transport-Security header missing"
    fi

    # X-Content-Type-Options
    if grep -qi "x-content-type-options:.*nosniff" "$api_headers" 2>/dev/null; then
        log_pass "x_content_type: X-Content-Type-Options: nosniff present"
    else
        log_warn "x_content_type: X-Content-Type-Options missing or incorrect"
    fi

    # X-Frame-Options
    if grep -qi "x-frame-options:" "$api_headers" 2>/dev/null; then
        log_pass "x_frame_options: X-Frame-Options header present"
    else
        log_warn "x_frame_options: X-Frame-Options header missing"
    fi

    # X-XSS-Protection (may be 0 as it's deprecated, but should exist)
    if grep -qi "x-xss-protection:" "$api_headers" 2>/dev/null; then
        log_pass "x_xss_protection: X-XSS-Protection header present"
    else
        log_info "x_xss_protection: X-XSS-Protection header not set (may be intentional)"
    fi

    # Content-Security-Policy
    if grep -qi "content-security-policy:" "$api_headers" 2>/dev/null; then
        log_pass "csp: Content-Security-Policy header present"
        grep -i "content-security-policy:" "$api_headers" >> "$EVIDENCE_DIR/security/csp.txt"

        # Check if Firebase domains are allowed (needed for OTP)
        local csp_value=$(grep -i "content-security-policy:" "$api_headers")
        if echo "$csp_value" | grep -qE "googleapis\.com|gstatic\.com|firebaseapp\.com" 2>/dev/null; then
            log_pass "csp_firebase: CSP includes Firebase/Google domains"
        else
            log_warn "csp_firebase: CSP may be missing Firebase/Google domains for OTP"
        fi
    else
        log_warn "csp: Content-Security-Policy header missing"
    fi

    # Referrer-Policy
    if grep -qi "referrer-policy:" "$api_headers" 2>/dev/null; then
        log_pass "referrer_policy: Referrer-Policy header present"
    else
        log_info "referrer_policy: Referrer-Policy header not set"
    fi

    # CORS headers
    if grep -qi "access-control-allow" "$api_headers" 2>/dev/null; then
        log_pass "cors: CORS headers present"
        grep -i "access-control" "$api_headers" >> "$EVIDENCE_DIR/security/cors.txt"
    else
        log_info "cors: CORS headers not present on this endpoint"
    fi
}

# =============================================================================
# Section 6: SSL/TLS Verification
# =============================================================================
verify_ssl() {
    echo ""
    echo "=============================================="
    echo "6. SSL/TLS CERTIFICATE"
    echo "=============================================="

    local domain=$(echo "$TARGET_URL" | sed 's|https://||' | sed 's|/.*||')

    # Check if HTTPS
    if [[ "$TARGET_URL" != https://* ]]; then
        log_warn "ssl: Target URL is not HTTPS"
        return
    fi

    # Get certificate info
    echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates > "$EVIDENCE_DIR/security/ssl_dates.txt" 2>&1

    if [ -f "$EVIDENCE_DIR/security/ssl_dates.txt" ] && [ -s "$EVIDENCE_DIR/security/ssl_dates.txt" ]; then
        local not_after=$(grep "notAfter" "$EVIDENCE_DIR/security/ssl_dates.txt" | cut -d= -f2)
        log_pass "ssl_cert: Valid until $not_after"

        # Check expiry (warn if less than 30 days)
        local expiry_epoch=$(date -d "$not_after" +%s 2>/dev/null || echo "0")
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [ "$days_left" -lt 30 ]; then
            log_warn "ssl_expiry: Certificate expires in $days_left days"
        else
            log_pass "ssl_expiry: Certificate valid for $days_left days"
        fi
    else
        log_fail "ssl_cert: Could not retrieve certificate info"
    fi
}

# =============================================================================
# Generate Summary Report
# =============================================================================
generate_report() {
    echo ""
    echo "=============================================="
    echo "VERIFICATION SUMMARY"
    echo "=============================================="

    local total=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))

    echo ""
    echo -e "  ${GREEN}PASS${NC}: $PASS_COUNT"
    echo -e "  ${RED}FAIL${NC}: $FAIL_COUNT"
    echo -e "  ${YELLOW}WARN${NC}: $WARN_COUNT"
    echo "  ─────────────────"
    echo "  TOTAL: $total"
    echo ""

    # Write summary to file
    cat > "$EVIDENCE_DIR/SUMMARY.md" << EOF
# Deploy Verification Summary

**Target:** $TARGET_URL
**Timestamp:** $TIMESTAMP
**Date:** $(date)

## Results

| Status | Count |
|--------|-------|
| PASS   | $PASS_COUNT |
| FAIL   | $FAIL_COUNT |
| WARN   | $WARN_COUNT |
| **TOTAL** | **$total** |

## Verdict

EOF

    if [ "$FAIL_COUNT" -eq 0 ]; then
        echo "**GO** - All critical checks passed" >> "$EVIDENCE_DIR/SUMMARY.md"
        echo -e "${GREEN}VERDICT: GO${NC} - All critical checks passed"
        echo ""
        echo "Evidence saved to: $EVIDENCE_DIR"
        return 0
    else
        echo "**NO-GO** - $FAIL_COUNT critical checks failed" >> "$EVIDENCE_DIR/SUMMARY.md"
        echo -e "${RED}VERDICT: NO-GO${NC} - $FAIL_COUNT critical checks failed"
        echo ""
        echo "Evidence saved to: $EVIDENCE_DIR"
        echo "Review failed checks above and fix before proceeding."
        return 1
    fi
}

# =============================================================================
# Main Execution
# =============================================================================
main() {
    echo "=============================================="
    echo "SUPERMANDI DEPLOY VERIFICATION"
    echo "=============================================="

    setup_evidence_dir

    verify_health
    verify_api_endpoints
    verify_asset_caching
    verify_routing
    verify_security_headers
    verify_ssl

    generate_report
}

# Run main
main "$@"
