#!/usr/bin/env bash

# Shared production identity/context checks for deploy/promote scripts.
# Source this file from bash scripts; do not execute directly.

workflow_guard_fail() {
  local message="$1"
  echo "ERROR: ${message}" >&2
  return 1
}

workflow_guard_load_principals_from_state() {
  local state_file="$1"
  if [ ! -f "$state_file" ]; then
    return 0
  fi

  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    try {
      const state = JSON.parse(fs.readFileSync(file, "utf8"));
      const values = state?.roles?.operator?.identity?.allowedPrincipals;
      if (!Array.isArray(values)) process.exit(0);
      const cleaned = values
        .filter((v) => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean);
      if (cleaned.length) process.stdout.write(cleaned.join(","));
    } catch (_) {
      process.exit(0);
    }
  ' "$state_file"
}

workflow_guard_load_required_context_from_state() {
  local state_file="$1"
  if [ ! -f "$state_file" ]; then
    return 0
  fi

  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    try {
      const state = JSON.parse(fs.readFileSync(file, "utf8"));
      const required = state?.roles?.operator?.productionPolicy?.requiredExecutionContext;
      if (typeof required === "string" && required.trim()) {
        process.stdout.write(required.trim());
      }
    } catch (_) {
      process.exit(0);
    }
  ' "$state_file"
}

workflow_guard_load_required_pipeline_signals_from_state() {
  local state_file="$1"
  if [ ! -f "$state_file" ]; then
    return 0
  fi

  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    try {
      const state = JSON.parse(fs.readFileSync(file, "utf8"));
      const values = state?.roles?.operator?.productionPolicy?.requiredPipelineSignals;
      if (!Array.isArray(values)) process.exit(0);
      const cleaned = values
        .filter((v) => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean);
      if (cleaned.length) process.stdout.write(cleaned.join(","));
    } catch (_) {
      process.exit(0);
    }
  ' "$state_file"
}

workflow_guard_normalize_csv_to_lower() {
  local csv="$1"
  echo "$csv" \
    | tr ',' '\n' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    | sed '/^$/d' \
    | tr '[:upper:]' '[:lower:]'
}

workflow_guard_detect_active_principal() {
  if [ -n "${WORKFLOW_OPERATOR_PRINCIPAL:-}" ]; then
    printf "%s" "${WORKFLOW_OPERATOR_PRINCIPAL}"
    return 0
  fi
  if command -v gcloud >/dev/null 2>&1; then
    local account
    account="$(gcloud config get-value account 2>/dev/null | tr -d '\r' || true)"
    if [ -n "$account" ] && [ "$account" != "(unset)" ]; then
      printf "%s" "$account"
      return 0
    fi
  fi
  return 1
}

workflow_guard_require_pipeline_context() {
  local action_name="$1"
  local state_file="$2"

  local required_context="${WORKFLOW_REQUIRED_EXECUTION_CONTEXT:-}"
  if [ -z "$required_context" ]; then
    required_context="$(workflow_guard_load_required_context_from_state "$state_file")"
  fi
  if [ -z "$required_context" ]; then
    required_context="pipeline"
  fi

  local actual_context="${WORKFLOW_EXECUTION_CONTEXT:-}"
  if [ "$actual_context" != "$required_context" ]; then
    workflow_guard_fail "${action_name} requires WORKFLOW_EXECUTION_CONTEXT=${required_context}"
    return 1
  fi

  if [ "$required_context" != "pipeline" ]; then
    return 0
  fi

  local signals_csv="${WORKFLOW_REQUIRED_PIPELINE_SIGNALS:-}"
  if [ -z "$signals_csv" ]; then
    signals_csv="$(workflow_guard_load_required_pipeline_signals_from_state "$state_file")"
  fi
  if [ -z "$signals_csv" ]; then
    signals_csv="GITHUB_ACTIONS,CLOUD_BUILD_BUILD_ID,WORKFLOW_PIPELINE_RUN_ID"
  fi

  local found="false"
  while IFS= read -r signal; do
    [ -z "$signal" ] && continue
    local value="${!signal:-}"
    if [ -n "$value" ] && [ "$value" != "false" ] && [ "$value" != "0" ]; then
      found="true"
      break
    fi
  done < <(echo "$signals_csv" | tr ',' '\n')

  if [ "$found" != "true" ]; then
    workflow_guard_fail "${action_name} requires an active pipeline signal env var (${signals_csv})"
    return 1
  fi
}

workflow_guard_require_operator_principal() {
  local action_name="$1"
  local state_file="$2"

  local allowed_csv="${WORKFLOW_ALLOWED_OPERATOR_PRINCIPALS:-}"
  if [ -z "$allowed_csv" ]; then
    allowed_csv="$(workflow_guard_load_principals_from_state "$state_file")"
  fi
  if [ -z "$allowed_csv" ]; then
    workflow_guard_fail "${action_name} blocked: no allowed operator principals configured"
    return 1
  fi

  local actual_principal=""
  if ! actual_principal="$(workflow_guard_detect_active_principal)"; then
    workflow_guard_fail "${action_name} blocked: unable to resolve active operator principal"
    return 1
  fi

  local actual_lower
  actual_lower="$(echo "$actual_principal" | tr '[:upper:]' '[:lower:]')"
  local matched="false"
  while IFS= read -r allowed; do
    [ -z "$allowed" ] && continue
    if [ "$actual_lower" = "$allowed" ]; then
      matched="true"
      break
    fi
  done < <(workflow_guard_normalize_csv_to_lower "$allowed_csv")

  if [ "$matched" != "true" ]; then
    workflow_guard_fail "${action_name} blocked: principal '${actual_principal}' is not in allowed operator principals"
    return 1
  fi
}

workflow_guard_require_production_boundary() {
  local action_name="$1"
  local state_file="$2"

  workflow_guard_require_pipeline_context "$action_name" "$state_file"
  workflow_guard_require_operator_principal "$action_name" "$state_file"
}
