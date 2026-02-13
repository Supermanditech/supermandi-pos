#!/usr/bin/env bash
# =============================================================================
# ZRP-F-076, G-086, G-087: Cloud Security Posture
# Runs in CD pipeline (requires gcloud access)
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

gate_pass() { PASS=$((PASS + 1)); echo "  PASS: $1 — $2"; }
gate_fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2: $3"; }
gate_warn() { WARN=$((WARN + 1)); echo "  WARN: $1 — $2: $3"; }

echo "=== ZRP-F-076/G-086/G-087: Cloud Security Posture ==="
echo ""

GCP_PROJECT="${GCP_PROJECT:-supermandi-backend}"
GCP_REGION="${GCP_REGION:-asia-south1}"

# =============================================================================
# ZRP-F-076: WAF / Cloud Armor policy exists (WARNING P2)
# =============================================================================
echo "--- ZRP-F-076: Cloud Armor / WAF ---"

ARMOR_POLICIES=$(gcloud compute security-policies list \
  --project="$GCP_PROJECT" \
  --format="value(name)" 2>/dev/null || echo "")

if [ -n "$ARMOR_POLICIES" ]; then
  echo "  Security policies found:"
  echo "$ARMOR_POLICIES" | while read -r p; do echo "    - $p"; done
  gate_pass "ZRP-F-076" "Cloud Armor security policy exists"
else
  gate_warn "ZRP-F-076" "Cloud Armor" "No Cloud Armor security policies found"
fi

# =============================================================================
# ZRP-G-086: No terminated VMs or orphan IPs (WARNING P2)
# =============================================================================
echo ""
echo "--- ZRP-G-086: Orphan resource check ---"

ORPHANS=0

# Check for terminated/stopped VMs
TERMINATED_VMS=$(gcloud compute instances list \
  --project="$GCP_PROJECT" \
  --filter="status=TERMINATED OR status=STOPPED" \
  --format="value(name)" 2>/dev/null || echo "")

if [ -n "$TERMINATED_VMS" ]; then
  COUNT=$(echo "$TERMINATED_VMS" | wc -l)
  echo "  WARN: $COUNT terminated/stopped VM(s) found:"
  echo "$TERMINATED_VMS" | while read -r vm; do echo "    - $vm"; done
  ORPHANS=$((ORPHANS + COUNT))
else
  echo "  OK: No terminated/stopped VMs"
fi

# Check for reserved but unattached static IPs
UNATTACHED_IPS=$(gcloud compute addresses list \
  --project="$GCP_PROJECT" \
  --filter="status=RESERVED" \
  --format="value(name,address)" 2>/dev/null || echo "")

if [ -n "$UNATTACHED_IPS" ]; then
  COUNT=$(echo "$UNATTACHED_IPS" | wc -l)
  echo "  WARN: $COUNT reserved but unattached IP(s):"
  echo "$UNATTACHED_IPS" | while read -r ip; do echo "    - $ip"; done
  ORPHANS=$((ORPHANS + COUNT))
else
  echo "  OK: No orphan static IPs"
fi

if [ "$ORPHANS" -eq 0 ]; then
  gate_pass "ZRP-G-086" "No orphan resources found"
else
  gate_warn "ZRP-G-086" "Orphan resources" "$ORPHANS orphan resource(s) found (cost waste)"
fi

# =============================================================================
# ZRP-G-087: Log retention configured >= 30 days (WARNING P2)
# =============================================================================
echo ""
echo "--- ZRP-G-087: Log retention check ---"

# Check _Default bucket retention
RETENTION=$(gcloud logging buckets describe _Default \
  --location=global \
  --project="$GCP_PROJECT" \
  --format="value(retentionDays)" 2>/dev/null || echo "")

if [ -n "$RETENTION" ]; then
  echo "  _Default bucket retention: ${RETENTION} days"
  if [ "$RETENTION" -ge 30 ]; then
    gate_pass "ZRP-G-087" "Log retention >= 30 days ($RETENTION days)"
  else
    gate_warn "ZRP-G-087" "Log retention" "Retention is $RETENTION days (< 30 recommended)"
  fi
else
  gate_warn "ZRP-G-087" "Log retention" "Could not determine log retention"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "==============================================================="
echo "ZRP Cloud Posture Summary: $PASS PASS, $FAIL FAIL, $WARN WARN"
echo "==============================================================="

echo "ZRP_POSTURE_PASS=$PASS" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "ZRP_POSTURE_FAIL=$FAIL" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $FAIL cloud posture gate(s) failed."
  exit 1
fi

echo ""
echo "Cloud Posture: All gates passed (warnings logged)."
exit 0
