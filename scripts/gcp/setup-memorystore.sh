#!/usr/bin/env bash
# CD-REDIS-001: Create Memorystore Redis 7 instance for SuperMandi
# Usage: ./scripts/gcp/setup-memorystore.sh [--project PROJECT] [--region REGION]
# Idempotent: safe to run multiple times

set -euo pipefail

PROJECT="${GCP_PROJECT:-supermandi-backend}"
REGION="${GCP_REGION:-asia-south1}"
INSTANCE_NAME="supermandi-redis"
REDIS_VERSION="REDIS_7_0"
TIER="BASIC"        # BASIC for dev/staging, STANDARD_HA for production
MEMORY_SIZE_GB="1"

while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --tier) TIER="$2"; shift 2 ;;
    --memory) MEMORY_SIZE_GB="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "============================================="
echo "  Memorystore Redis Setup"
echo "  Project:  $PROJECT"
echo "  Region:   $REGION"
echo "  Instance: $INSTANCE_NAME"
echo "  Version:  $REDIS_VERSION"
echo "  Tier:     $TIER"
echo "  Memory:   ${MEMORY_SIZE_GB}GB"
echo "============================================="
echo ""

gcloud config set project "$PROJECT" --quiet

# Enable Redis API
echo "--- Enabling Memorystore Redis API..."
gcloud services enable redis.googleapis.com --quiet
echo "  OK: API enabled"

# Create instance (idempotent)
echo ""
echo "--- Creating Memorystore instance: $INSTANCE_NAME..."
if gcloud redis instances describe "$INSTANCE_NAME" --region="$REGION" --format="value(name)" 2>/dev/null; then
  echo "  OK: Instance already exists"
else
  gcloud redis instances create "$INSTANCE_NAME" \
    --region="$REGION" \
    --tier="$TIER" \
    --size="$MEMORY_SIZE_GB" \
    --redis-version="$REDIS_VERSION" \
    --network=default \
    --quiet
  echo "  OK: Instance created (this may take a few minutes)"
fi

# Get host IP
echo ""
echo "--- Instance details..."
REDIS_HOST=$(gcloud redis instances describe "$INSTANCE_NAME" \
  --region="$REGION" \
  --format="value(host)" 2>/dev/null || echo "UNKNOWN")

REDIS_PORT=$(gcloud redis instances describe "$INSTANCE_NAME" \
  --region="$REGION" \
  --format="value(port)" 2>/dev/null || echo "6379")

echo ""
echo "============================================="
echo "  MEMORYSTORE SETUP COMPLETE"
echo "============================================="
echo ""
echo "  Host: $REDIS_HOST"
echo "  Port: $REDIS_PORT"
echo ""
echo "  For Cloud Run, set env var:"
echo "    REDIS_URL=redis://$REDIS_HOST:$REDIS_PORT"
echo ""
echo "  NOTE: Cloud Run must use VPC connector to reach Memorystore."
echo "  Run: ./scripts/gcp/setup-vpc-connector.sh"
echo ""
