#!/usr/bin/env bash
# CD-SQL-001: Create Cloud SQL Postgres 15 instance for SuperMandi
# Usage: ./scripts/gcp/setup-cloud-sql.sh [--project PROJECT] [--region REGION]
# Idempotent: safe to run multiple times

set -euo pipefail

PROJECT="${GCP_PROJECT:-supermandi-pos}"
REGION="${GCP_REGION:-asia-south1}"
INSTANCE_NAME="supermandi-db"
DB_NAME="supermandi"
DB_USER="supermandi"
TIER="db-f1-micro"  # Starter tier — upgrade for production

while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --tier) TIER="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "============================================="
echo "  Cloud SQL Setup (Postgres 15)"
echo "  Project:  $PROJECT"
echo "  Region:   $REGION"
echo "  Instance: $INSTANCE_NAME"
echo "  Tier:     $TIER"
echo "============================================="
echo ""

gcloud config set project "$PROJECT" --quiet

# Enable Cloud SQL API
echo "--- Enabling Cloud SQL Admin API..."
gcloud services enable sqladmin.googleapis.com --quiet
echo "  OK: API enabled"

# Create instance (idempotent)
echo ""
echo "--- Creating Cloud SQL instance: $INSTANCE_NAME..."
if gcloud sql instances describe "$INSTANCE_NAME" --format="value(name)" 2>/dev/null; then
  echo "  OK: Instance already exists"
else
  gcloud sql instances create "$INSTANCE_NAME" \
    --database-version=POSTGRES_15 \
    --tier="$TIER" \
    --region="$REGION" \
    --storage-type=SSD \
    --storage-size=10GB \
    --storage-auto-increase \
    --backup-start-time="02:00" \
    --enable-point-in-time-recovery \
    --availability-type=zonal \
    --no-assign-ip \
    --network=default \
    --quiet
  echo "  OK: Instance created (this may take a few minutes)"
fi

# Create database
echo ""
echo "--- Creating database: $DB_NAME..."
if gcloud sql databases describe "$DB_NAME" --instance="$INSTANCE_NAME" 2>/dev/null; then
  echo "  OK: Database already exists"
else
  gcloud sql databases create "$DB_NAME" --instance="$INSTANCE_NAME" --quiet
  echo "  OK: Database created"
fi

# Create user
echo ""
echo "--- Creating user: $DB_USER..."
if gcloud sql users list --instance="$INSTANCE_NAME" --format="value(name)" | grep -q "^${DB_USER}$"; then
  echo "  OK: User already exists"
else
  echo "  Enter password for user '$DB_USER':"
  read -s DB_PASSWORD
  gcloud sql users create "$DB_USER" \
    --instance="$INSTANCE_NAME" \
    --password="$DB_PASSWORD" \
    --quiet
  echo "  OK: User created"
  echo ""
  echo "  IMPORTANT: Store this password in Secret Manager:"
  echo "    gcloud secrets versions add postgres-password --data-file=-"
fi

# Get connection name
echo ""
echo "--- Instance details..."
CONNECTION_NAME=$(gcloud sql instances describe "$INSTANCE_NAME" \
  --format="value(connectionName)" 2>/dev/null || echo "UNKNOWN")

PRIVATE_IP=$(gcloud sql instances describe "$INSTANCE_NAME" \
  --format="value(ipAddresses[0].ipAddress)" 2>/dev/null || echo "UNKNOWN")

echo ""
echo "============================================="
echo "  CLOUD SQL SETUP COMPLETE"
echo "============================================="
echo ""
echo "  Connection name: $CONNECTION_NAME"
echo "  Private IP:      $PRIVATE_IP"
echo "  Database:        $DB_NAME"
echo "  User:            $DB_USER"
echo ""
echo "  For Cloud Run, set env vars:"
echo "    DB_HOST=/cloudsql/$CONNECTION_NAME"
echo "    DB_NAME=$DB_NAME"
echo "    DB_USER=$DB_USER"
echo "    DB_PASSWORD=<from Secret Manager>"
echo ""
echo "  Connection string:"
echo "    postgresql://$DB_USER:PASSWORD@/$DB_NAME?host=/cloudsql/$CONNECTION_NAME"
echo ""
