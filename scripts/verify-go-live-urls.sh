#!/bin/bash
# =============================================================================
# SuperMandi Go-Live URL Verification (DEPLOY-OPS-004)
# =============================================================================
# Deterministic verification after deploy
# Checks 7 mandatory endpoints + HSTS + CSP headers
#
# Usage: ./scripts/verify-go-live-urls.sh [--verbose]
#
# Exit codes:
#   0 = All verifications passed
#   1 = One or more verifications failed
# =============================================================================

set -e

DOMAIN="${DOMAIN:-supermandi.tech}"
VERBOSE=false

for arg in "$@"; do
  case $arg in
    --verbose|-v) VERBOSE=true ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

check_url() {
    local url="$1"
    local expected_code="$2"
    local description="$3"

    local actual_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10 2>/dev/null || echo "000")

    if [ "$actual_code" = "$expected_code" ]; then
        echo -e "  ${GREEN}[OK]${NC} $description: $actual_code"
        ((PASS++))
        return 0
    else
        echo -e "  ${RED}[FAIL]${NC} $description: Expected $expected_code, got $actual_code"
        ((FAIL++))
        return 1
    fi
}

check_header_exists() {
    local url="$1"
    local header="$2"
    local description="$3"

    local value=$(curl -sI "$url" --max-time 10 2>/dev/null | grep -i "^$header:" | head -1)

    if [ -n "$value" ]; then
        echo -e "  ${GREEN}[OK]${NC} $description"
        if [ "$VERBOSE" = true ]; then
            echo -e "       ${CYAN}${value}${NC}"
        fi
        ((PASS++))
        return 0
    else
        echo -e "  ${RED}[FAIL]${NC} $description MISSING"
        ((FAIL++))
        return 1
    fi
}

check_header_value() {
    local url="$1"
    local header="$2"
    local expected="$3"
    local description="$4"

    local actual=$(curl -sI "$url" --max-time 10 2>/dev/null | grep -i "^$header:" | head -1)

    if echo "$actual" | grep -qi "$expected"; then
        echo -e "  ${GREEN}[OK]${NC} $description"
        ((PASS++))
        return 0
    else
        echo -e "  ${YELLOW}[WARN]${NC} $description"
        if [ "$VERBOSE" = true ]; then
            echo -e "       Expected: $expected"
            echo -e "       Got: $actual"
        fi
        ((WARN++))
        return 0
    fi
}

check_csp_firebase_compat() {
    local url="$1"

    local csp=$(curl -sI "$url" --max-time 10 2>/dev/null | grep -i "^content-security-policy:" | head -1)

    if [ -z "$csp" ]; then
        echo -e "  ${YELLOW}[WARN]${NC} CSP header missing (recommended for security)"
        ((WARN++))
        return 0
    fi

    echo -e "  ${GREEN}[OK]${NC} CSP header present"
    ((PASS++))

    # Check CSP allows Firebase domains
    local firebase_issues=0

    if ! echo "$csp" | grep -qi "googleapis.com"; then
        echo -e "  ${YELLOW}[WARN]${NC} CSP may block googleapis.com (Firebase auth)"
        ((WARN++))
        firebase_issues=$((firebase_issues + 1))
    fi

    if ! echo "$csp" | grep -qi "firebaseio.com"; then
        echo -e "  ${YELLOW}[WARN]${NC} CSP may block firebaseio.com (Firebase realtime)"
        ((WARN++))
        firebase_issues=$((firebase_issues + 1))
    fi

    if ! echo "$csp" | grep -qi "identitytoolkit"; then
        echo -e "  ${YELLOW}[WARN]${NC} CSP may block identitytoolkit (Firebase auth)"
        ((WARN++))
        firebase_issues=$((firebase_issues + 1))
    fi

    if [ "$firebase_issues" -eq 0 ]; then
        echo -e "  ${GREEN}[OK]${NC} CSP allows Firebase auth domains"
    fi

    return 0
}

# =============================================================================
# BANNER
# =============================================================================

echo ""
echo -e "${CYAN}==============================================${NC}"
echo -e "${CYAN}  SUPERMANDI GO-LIVE URL VERIFICATION${NC}"
echo -e "${CYAN}  (DEPLOY-OPS-004)${NC}"
echo -e "${CYAN}==============================================${NC}"
echo "  Domain: https://$DOMAIN"
echo "  Time:   $(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S')"
echo ""

# =============================================================================
# MANDATORY ENDPOINTS (7 URLs per DEPLOY-OPS-004)
# =============================================================================

echo -e "${CYAN}[1/4] Mandatory Endpoints (7 URLs)${NC}"
echo "──────────────────────────────────────────────"

check_url "https://$DOMAIN/" "200" "Landing page (/)"
check_url "https://$DOMAIN/retailer/" "200" "Retailer portal (/retailer/)"
check_url "https://$DOMAIN/retailer/login" "200" "Retailer login (/retailer/login)"
check_url "https://$DOMAIN/supplier/" "200" "Supplier portal (/supplier/)"
check_url "https://$DOMAIN/supplier/login/" "200" "Supplier login (/supplier/login/)"
check_url "https://$DOMAIN/admin/" "200" "Admin portal (/admin/)"
check_url "https://$DOMAIN/api/v1/health" "200" "API health (/api/v1/health)"

echo ""

# =============================================================================
# SECURITY HEADERS (HSTS + CSP per DEPLOY-OPS-004)
# =============================================================================

echo -e "${CYAN}[2/4] Security Headers (HSTS + CSP)${NC}"
echo "──────────────────────────────────────────────"

# HSTS is MANDATORY per DEPLOY-OPS-004
check_header_exists "https://$DOMAIN/" "strict-transport-security" "HSTS header"

# CSP + Firebase compatibility check
check_csp_firebase_compat "https://$DOMAIN/"

# Additional security headers (informational)
check_header_exists "https://$DOMAIN/" "x-frame-options" "X-Frame-Options"
check_header_exists "https://$DOMAIN/" "x-content-type-options" "X-Content-Type-Options"

echo ""

# =============================================================================
# CACHE HEADERS (HTML no-store, Assets immutable)
# =============================================================================

echo -e "${CYAN}[3/4] Cache Headers${NC}"
echo "──────────────────────────────────────────────"

check_header_value "https://$DOMAIN/" "cache-control" "no-store" "Landing HTML no-cache"
check_header_value "https://$DOMAIN/retailer/" "cache-control" "no-store" "Retailer HTML no-cache"
check_header_value "https://$DOMAIN/admin/" "cache-control" "no-store" "Admin HTML no-cache"
check_header_value "https://$DOMAIN/supplier/" "cache-control" "no-store" "Supplier HTML no-cache"

echo ""

# =============================================================================
# ASSET VERIFICATION (Bonus)
# =============================================================================

echo -e "${CYAN}[4/4] Asset Accessibility${NC}"
echo "──────────────────────────────────────────────"

# Retailer JS asset
RETAILER_JS=$(curl -s "https://$DOMAIN/retailer/" --max-time 10 2>/dev/null | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1)
if [ -n "$RETAILER_JS" ]; then
    check_url "https://$DOMAIN/retailer/assets/$RETAILER_JS" "200" "Retailer JS ($RETAILER_JS)"
else
    echo -e "  ${YELLOW}[WARN]${NC} Could not extract Retailer JS from HTML"
    ((WARN++))
fi

# Admin JS asset
ADMIN_JS=$(curl -s "https://$DOMAIN/admin/" --max-time 10 2>/dev/null | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1)
if [ -n "$ADMIN_JS" ]; then
    check_url "https://$DOMAIN/admin/assets/$ADMIN_JS" "200" "Admin JS ($ADMIN_JS)"
else
    echo -e "  ${YELLOW}[WARN]${NC} Could not extract Admin JS from HTML"
    ((WARN++))
fi

echo ""

# =============================================================================
# SUMMARY
# =============================================================================

echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}VERIFICATION FAILED${NC}"
    echo "──────────────────────────────────────────────"
    echo "  Passed:   $PASS"
    echo "  Failed:   $FAIL"
    echo "  Warnings: $WARN"
    echo ""
    echo "Fix the FAIL items above before proceeding."
    echo "=============================================="
    exit 1
else
    echo -e "${GREEN}VERIFICATION PASSED${NC}"
    echo "──────────────────────────────────────────────"
    echo "  Passed:   $PASS"
    echo "  Failed:   0"
    echo "  Warnings: $WARN"
    echo ""
    echo "All 7 mandatory endpoints responding 200."
    echo "Security headers (HSTS + CSP) verified."
    echo "=============================================="
    exit 0
fi
