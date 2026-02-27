# Staging Baseline Snapshot (Pre-Deploy)

> Captured: 2026-02-27T15:00:00+05:30
> Purpose: Record current staging state BEFORE mega-batch deploy for rollback reference
> Environment: GCP `supermandi-backend` / `asia-south1`

## Current Staging State

| Field | Value |
|-------|-------|
| Last deployed SHA | `badc3fbe` |
| Last deploy date | 2026-02-23 |
| Last deploy CI run | `22305359033` |
| Deploy target SHA | `83b2bffe` |
| Commits between | 246 |
| Deploy hold | **ACTIVE** (pending operator GO_DEPLOY) |

## Active Cloud Run Revision IDs (Rollback Targets)

| Service | Current Revision | Port |
|---------|-----------------|------|
| main-backend | `main-backend-00103-zbw` | 3001 |
| api-gateway | `api-gateway-00084-7zh` | 3000 |
| retailer-admin | `retailer-admin-00084-pk6` | 5173 |
| supplier-portal | `supplier-portal-00078-wv8` | 4001 |
| superadmin | `superadmin-00077-r6c` | 5174 |
| landing | `landing-00077-gj7` | 80 |

## Image Tags (Pre-Deploy)

> **OPERATOR ACTION REQUIRED**: Capture image digests before deploying.
> ```bash
> for svc in main-backend api-gateway retailer-admin supplier-portal superadmin landing; do
>   echo "=== $svc ==="
>   gcloud run services describe $svc --region=asia-south1 --project=supermandi-backend --format='value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)'
> done
> ```

## Traffic Split (Pre-Deploy)

All 6 services should be serving 100% traffic on the revisions listed above.

> **OPERATOR VERIFY**:
> ```bash
> for svc in main-backend api-gateway retailer-admin supplier-portal superadmin landing; do
>   echo "=== $svc ==="
>   gcloud run services describe $svc --region=asia-south1 --project=supermandi-backend --format='value(status.traffic)'
> done
> ```

## Health Endpoint (Pre-Deploy)

> **OPERATOR VERIFY**:
> ```bash
> curl -s https://staging-api.supermandi.tech/health | jq .
> # Expected: gitSha = "badc3fbe", status = "ok"
> ```

## Database State (Pre-Deploy)

| Field | Value |
|-------|-------|
| Last applied migration | 140 (`140_t155_customer_profiles.sql`) |
| Pending migrations | 27 (141–167) |
| Critical migration | 149 (RLS on 27 tables) |
| Backup required | **YES** — mandatory before migration 149 |

> **OPERATOR VERIFY** current migration version:
> ```bash
> # Connect to Cloud SQL and check migrations table
> gcloud sql connect supermandi-db --project=supermandi-backend --user=supermandi
> # Then run:
> SELECT version, name FROM migrations ORDER BY version DESC LIMIT 5;
> ```

## Operator Identity

| Field | Value |
|-------|-------|
| Captured by | Claude (automated) |
| Operator verification | PENDING — operator must run verify commands above |
| Timestamp | 2026-02-27T15:00:00+05:30 |
