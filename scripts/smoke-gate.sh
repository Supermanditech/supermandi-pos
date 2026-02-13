#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SuperMandi Smoke Gate Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# Standalone smoke gate for verifying all portals are healthy.
# Can be run independently or called by deploy-atomic.sh
#
# Usage:
#   ./smoke-gate.sh                    Run smoke gate against production
#   ./smoke-gate.sh --json             Output results as JSON
#   ./smoke-gate.sh --base URL         Test against specific base URL
#   ./smoke-gate.sh --verify-tag TAG   Verify portals have expected tag deployed
#   ./smoke-gate.sh --verify-sha SHA   Verify portals have expected SHA deployed
#   DOMAIN=staging.supermandi.tech ./smoke-gate.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Configuration
DOMAIN="${DOMAIN:-supermandi.tech}"
GATEWAY="${GATEWAY:-http://127.0.0.1:3000}"
BASE_URL="https://$DOMAIN"
JSON_OUTPUT=false
LOG_FILE="${LOG_FILE:-/var/log/supermandi/smoke-gate.log}"
VERIFY_TAG=""
VERIFY_SHA=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --base)
            BASE_URL="$2"
            shift 2
            ;;
        --verify-tag)
            VERIFY_TAG="$2"
            shift 2
            ;;
        --verify-sha)
            VERIFY_SHA="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors (disabled for JSON mode)
if [ "$JSON_OUTPUT" = false ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

TIMESTAMP=$(TZ='Asia/Kolkata' date '+%Y-%m-%d %H:%M:%S IST')
FAILED=0
RESULTS=()

# =============================================================================
# CHECK FUNCTIONS
# =============================================================================

check_endpoint() {
    local name="$1"
    local url="$2"
    local expected="${3:-200}"

    local status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$url" 2>/dev/null || echo "000")

    if [ "$status" = "$expected" ]; then
        RESULTS+=("{\"name\":\"$name\",\"url\":\"$url\",\"status\":$status,\"pass\":true}")
        return 0
    else
        RESULTS+=("{\"name\":\"$name\",\"url\":\"$url\",\"status\":$status,\"expected\":$expected,\"pass\":false}")
        return 1
    fi
}

check_cache_headers() {
    local name="$1"
    local url="$2"

    local headers=$(curl -sI --max-time 15 "$url" 2>/dev/null)
    local cache_control=$(echo "$headers" | grep -i "cache-control" | head -1 | tr -d '\r')

    if echo "$cache_control" | grep -qi "no-store\|no-cache"; then
        RESULTS+=("{\"name\":\"$name cache\",\"header\":\"$cache_control\",\"pass\":true}")
        return 0
    else
        RESULTS+=("{\"name\":\"$name cache\",\"header\":\"$cache_control\",\"pass\":false}")
        return 1
    fi
}

check_body_contains() {
    local name="$1"
    local url="$2"
    local pattern="$3"

    local body=$(curl -sS --max-time 15 "$url" 2>/dev/null || echo "")

    if echo "$body" | grep -q "$pattern"; then
        RESULTS+=("{\"name\":\"$name body\",\"pattern\":\"$pattern\",\"pass\":true}")
        return 0
    else
        RESULTS+=("{\"name\":\"$name body\",\"pattern\":\"$pattern\",\"pass\":false}")
        return 1
    fi
}

check_file_exists() {
    local name="$1"
    local path="$2"

    if [ -f "$path" ] || ([ -L "$(dirname "$path")" ] && [ -f "$path" ]); then
        RESULTS+=("{\"name\":\"$name\",\"path\":\"$path\",\"pass\":true}")
        return 0
    else
        RESULTS+=("{\"name\":\"$name\",\"path\":\"$path\",\"pass\":false}")
        return 1
    fi
}

check_nginx_config() {
    if sudo nginx -t 2>&1 | grep -q "successful"; then
        RESULTS+=("{\"name\":\"nginx config\",\"pass\":true}")
        return 0
    else
        RESULTS+=("{\"name\":\"nginx config\",\"pass\":false}")
        return 1
    fi
}

check_version_fingerprint() {
    local name="$1"
    local url="$2"
    local expected_tag="${3:-}"
    local expected_sha="${4:-}"

    local version_content=$(curl -sS --max-time 15 "$url" 2>/dev/null || echo "")

    # Check if version.txt exists and is not empty
    if [ -z "$version_content" ] || echo "$version_content" | grep -qi "404\|not found"; then
        RESULTS+=("{\"name\":\"$name version\",\"url\":\"$url\",\"pass\":false,\"reason\":\"not found\"}")
        return 1
    fi

    # Extract tag and sha from version.txt
    local deployed_tag=$(echo "$version_content" | grep "^tag=" | cut -d= -f2)
    local deployed_sha=$(echo "$version_content" | grep "^sha=" | cut -d= -f2)

    # If expected tag/sha provided, verify they match
    if [ -n "$expected_tag" ] && [ "$deployed_tag" != "$expected_tag" ]; then
        RESULTS+=("{\"name\":\"$name version\",\"expected_tag\":\"$expected_tag\",\"deployed_tag\":\"$deployed_tag\",\"pass\":false}")
        return 1
    fi

    if [ -n "$expected_sha" ] && [ "$deployed_sha" != "$expected_sha" ]; then
        RESULTS+=("{\"name\":\"$name version\",\"expected_sha\":\"$expected_sha\",\"deployed_sha\":\"$deployed_sha\",\"pass\":false}")
        return 1
    fi

    RESULTS+=("{\"name\":\"$name version\",\"tag\":\"$deployed_tag\",\"sha\":\"$deployed_sha\",\"pass\":true}")
    return 0
}

# =============================================================================
# MAIN CHECKS
# =============================================================================

if [ "$JSON_OUTPUT" = false ]; then
    echo ""
    echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}${BOLD}SUPERMANDI SMOKE GATE${NC}"
    echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Time:   $TIMESTAMP"
    echo "Domain: $DOMAIN"
    echo "Base:   $BASE_URL"
    [ -n "$VERIFY_TAG" ] && echo "Verify: tag=$VERIFY_TAG"
    [ -n "$VERIFY_SHA" ] && echo "Verify: sha=$VERIFY_SHA"
    echo ""
fi

# -----------------------------------------------------------------------------
# ENDPOINT CHECKS
# -----------------------------------------------------------------------------

if [ "$JSON_OUTPUT" = false ]; then
    echo "Endpoint Status Checks:"
    echo "────────────────────────────────────────"
fi

# Gateway health
if check_endpoint "Gateway /health" "$GATEWAY/health" 200; then
    [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}200 OK${NC}\n" "Gateway /health:"
else
    [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}FAIL${NC}\n" "Gateway /health:"
    FAILED=1
fi

# Gateway body check
if check_body_contains "Gateway" "$GATEWAY/health" '"status":"ok"'; then
    [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ {\"status\":\"ok\"}${NC}\n" "Gateway body:"
else
    [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}✗ missing${NC}\n" "Gateway body:"
    FAILED=1
fi

# Portal main pages
for portal in retailer admin supplier; do
    if check_endpoint "/$portal/" "$BASE_URL/$portal/" 200; then
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}200 OK${NC}\n" "/$portal/:"
    else
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}FAIL${NC}\n" "/$portal/:"
        FAILED=1
    fi
done

# Login pages (may redirect, so allow 200 or 3xx)
for portal in retailer supplier; do
    login_url="$BASE_URL/$portal/login"
    [ "$portal" = "supplier" ] && login_url="$BASE_URL/$portal/login/"

    status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$login_url" 2>/dev/null || echo "000")
    if [ "$status" = "200" ] || [[ "$status" =~ ^3 ]]; then
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}$status OK${NC}\n" "/$portal/login:"
    else
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${YELLOW}$status (check manually)${NC}\n" "/$portal/login:"
    fi
done

# -----------------------------------------------------------------------------
# CACHE HEADER CHECKS
# -----------------------------------------------------------------------------

if [ "$JSON_OUTPUT" = false ]; then
    echo ""
    echo "Cache Header Checks:"
    echo "────────────────────────────────────────"
fi

for portal in retailer admin supplier; do
    if check_cache_headers "$portal" "$BASE_URL/$portal/"; then
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ no-cache${NC}\n" "/$portal/:"
    else
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}✗ missing no-cache${NC}\n" "/$portal/:"
        FAILED=1
    fi
done

# -----------------------------------------------------------------------------
# CONTENT TYPE CHECKS
# -----------------------------------------------------------------------------

if [ "$JSON_OUTPUT" = false ]; then
    echo ""
    echo "Content-Type Checks:"
    echo "────────────────────────────────────────"
fi

for portal in retailer admin supplier; do
    headers=$(curl -sI --max-time 15 "$BASE_URL/$portal/" 2>/dev/null)
    content_type=$(echo "$headers" | grep -i "content-type" | head -1)

    if echo "$content_type" | grep -qi "text/html"; then
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ text/html${NC}\n" "/$portal/:"
    else
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}✗ not text/html${NC}\n" "/$portal/:"
        FAILED=1
    fi
done

# -----------------------------------------------------------------------------
# INFRASTRUCTURE CHECKS
# -----------------------------------------------------------------------------

if [ "$JSON_OUTPUT" = false ]; then
    echo ""
    echo "Infrastructure Checks:"
    echo "────────────────────────────────────────"
fi

# Nginx config
if check_nginx_config; then
    [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ valid${NC}\n" "nginx -t:"
else
    [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}✗ invalid${NC}\n" "nginx -t:"
    FAILED=1
fi

# File existence (only check if running on VM)
for portal in retailer admin; do
    path="/var/www/$portal/index.html"
    if [ -e "/var/www" ]; then
        if check_file_exists "$portal/index.html" "$path"; then
            [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ exists${NC}\n" "$portal/index.html:"
        else
            [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}✗ missing${NC}\n" "$portal/index.html:"
            FAILED=1
        fi
    fi
done

# PM2 check (only if PM2 is available)
if command -v pm2 &> /dev/null || [ -n "$(which pm2 2>/dev/null)" ]; then
    if sudo -u supermanditech pm2 list 2>/dev/null | grep -q "supplier-portal.*online"; then
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ online${NC}\n" "PM2 supplier-portal:"
    else
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${YELLOW}⚠ check manually${NC}\n" "PM2 supplier-portal:"
    fi
fi

# -----------------------------------------------------------------------------
# VERSION FINGERPRINT CHECKS
# -----------------------------------------------------------------------------

if [ "$JSON_OUTPUT" = false ]; then
    echo ""
    echo "Version Fingerprint Checks:"
    echo "────────────────────────────────────────"
fi

for portal in retailer admin supplier; do
    version_url="$BASE_URL/$portal/version.txt"

    version_content=$(curl -sS --max-time 15 "$version_url" 2>/dev/null || echo "")

    if [ -z "$version_content" ] || echo "$version_content" | grep -qi "404\|not found\|<!DOCTYPE"; then
        [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${YELLOW}⚠ not found (deploy needed)${NC}\n" "/$portal/version.txt:"
    else
        deployed_tag=$(echo "$version_content" | grep "^tag=" | cut -d= -f2)
        deployed_sha=$(echo "$version_content" | grep "^sha=" | cut -d= -f2)

        # Verify tag if specified
        if [ -n "$VERIFY_TAG" ]; then
            if [ "$deployed_tag" = "$VERIFY_TAG" ]; then
                [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ $deployed_tag ($deployed_sha)${NC}\n" "/$portal/version.txt:"
            else
                [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}✗ expected $VERIFY_TAG, got $deployed_tag${NC}\n" "/$portal/version.txt:"
                FAILED=1
            fi
        # Verify SHA if specified
        elif [ -n "$VERIFY_SHA" ]; then
            if [ "$deployed_sha" = "$VERIFY_SHA" ]; then
                [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ $deployed_tag ($deployed_sha)${NC}\n" "/$portal/version.txt:"
            else
                [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${RED}✗ expected SHA $VERIFY_SHA, got $deployed_sha${NC}\n" "/$portal/version.txt:"
                FAILED=1
            fi
        else
            # Just display what's deployed
            [ "$JSON_OUTPUT" = false ] && printf "  %-30s ${GREEN}✓ $deployed_tag ($deployed_sha)${NC}\n" "/$portal/version.txt:"
        fi

        RESULTS+=("{\"name\":\"$portal version\",\"tag\":\"$deployed_tag\",\"sha\":\"$deployed_sha\",\"pass\":true}")
    fi
done

# =============================================================================
# OUTPUT RESULTS
# =============================================================================

if [ "$JSON_OUTPUT" = true ]; then
    # JSON output
    echo "{"
    echo "  \"timestamp\": \"$TIMESTAMP\","
    echo "  \"domain\": \"$DOMAIN\","
    echo "  \"base_url\": \"$BASE_URL\","
    echo "  \"gateway\": \"$GATEWAY\","
    echo "  \"passed\": $([ $FAILED -eq 0 ] && echo 'true' || echo 'false'),"
    echo "  \"checks\": ["
    for i in "${!RESULTS[@]}"; do
        echo -n "    ${RESULTS[$i]}"
        [ $i -lt $((${#RESULTS[@]} - 1)) ] && echo "," || echo ""
    done
    echo "  ]"
    echo "}"
else
    echo ""

    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}${BOLD}SMOKE GATE: ✅ PASSED${NC}"
        echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "Copy/paste for notebook:"
        echo "────────────────────────────────────────"
        cat << EOF
Smoke Gate - $TIMESTAMP
  Gateway /health:    200 OK, {"status":"ok"}
  /retailer/:         200 OK, Cache-Control: no-store
  /admin/:            200 OK, Cache-Control: no-store
  /supplier/:         200 OK, Cache-Control: no-store
  nginx -t:           OK
  Result: ✅ PASSED
EOF
        echo ""
    else
        echo -e "${RED}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}${BOLD}SMOKE GATE: ❌ FAILED${NC}"
        echo -e "${RED}${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo -e "${RED}One or more checks failed. Review the output above.${NC}"
        echo ""
    fi

    # Log to file if writable
    if [ -w "$(dirname "$LOG_FILE")" ] 2>/dev/null; then
        echo "[$TIMESTAMP] SMOKE GATE $([ $FAILED -eq 0 ] && echo 'PASSED' || echo 'FAILED')" >> "$LOG_FILE"
    fi
fi

exit $FAILED
