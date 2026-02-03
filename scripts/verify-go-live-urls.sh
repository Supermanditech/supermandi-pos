#!/bin/bash
# GO-LIVE-URL-AUDIT-001: Comprehensive URL verification script
# Run this to verify all go-live URL requirements

echo "=========================================="
echo "GO-LIVE URL Audit Verification"
echo "Date: $(date)"
echo "=========================================="

DOMAIN="https://supermandi.tech"
PASS=0
FAIL=0

# Helper function
check_url() {
    local url="$1"
    local expected_code="$2"
    local description="$3"

    local actual_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")

    if [ "$actual_code" = "$expected_code" ]; then
        echo -e "  ✅ $description: $actual_code"
        ((PASS++))
    else
        echo -e "  ❌ $description: $actual_code (expected $expected_code)"
        ((FAIL++))
    fi
}

check_header() {
    local url="$1"
    local header="$2"
    local expected="$3"
    local description="$4"

    local actual=$(curl -s -I "$url" 2>/dev/null | grep -i "^$header:" | head -1)

    if echo "$actual" | grep -qi "$expected"; then
        echo -e "  ✅ $description"
        ((PASS++))
    else
        echo -e "  ❌ $description"
        echo "      Expected: $expected"
        echo "      Got: $actual"
        ((FAIL++))
    fi
}

check_no_redirect() {
    local url="$1"
    local description="$2"

    local response=$(curl -s -I "$url" 2>/dev/null | head -1)

    if echo "$response" | grep -q "200 OK"; then
        echo -e "  ✅ $description: 200 OK (no redirect)"
        ((PASS++))
    elif echo "$response" | grep -qE "30[0-9]"; then
        local redirect_code=$(echo "$response" | grep -oE "30[0-9]")
        echo -e "  ❌ $description: Redirects with $redirect_code"
        ((FAIL++))
    else
        echo -e "  ❌ $description: Unexpected response"
        ((FAIL++))
    fi
}

echo -e "\n=== 1. ROOT LANDING PAGE ==="
check_no_redirect "$DOMAIN/" "Root URL no redirect"
check_header "$DOMAIN/" "cache-control" "no-store" "Root HTML no-store"

echo -e "\n=== 2. RETAILER PORTAL ==="
check_url "$DOMAIN/retailer/" "200" "Retailer home"
check_url "$DOMAIN/retailer/login" "200" "Retailer login"
check_url "$DOMAIN/retailer/register" "200" "Retailer register"
check_url "$DOMAIN/retailer/dashboard" "200" "Retailer dashboard"
check_header "$DOMAIN/retailer/" "cache-control" "no-store" "Retailer HTML no-store"

echo -e "\n=== 3. RETAILER ASSETS ==="
# Find actual asset file
RETAILER_ASSET=$(curl -s "$DOMAIN/retailer/" 2>/dev/null | grep -oE 'assets/index-[^"]+\.js' | head -1)
if [ -n "$RETAILER_ASSET" ]; then
    check_url "$DOMAIN/retailer/$RETAILER_ASSET" "200" "Retailer JS asset"
    check_header "$DOMAIN/retailer/$RETAILER_ASSET" "cache-control" "immutable" "Retailer asset immutable"
else
    echo "  ⚠️ Could not find retailer asset in HTML"
fi

echo -e "\n=== 4. ADMIN PORTAL ==="
check_url "$DOMAIN/admin/" "200" "Admin home"
check_url "$DOMAIN/admin/login" "200" "Admin login"
check_url "$DOMAIN/admin/dashboard" "200" "Admin dashboard"
check_header "$DOMAIN/admin/" "cache-control" "no-store" "Admin HTML no-store"

echo -e "\n=== 5. ADMIN ASSETS ==="
ADMIN_ASSET=$(curl -s "$DOMAIN/admin/" 2>/dev/null | grep -oE 'assets/index-[^"]+\.js' | head -1)
if [ -n "$ADMIN_ASSET" ]; then
    check_url "$DOMAIN/admin/$ADMIN_ASSET" "200" "Admin JS asset"
    check_header "$DOMAIN/admin/$ADMIN_ASSET" "cache-control" "immutable" "Admin asset immutable"
else
    echo "  ⚠️ Could not find admin asset in HTML"
fi

echo -e "\n=== 6. SUPPLIER PORTAL (with trailing slash) ==="
check_url "$DOMAIN/supplier/" "200" "Supplier home (trailing slash)"
check_url "$DOMAIN/supplier/login/" "200" "Supplier login (trailing slash)"
check_url "$DOMAIN/supplier/register/" "200" "Supplier register (trailing slash)"
check_header "$DOMAIN/supplier/" "cache-control" "no-store" "Supplier HTML no-store"

echo -e "\n=== 7. SUPPLIER CANONICALIZATION (without trailing slash) ==="
# These should NOT return 308 redirect
echo "  Testing /supplier/login (should not 308)..."
RESPONSE=$(curl -s -I "$DOMAIN/supplier/login" 2>/dev/null | head -1)
if echo "$RESPONSE" | grep -q "308"; then
    echo -e "  ❌ /supplier/login returns 308 redirect"
    ((FAIL++))
elif echo "$RESPONSE" | grep -q "200"; then
    echo -e "  ✅ /supplier/login returns 200 directly"
    ((PASS++))
else
    # Check if it's a different redirect that leads to 200
    FINAL=$(curl -s -o /dev/null -w "%{http_code}" -L "$DOMAIN/supplier/login")
    if [ "$FINAL" = "200" ]; then
        echo -e "  ⚠️ /supplier/login redirects but lands on 200"
    else
        echo -e "  ❌ /supplier/login unexpected response"
        ((FAIL++))
    fi
fi

echo "  Testing /supplier/register (should not 308)..."
RESPONSE=$(curl -s -I "$DOMAIN/supplier/register" 2>/dev/null | head -1)
if echo "$RESPONSE" | grep -q "308"; then
    echo -e "  ❌ /supplier/register returns 308 redirect"
    ((FAIL++))
elif echo "$RESPONSE" | grep -q "200"; then
    echo -e "  ✅ /supplier/register returns 200 directly"
    ((PASS++))
else
    FINAL=$(curl -s -o /dev/null -w "%{http_code}" -L "$DOMAIN/supplier/register")
    if [ "$FINAL" = "200" ]; then
        echo -e "  ⚠️ /supplier/register redirects but lands on 200"
    else
        echo -e "  ❌ /supplier/register unexpected response"
        ((FAIL++))
    fi
fi

echo -e "\n=== 8. SUPPLIER ASSETS ==="
# Check supplier Next.js static assets
check_header "$DOMAIN/supplier/_next/static/chunks/main-app-ef1b14ff06b3e3ae.js" "cache-control" "immutable" "Supplier Next.js asset immutable"

echo -e "\n=== 9. API HEALTH ==="
check_url "$DOMAIN/api/v1/health" "200" "API health endpoint"
check_header "$DOMAIN/api/v1/health" "cache-control" "no-store" "API no-store"

echo -e "\n=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "Passed: $PASS"
echo -e "Failed: $FAIL"

if [ $FAIL -eq 0 ]; then
    echo -e "\n✅ ALL CHECKS PASSED - GO LIVE READY!"
    exit 0
else
    echo -e "\n❌ $FAIL checks failed - FIX REQUIRED"
    exit 1
fi
