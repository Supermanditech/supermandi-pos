#!/usr/bin/env bash
# CD-VPC-001: Create VPC Connector for Cloud Run → Cloud SQL + Memorystore
# Usage: ./scripts/gcp/setup-vpc-connector.sh [--project PROJECT] [--region REGION]
# Idempotent: safe to run multiple times

set -euo pipefail

PROJECT="${GCP_PROJECT:-supermandi-backend}"
REGION="${GCP_REGION:-asia-south1}"
CONNECTOR_NAME="supermandi-connector"
NETWORK="default"
IP_RANGE="10.8.0.0/28"  # /28 = 16 IPs, required minimum for VPC connector

while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --ip-range) IP_RANGE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "============================================="
echo "  VPC Connector Setup"
echo "  Project:   $PROJECT"
echo "  Region:    $REGION"
echo "  Connector: $CONNECTOR_NAME"
echo "  Network:   $NETWORK"
echo "  IP Range:  $IP_RANGE"
echo "============================================="
echo ""

gcloud config set project "$PROJECT" --quiet

# Enable VPC Access API
echo "--- Enabling VPC Access API..."
gcloud services enable vpcaccess.googleapis.com --quiet
echo "  OK: API enabled"

# Create connector (idempotent)
echo ""
echo "--- Creating VPC connector: $CONNECTOR_NAME..."
if gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
  --region="$REGION" --format="value(name)" 2>/dev/null; then
  echo "  OK: Connector already exists"
else
  gcloud compute networks vpc-access connectors create "$CONNECTOR_NAME" \
    --region="$REGION" \
    --network="$NETWORK" \
    --range="$IP_RANGE" \
    --min-instances=2 \
    --max-instances=3 \
    --quiet
  echo "  OK: Connector created"
fi

# Verify
echo ""
echo "--- Verification..."
gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
  --region="$REGION" \
  --format="table(name,network,ipCidrRange,state,minInstances,maxInstances)"

CONNECTOR_ID="projects/${PROJECT}/locations/${REGION}/connectors/${CONNECTOR_NAME}"

echo ""
echo "============================================="
echo "  VPC CONNECTOR SETUP COMPLETE"
echo "============================================="
echo ""
echo "  Connector ID: $CONNECTOR_ID"
echo ""
echo "  Use with Cloud Run deploy:"
echo "    --vpc-connector=$CONNECTOR_ID"
echo "    --vpc-egress=private-ranges-only"
echo ""
