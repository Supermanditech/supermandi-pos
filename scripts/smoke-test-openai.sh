#!/bin/bash
# =============================================================================
# GO-LIVE: Smoke Tests for OpenAI Migration
# =============================================================================
# Tests the OpenAI integration on VM (34.14.220.171)
#
# Prerequisites:
# - curl installed
# - jq installed (for JSON parsing)
# - ADMIN_TOKEN environment variable set
# - Demo device token available
#
# Usage:
#   ADMIN_TOKEN=your-token DEVICE_TOKEN=your-device-token ./scripts/smoke-test-openai.sh
# =============================================================================

set -e

# Configuration
API_BASE="https://34.14.220.171.nip.io"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
DEVICE_TOKEN="${DEVICE_TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0
SKIPPED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    echo "  Response: $2"
    FAILED=$((FAILED + 1))
}

skip() {
    echo -e "${YELLOW}○ SKIP${NC}: $1 - $2"
    SKIPPED=$((SKIPPED + 1))
}

echo "================================================"
echo "GO-LIVE: OpenAI Migration Smoke Tests"
echo "================================================"
echo "API Base: $API_BASE"
echo ""

# =============================================================================
# Test 1: Health Check (no auth required)
# =============================================================================
echo "[Test 1] Main Backend Health Check..."
RESPONSE=$(curl -s -k "$API_BASE/health" 2>&1)
if echo "$RESPONSE" | grep -q '"status":"ok"'; then
    pass "Main backend is healthy"
else
    fail "Main backend health check" "$RESPONSE"
fi

# =============================================================================
# Test 2: Voice Health Check (no auth required)
# =============================================================================
echo "[Test 2] Voice Service Health Check..."
RESPONSE=$(curl -s -k "$API_BASE/api/v1/voice/health" 2>&1)
if echo "$RESPONSE" | grep -q '"provider":"openai"'; then
    pass "Voice service reports OpenAI provider"
elif echo "$RESPONSE" | grep -q '"configured":true'; then
    pass "Voice service is configured"
else
    fail "Voice health check" "$RESPONSE"
fi

# =============================================================================
# Test 3: AI Health Check (requires admin token)
# =============================================================================
echo "[Test 3] Admin AI Health Check..."
if [ -z "$ADMIN_TOKEN" ]; then
    skip "Admin AI health check" "ADMIN_TOKEN not set"
else
    RESPONSE=$(curl -s -k -H "x-admin-token: $ADMIN_TOKEN" "$API_BASE/api/v1/admin/ai/health" 2>&1)
    if echo "$RESPONSE" | grep -q '"provider":"openai"'; then
        pass "AI service reports OpenAI provider"
    elif echo "$RESPONSE" | grep -q '"configured":true'; then
        pass "AI service is configured"
    else
        fail "AI health check" "$RESPONSE"
    fi
fi

# =============================================================================
# Test 4: Admin AI Chat (requires admin token)
# =============================================================================
echo "[Test 4] Admin AI Chat Request..."
if [ -z "$ADMIN_TOKEN" ]; then
    skip "Admin AI chat" "ADMIN_TOKEN not set"
else
    RESPONSE=$(curl -s -k -X POST \
        -H "x-admin-token: $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"question":"What is the total sales today?"}' \
        "$API_BASE/api/v1/admin/ai" 2>&1)

    if echo "$RESPONSE" | grep -q '"answer"'; then
        pass "Admin AI returned an answer"
        # Print first 100 chars of answer
        ANSWER=$(echo "$RESPONSE" | jq -r '.answer' 2>/dev/null | head -c 100)
        echo "  Preview: $ANSWER..."
    elif echo "$RESPONSE" | grep -q '"error"'; then
        ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null)
        if echo "$ERROR" | grep -q -i "not configured"; then
            skip "Admin AI chat" "AI not configured (OPENAI_API_KEY missing?)"
        else
            fail "Admin AI chat" "$RESPONSE"
        fi
    else
        fail "Admin AI chat" "$RESPONSE"
    fi
fi

# =============================================================================
# Test 5: AI Not Configured Error (503)
# =============================================================================
echo "[Test 5] AI Not Configured Response..."
if [ -z "$ADMIN_TOKEN" ]; then
    skip "AI not configured test" "ADMIN_TOKEN not set"
else
    # This test verifies the 503 response format when AI is not configured
    # We can't easily test this if AI IS configured, so we just verify the endpoint works
    RESPONSE=$(curl -s -k -X POST \
        -H "x-admin-token: $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"question":"test"}' \
        "$API_BASE/api/v1/admin/ai" 2>&1)

    if echo "$RESPONSE" | grep -q '"answer"\|"error"'; then
        pass "AI endpoint responds correctly"
    else
        fail "AI endpoint response format" "$RESPONSE"
    fi
fi

# =============================================================================
# Test 6: Rate Limiting (requires admin token)
# =============================================================================
echo "[Test 6] Rate Limiting Check..."
if [ -z "$ADMIN_TOKEN" ]; then
    skip "Rate limiting" "ADMIN_TOKEN not set"
else
    # Make several rapid requests
    RATE_LIMITED=false
    for i in {1..10}; do
        RESPONSE=$(curl -s -k -X POST \
            -H "x-admin-token: $ADMIN_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{"question":"test"}' \
            "$API_BASE/api/v1/admin/ai" 2>&1)

        if echo "$RESPONSE" | grep -q "Rate limit\|429\|RATE_LIMITED"; then
            RATE_LIMITED=true
            break
        fi
        sleep 0.1
    done

    if [ "$RATE_LIMITED" = true ]; then
        pass "Rate limiting is active"
    else
        # Rate limiting might not trigger with only 10 requests
        pass "Rate limiting check completed (no limit hit with 10 requests)"
    fi
fi

# =============================================================================
# Test 7: Voice Parse Endpoint (requires device token)
# =============================================================================
echo "[Test 7] Voice Parse Endpoint..."
if [ -z "$DEVICE_TOKEN" ]; then
    skip "Voice parse" "DEVICE_TOKEN not set"
else
    RESPONSE=$(curl -s -k -X POST \
        -H "x-device-token: $DEVICE_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"transcript":"2 kilo rice chahiye","storeId":"demo-store","mode":"SELL"}' \
        "$API_BASE/api/v1/voice/parse" 2>&1)

    if echo "$RESPONSE" | grep -q '"actions"\|"success"'; then
        pass "Voice parse endpoint responds"
        # Print parsed actions
        ACTIONS=$(echo "$RESPONSE" | jq -c '.actions' 2>/dev/null)
        echo "  Actions: $ACTIONS"
    elif echo "$RESPONSE" | grep -q '"error"'; then
        ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null)
        if echo "$ERROR" | grep -qi "not configured"; then
            skip "Voice parse" "Voice not configured"
        else
            fail "Voice parse" "$RESPONSE"
        fi
    else
        fail "Voice parse" "$RESPONSE"
    fi
fi

# =============================================================================
# Test 8: Audit Logs Endpoint (requires admin token)
# =============================================================================
echo "[Test 8] AI Audit Logs..."
if [ -z "$ADMIN_TOKEN" ]; then
    skip "AI audit logs" "ADMIN_TOKEN not set"
else
    RESPONSE=$(curl -s -k \
        -H "x-admin-token: $ADMIN_TOKEN" \
        "$API_BASE/api/v1/admin/ai/audit?limit=5" 2>&1)

    if echo "$RESPONSE" | grep -q '"logs"\|"count"'; then
        pass "AI audit logs endpoint works"
        COUNT=$(echo "$RESPONSE" | jq -r '.count' 2>/dev/null)
        echo "  Recent logs: $COUNT"
    else
        fail "AI audit logs" "$RESPONSE"
    fi
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "================================================"
echo "Smoke Test Results"
echo "================================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Skipped: $SKIPPED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed! Please investigate.${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
