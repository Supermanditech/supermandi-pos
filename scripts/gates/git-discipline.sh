#!/usr/bin/env bash
# =============================================================================
# ZRP Category A: Git & Ticket Discipline Gate
# Gates: ZRP-A-001 through ZRP-A-012
# Runs on PR events only. 100% pass required.
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0
RESULTS=""

gate_pass() { PASS=$((PASS + 1)); RESULTS="${RESULTS}\n| $1 | $2 | PASS | — |"; echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); RESULTS="${RESULTS}\n| $1 | $2 | FAIL | $3 |"; echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); RESULTS="${RESULTS}\n| $1 | $2 | WARN | $3 |"; echo "  WARN: $1 — $2: $3"; }
gate_skip() { RESULTS="${RESULTS}\n| $1 | $2 | SKIP | $3 |"; echo "  SKIP: $1 — $2: $3"; }

echo "=== ZRP Category A: Git & Ticket Discipline ==="
echo ""

# Determine context: PR or push
IS_PR="${IS_PR:-false}"
PR_TITLE="${PR_TITLE:-}"
PR_BODY="${PR_BODY:-}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')}"
BASE_REF="${BASE_REF:-main}"

# =============================================================================
# ZRP-A-001: Branch naming convention
# =============================================================================
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "unknown" ]; then
  gate_skip "ZRP-A-001" "Branch naming" "On main or unknown branch"
else
  if echo "$BRANCH" | grep -qE '^(feat|fix|reg|chore|test|docs|hotfix)/[A-Za-z0-9]'; then
    gate_pass "ZRP-A-001" "Branch naming"
  else
    gate_fail "ZRP-A-001" "Branch naming" "Branch '$BRANCH' does not match pattern: (feat|fix|reg|chore|test|docs|hotfix)/<id>"
  fi
fi

# =============================================================================
# ZRP-A-002: PR title contains ticket ID
# =============================================================================
if [ "$IS_PR" = "true" ] && [ -n "$PR_TITLE" ]; then
  if echo "$PR_TITLE" | grep -qiE '(feat|fix|chore|test|docs|reg|hotfix|ZRP|STAGE|INFRA|BUG|SA-)\(?[A-Z0-9-]*\)?:'; then
    gate_pass "ZRP-A-002" "PR title format"
  else
    gate_fail "ZRP-A-002" "PR title format" "PR title must contain ticket/type prefix (e.g., fix(STAGE-025):)"
  fi
else
  gate_skip "ZRP-A-002" "PR title format" "Not a PR event or no title"
fi

# =============================================================================
# ZRP-A-003: Commit message semantic format
# =============================================================================
BAD_COMMITS=0
while IFS= read -r msg; do
  [ -z "$msg" ] && continue
  if ! echo "$msg" | grep -qE '^(chore|fix|feat|test|docs|refactor|perf|ci|build|style|revert)\('; then
    # Allow merge commits and version bumps
    if ! echo "$msg" | grep -qE '^(Merge |v[0-9]|Revert )'; then
      BAD_COMMITS=$((BAD_COMMITS + 1))
    fi
  fi
done <<< "$(git log --format=%s "${BASE_REF}..HEAD" 2>/dev/null || echo '')"

if [ "$BAD_COMMITS" -eq 0 ]; then
  gate_pass "ZRP-A-003" "Commit message format"
else
  gate_warn "ZRP-A-003" "Commit message format" "$BAD_COMMITS commit(s) without semantic prefix"
fi

# =============================================================================
# ZRP-A-008: PR description non-empty
# =============================================================================
if [ "$IS_PR" = "true" ]; then
  BODY_LEN=${#PR_BODY}
  if [ "$BODY_LEN" -gt 20 ]; then
    gate_pass "ZRP-A-008" "PR description"
  else
    gate_warn "ZRP-A-008" "PR description" "PR body is too short ($BODY_LEN chars, need >20)"
  fi
else
  gate_skip "ZRP-A-008" "PR description" "Not a PR event"
fi

# =============================================================================
# ZRP-A-009: No WIP/TODO/FIXME/HACK markers in committed code
# =============================================================================
WIP_COUNT=0
WIP_FILES=""
DIFF_OUTPUT=$(git diff --name-only "${BASE_REF}..HEAD" -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null || echo "")
if [ -n "$DIFF_OUTPUT" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    # Search for markers (exclude comments with ticket IDs like // TODO(STAGE-025))
    MATCHES=$(grep -nE '\b(TODO|FIXME|HACK|XXX)\b' "$file" 2>/dev/null | grep -cvE '(TODO\([A-Z]+-[A-Z0-9]|FIXME\([A-Z]+-[A-Z0-9])' 2>/dev/null || echo "0")
    if [ "$MATCHES" -gt 0 ]; then
      WIP_COUNT=$((WIP_COUNT + MATCHES))
      WIP_FILES="${WIP_FILES}  ${file} (${MATCHES} markers)\n"
    fi
  done <<< "$DIFF_OUTPUT"
fi

if [ "$WIP_COUNT" -eq 0 ]; then
  gate_pass "ZRP-A-009" "No WIP markers"
else
  gate_warn "ZRP-A-009" "No WIP markers" "$WIP_COUNT unticketted TODO/FIXME/HACK markers found"
fi

# =============================================================================
# ZRP-A-010: No test.only() / test.skip() / describe.only()
# =============================================================================
ONLY_SKIP_COUNT=0
if [ -n "$DIFF_OUTPUT" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    if echo "$file" | grep -qE '\.(test|spec)\.(ts|tsx|js|jsx)$'; then
      MATCHES=$(grep -cE '\b(test|it|describe)\.(only|skip)\b' "$file" 2>/dev/null || echo "0")
      ONLY_SKIP_COUNT=$((ONLY_SKIP_COUNT + MATCHES))
    fi
  done <<< "$DIFF_OUTPUT"
fi

if [ "$ONLY_SKIP_COUNT" -eq 0 ]; then
  gate_pass "ZRP-A-010" "No test.only/skip"
else
  gate_fail "ZRP-A-010" "No test.only/skip" "$ONLY_SKIP_COUNT occurrences of test.only()/test.skip()/describe.only() found"
fi

# =============================================================================
# ZRP-A-011: No .env files committed
# =============================================================================
ENV_FILES=$(git diff --name-only "${BASE_REF}..HEAD" 2>/dev/null | grep -E '\.env$|\.env\.local$|\.env\.production$|\.env\.staging$' | grep -v '\.env\.example' || echo "")
if [ -z "$ENV_FILES" ]; then
  gate_pass "ZRP-A-011" "No .env files"
else
  gate_fail "ZRP-A-011" "No .env files" "Environment files committed: $(echo "$ENV_FILES" | tr '\n' ', ')"
fi

# =============================================================================
# ZRP-A-012: No console.log in production code (ported from zero-regression-check.ps1)
# Only checks files changed in this PR, not entire codebase
# =============================================================================
CONSOLE_COUNT=0
if [ -n "$DIFF_OUTPUT" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    # Skip test/spec/config files
    if echo "$file" | grep -qE '(test|spec|__tests__|__mocks__|\.config\.|vite\.config|jest\.config|playwright)'; then continue; fi
    # Skip non-runtime directories
    if echo "$file" | grep -qE '^(docs/|scripts/|e2e-tests/|RELEASES/)'; then continue; fi
    # Count console.log/debug/info (excluding commented lines)
    MATCHES=$(grep -nE 'console\.(log|debug|info)\(' "$file" 2>/dev/null | grep -cv '^\s*//' 2>/dev/null || echo "0")
    CONSOLE_COUNT=$((CONSOLE_COUNT + MATCHES))
  done <<< "$DIFF_OUTPUT"
fi

if [ "$CONSOLE_COUNT" -eq 0 ]; then
  gate_pass "ZRP-A-012" "No console.log"
else
  gate_warn "ZRP-A-012" "No console.log" "$CONSOLE_COUNT console.log/debug/info statements in changed production files"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ZRP Category A Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "═══════════════════════════════════════════════════════════════"

# Export results for aggregation
echo "ZRP_A_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_A_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_A_WARN=$WARN" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL gate(s) failed. Fix before merging."
  exit 1
fi

echo ""
echo "Category A: All blocking gates passed."
exit 0
