#!/usr/bin/env bash
# =============================================================================
# ZRP-H-097, H-098, H-099: Runbooks, Cost Guardrails, Escalation Docs
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP-H-097/098/099: Observability & Ops Docs ==="
echo ""

DEPLOY_YML=".github/workflows/deploy.yml"

# =============================================================================
# ZRP-H-097: Runbooks exist for common incidents (WARNING P2)
# =============================================================================
echo "--- ZRP-H-097: Runbook existence ---"

RUNBOOK_MISSING=0

if [ -f "RELEASES/ROLLBACK_PLAYBOOK.md" ]; then
  echo "  OK: RELEASES/ROLLBACK_PLAYBOOK.md exists"
else
  echo "  MISSING: RELEASES/ROLLBACK_PLAYBOOK.md"
  RUNBOOK_MISSING=$((RUNBOOK_MISSING + 1))
fi

if [ -f "RELEASES/INCIDENTS.md" ]; then
  echo "  OK: RELEASES/INCIDENTS.md exists"
else
  echo "  MISSING: RELEASES/INCIDENTS.md"
  RUNBOOK_MISSING=$((RUNBOOK_MISSING + 1))
fi

if [ -f "RELEASES/RELEASE_POLICY.md" ]; then
  echo "  OK: RELEASES/RELEASE_POLICY.md exists"
else
  echo "  MISSING: RELEASES/RELEASE_POLICY.md"
  RUNBOOK_MISSING=$((RUNBOOK_MISSING + 1))
fi

if [ "$RUNBOOK_MISSING" -eq 0 ]; then
  gate_pass "ZRP-H-097" "All required runbooks exist"
else
  gate_warn "ZRP-H-097" "Runbooks" "$RUNBOOK_MISSING required runbook(s) missing"
fi

# =============================================================================
# ZRP-H-098: Cost guardrails — resource limits in deploy.yml (WARNING P2)
# =============================================================================
echo ""
echo "--- ZRP-H-098: Cost guardrails ---"

if [ -f "$DEPLOY_YML" ]; then
  # Check min-instances=0 for staging (don't pay for idle)
  MIN_INST=$(grep -oE 'min-instances=[0-9]+' "$DEPLOY_YML" 2>/dev/null | sort -u || echo "")
  MAX_INST=$(grep -oE 'max-instances=[0-9]+' "$DEPLOY_YML" 2>/dev/null | sort -u || echo "")
  MEM=$(grep -oE 'memory=[0-9]+Mi' "$DEPLOY_YML" 2>/dev/null | sort -u || echo "")

  echo "  Min instances: $MIN_INST"
  echo "  Max instances: $MAX_INST"
  echo "  Memory: $MEM"

  COST_ISSUES=0

  # Verify min-instances=0 exists
  if echo "$MIN_INST" | grep -q "min-instances=0"; then
    echo "  OK: min-instances=0 configured (scale to zero)"
  else
    echo "  WARN: min-instances=0 not found (staging should scale to zero)"
    COST_ISSUES=$((COST_ISSUES + 1))
  fi

  # Verify max-instances <= 5 for staging
  for inst in $(echo "$MAX_INST" | grep -oE '[0-9]+'); do
    if [ "$inst" -gt 5 ]; then
      echo "  WARN: max-instances=$inst (staging should be <= 5)"
      COST_ISSUES=$((COST_ISSUES + 1))
    fi
  done

  if [ "$COST_ISSUES" -eq 0 ]; then
    gate_pass "ZRP-H-098" "Cost guardrails configured for staging"
  else
    gate_warn "ZRP-H-098" "Cost guardrails" "$COST_ISSUES issue(s) with staging resource limits"
  fi
else
  gate_warn "ZRP-H-098" "Cost guardrails" "deploy.yml not found"
fi

# =============================================================================
# ZRP-H-099: Escalation path documented (WARNING P2)
# =============================================================================
echo ""
echo "--- ZRP-H-099: Escalation path ---"

ESCALATION_FOUND=false

# Check for escalation documentation in RELEASES/
for doc in RELEASES/ROLLBACK_PLAYBOOK.md RELEASES/INCIDENTS.md RELEASES/RELEASE_POLICY.md RELEASES/CLAUDE_STATE.md; do
  if [ -f "$doc" ]; then
    if grep -qiE 'escalat|oncall|on-call|contact|notify|alert' "$doc" 2>/dev/null; then
      echo "  OK: Escalation info found in $doc"
      ESCALATION_FOUND=true
    fi
  fi
done

# Check for operator contact info
if grep -rqiE 'operator|admin.*email|contact.*email|supermanditech' RELEASES/ 2>/dev/null; then
  ESCALATION_FOUND=true
fi

if [ "$ESCALATION_FOUND" = "true" ]; then
  gate_pass "ZRP-H-099" "Escalation/contact info documented"
else
  gate_warn "ZRP-H-099" "Escalation" "No escalation path or contact info found in RELEASES/"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "==============================================================="
echo "ZRP Observability Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "==============================================================="

echo "ZRP_OBS_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_OBS_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL observability gate(s) failed."
  exit 1
fi

echo ""
echo "Observability: All blocking gates passed."
exit 0
