#!/usr/bin/env bash
# =============================================================================
# ZRP Parity Report Generator v2.0
# Aggregates all gate results and generates GitHub Step Summary.
# Called at the end of CI and CD pipelines.
# Covers all 138 gates across 13 category groups.
# =============================================================================
set -euo pipefail

REPORT_TYPE="${1:-ci}"  # "ci" or "cd"

echo "=== ZRP Parity Report ($REPORT_TYPE) ==="
echo ""

# Read gate results from environment (set by individual gate scripts)
# --- Original categories (from Phase 1) ---
ZRP_A_PASS=${ZRP_A_PASS:-0}
ZRP_A_FAIL=${ZRP_A_FAIL:-0}
ZRP_A_WARN=${ZRP_A_WARN:-0}
ZRP_SECURITY_PASS=${ZRP_SECURITY_PASS:-0}
ZRP_SECURITY_FAIL=${ZRP_SECURITY_FAIL:-0}
ZRP_MIGRATION_PASS=${ZRP_MIGRATION_PASS:-0}
ZRP_MIGRATION_FAIL=${ZRP_MIGRATION_FAIL:-0}
ZRP_CONFIG_PASS=${ZRP_CONFIG_PASS:-0}
ZRP_CONFIG_FAIL=${ZRP_CONFIG_FAIL:-0}
ZRP_BUNDLE_PASS=${ZRP_BUNDLE_PASS:-0}
ZRP_BUNDLE_FAIL=${ZRP_BUNDLE_FAIL:-0}
ZRP_DOCKER_PASS=${ZRP_DOCKER_PASS:-0}
ZRP_DOCKER_FAIL=${ZRP_DOCKER_FAIL:-0}

# --- Phase 2 categories (48 new gates) ---
ZRP_LICENSE_PASS=${ZRP_LICENSE_PASS:-0}
ZRP_LICENSE_FAIL=${ZRP_LICENSE_FAIL:-0}
ZRP_LICENSE_WARN=${ZRP_LICENSE_WARN:-0}
ZRP_DB_ADV_PASS=${ZRP_DB_ADV_PASS:-0}
ZRP_DB_ADV_FAIL=${ZRP_DB_ADV_FAIL:-0}
ZRP_AUTH_HARD_PASS=${ZRP_AUTH_HARD_PASS:-0}
ZRP_AUTH_HARD_FAIL=${ZRP_AUTH_HARD_FAIL:-0}
ZRP_SCALE_PASS=${ZRP_SCALE_PASS:-0}
ZRP_SCALE_FAIL=${ZRP_SCALE_FAIL:-0}
ZRP_OBS_PASS=${ZRP_OBS_PASS:-0}
ZRP_OBS_FAIL=${ZRP_OBS_FAIL:-0}
ZRP_ARTIFACT_PASS=${ZRP_ARTIFACT_PASS:-0}
ZRP_ARTIFACT_FAIL=${ZRP_ARTIFACT_FAIL:-0}
ZRP_HYGIENE_PASS=${ZRP_HYGIENE_PASS:-0}
ZRP_HYGIENE_FAIL=${ZRP_HYGIENE_FAIL:-0}
ZRP_POSTURE_PASS=${ZRP_POSTURE_PASS:-0}
ZRP_POSTURE_FAIL=${ZRP_POSTURE_FAIL:-0}
ZRP_CHAOS_EXT_PASS=${ZRP_CHAOS_EXT_PASS:-0}
ZRP_CHAOS_EXT_FAIL=${ZRP_CHAOS_EXT_FAIL:-0}
ZRP_BIZ_PASS=${ZRP_BIZ_PASS:-0}
ZRP_BIZ_FAIL=${ZRP_BIZ_FAIL:-0}

TOTAL_PASS=$((ZRP_A_PASS + ZRP_SECURITY_PASS + ZRP_MIGRATION_PASS + ZRP_CONFIG_PASS + ZRP_BUNDLE_PASS + ZRP_DOCKER_PASS + ZRP_LICENSE_PASS + ZRP_DB_ADV_PASS + ZRP_AUTH_HARD_PASS + ZRP_SCALE_PASS + ZRP_OBS_PASS + ZRP_ARTIFACT_PASS + ZRP_HYGIENE_PASS + ZRP_POSTURE_PASS + ZRP_CHAOS_EXT_PASS + ZRP_BIZ_PASS))
TOTAL_FAIL=$((ZRP_A_FAIL + ZRP_SECURITY_FAIL + ZRP_MIGRATION_FAIL + ZRP_CONFIG_FAIL + ZRP_BUNDLE_FAIL + ZRP_DOCKER_FAIL + ZRP_LICENSE_FAIL + ZRP_DB_ADV_FAIL + ZRP_AUTH_HARD_FAIL + ZRP_SCALE_FAIL + ZRP_OBS_FAIL + ZRP_ARTIFACT_FAIL + ZRP_HYGIENE_FAIL + ZRP_POSTURE_FAIL + ZRP_CHAOS_EXT_FAIL + ZRP_BIZ_FAIL))
TOTAL_WARN=$((ZRP_A_WARN + ZRP_LICENSE_WARN))
TOTAL=$((TOTAL_PASS + TOTAL_FAIL))

# Generate console output
echo "+---------------------------------+------+------+------+"
echo "| Category                        | PASS | FAIL | WARN |"
echo "+---------------------------------+------+------+------+"
printf "| A: Git Discipline               | %4d | %4d | %4d |\n" "$ZRP_A_PASS" "$ZRP_A_FAIL" "$ZRP_A_WARN"
printf "| B+F: Security Audit             | %4d | %4d |    0 |\n" "$ZRP_SECURITY_PASS" "$ZRP_SECURITY_FAIL"
printf "| B: License & Coverage           | %4d | %4d | %4d |\n" "$ZRP_LICENSE_PASS" "$ZRP_LICENSE_FAIL" "$ZRP_LICENSE_WARN"
printf "| B: Bundle Size                  | %4d | %4d |    0 |\n" "$ZRP_BUNDLE_PASS" "$ZRP_BUNDLE_FAIL"
printf "| B: Dockerfile Lint              | %4d | %4d |    0 |\n" "$ZRP_DOCKER_PASS" "$ZRP_DOCKER_FAIL"
printf "| C: Artifact Integrity           | %4d | %4d |    0 |\n" "$ZRP_ARTIFACT_PASS" "$ZRP_ARTIFACT_FAIL"
printf "| C: Artifact Hygiene             | %4d | %4d |    0 |\n" "$ZRP_HYGIENE_PASS" "$ZRP_HYGIENE_FAIL"
printf "| D: Config Parity                | %4d | %4d |    0 |\n" "$ZRP_CONFIG_PASS" "$ZRP_CONFIG_FAIL"
printf "| E: Migration Safety             | %4d | %4d |    0 |\n" "$ZRP_MIGRATION_PASS" "$ZRP_MIGRATION_FAIL"
printf "| E: DB Advanced Safety           | %4d | %4d |    0 |\n" "$ZRP_DB_ADV_PASS" "$ZRP_DB_ADV_FAIL"
printf "| F: Auth Hardening               | %4d | %4d |    0 |\n" "$ZRP_AUTH_HARD_PASS" "$ZRP_AUTH_HARD_FAIL"
printf "| F+G: Cloud Posture              | %4d | %4d |    0 |\n" "$ZRP_POSTURE_PASS" "$ZRP_POSTURE_FAIL"
printf "| H: Observability                | %4d | %4d |    0 |\n" "$ZRP_OBS_PASS" "$ZRP_OBS_FAIL"
printf "| I: Business Logic               | %4d | %4d |    0 |\n" "$ZRP_BIZ_PASS" "$ZRP_BIZ_FAIL"
printf "| J: Chaos (Extended)             | %4d | %4d |    0 |\n" "$ZRP_CHAOS_EXT_PASS" "$ZRP_CHAOS_EXT_FAIL"
printf "| K: Scalability                  | %4d | %4d |    0 |\n" "$ZRP_SCALE_PASS" "$ZRP_SCALE_FAIL"
echo "+---------------------------------+------+------+------+"
printf "| TOTAL                           | %4d | %4d | %4d |\n" "$TOTAL_PASS" "$TOTAL_FAIL" "$TOTAL_WARN"
echo "+---------------------------------+------+------+------+"

# Generate GitHub Step Summary if available
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## ZRP Parity Report ($REPORT_TYPE)"
    echo ""
    echo "| Category | PASS | FAIL | WARN |"
    echo "|----------|------|------|------|"
    echo "| A: Git Discipline | $ZRP_A_PASS | $ZRP_A_FAIL | $ZRP_A_WARN |"
    echo "| B+F: Security Audit | $ZRP_SECURITY_PASS | $ZRP_SECURITY_FAIL | 0 |"
    echo "| B: License & Coverage | $ZRP_LICENSE_PASS | $ZRP_LICENSE_FAIL | $ZRP_LICENSE_WARN |"
    echo "| B: Bundle Size | $ZRP_BUNDLE_PASS | $ZRP_BUNDLE_FAIL | 0 |"
    echo "| B: Dockerfile Lint | $ZRP_DOCKER_PASS | $ZRP_DOCKER_FAIL | 0 |"
    echo "| C: Artifact Integrity | $ZRP_ARTIFACT_PASS | $ZRP_ARTIFACT_FAIL | 0 |"
    echo "| C: Artifact Hygiene | $ZRP_HYGIENE_PASS | $ZRP_HYGIENE_FAIL | 0 |"
    echo "| D: Config Parity | $ZRP_CONFIG_PASS | $ZRP_CONFIG_FAIL | 0 |"
    echo "| E: Migration Safety | $ZRP_MIGRATION_PASS | $ZRP_MIGRATION_FAIL | 0 |"
    echo "| E: DB Advanced | $ZRP_DB_ADV_PASS | $ZRP_DB_ADV_FAIL | 0 |"
    echo "| F: Auth Hardening | $ZRP_AUTH_HARD_PASS | $ZRP_AUTH_HARD_FAIL | 0 |"
    echo "| F+G: Cloud Posture | $ZRP_POSTURE_PASS | $ZRP_POSTURE_FAIL | 0 |"
    echo "| H: Observability | $ZRP_OBS_PASS | $ZRP_OBS_FAIL | 0 |"
    echo "| I: Business Logic | $ZRP_BIZ_PASS | $ZRP_BIZ_FAIL | 0 |"
    echo "| J: Chaos (Extended) | $ZRP_CHAOS_EXT_PASS | $ZRP_CHAOS_EXT_FAIL | 0 |"
    echo "| K: Scalability | $ZRP_SCALE_PASS | $ZRP_SCALE_FAIL | 0 |"
    echo "| **TOTAL** | **$TOTAL_PASS** | **$TOTAL_FAIL** | **$TOTAL_WARN** |"
    echo ""
    if [ "$TOTAL_FAIL" -eq 0 ]; then
      echo "### Verdict: PASS — All $TOTAL_PASS gates passed"
    else
      echo "### Verdict: FAIL — $TOTAL_FAIL gate(s) failed out of $TOTAL"
    fi
    echo ""
    echo "*Generated by ZRP Parity Report v2.0 — 138 gates across 11 categories*"
  } >> "$GITHUB_STEP_SUMMARY"
  echo ""
  echo "GitHub Step Summary written."
fi

echo ""
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo "ZRP VERDICT: PASS ($TOTAL_PASS/$TOTAL gates passed)"
  exit 0
else
  echo "ZRP VERDICT: FAIL ($TOTAL_FAIL/$TOTAL gates failed)"
  exit 1
fi
