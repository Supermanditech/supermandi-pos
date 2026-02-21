# Live Ticket Intake (GCP Staging Only)

## Required Identity

- `ticketId`: LIVE.BACKEND.CONN_TIMEOUT.001
- `screenId`: BACKEND.DB_CONNECTIVITY
- `surface`: backend
- `title`: Main-backend throws 3 connection timeout unhandled rejections during startup
- `severity`: P1

## Required Live Evidence (Section 2G)

- Staging URL or flow: main-backend Cloud Run service startup
- Observation timestamp (UTC/IST): 2026-02-21T01:04:03Z / 06:34 IST
- Runtime evidence:
  - HTTP response/status: N/A (startup error, not request-triggered)
  - API payload/log snippet:
    ```
    2026-02-21 01:04:03 [ERROR] Unhandled rejection {"reason":"Error: Connection terminated due to connection timeout"}
    2026-02-21 01:04:03 [ERROR] Unhandled rejection {"reason":"Error: Connection terminated due to connection timeout"}
    2026-02-21 01:04:03 [ERROR] Unhandled rejection {"reason":"Error: Connection terminated due to connection timeout"}
    ```
  - Screenshot/video path: N/A
- Active Cloud Run revision ID(s):
  - main-backend-00071-654

## Micro Check Results (per issue context)

- UI: N/A
- UX: N/A
- wiring: N/A
- navigation: N/A
- API contract: N/A
- backend behavior: FAIL — unhandled rejections indicate connection pool issues
- DB/migration impact: WARN — DB pool initializes (min=2, max=20) but connections timeout
- GCP staging parity: WARN — connection timeout may be VPC/Cloud SQL specific

## Repro Steps

1. Deploy main-backend to Cloud Run
2. Wait ~80 seconds after startup (started 01:02:44, errors at 01:04:03)
3. Check logs: `gcloud run services logs read main-backend --project=supermandi-backend --region=asia-south1 --limit=30`
4. Observe 3 "Connection terminated due to connection timeout" unhandled rejections

## Service Mapping

- Primary service: main-backend
- Secondary services: Cloud SQL (supermandi-backend:asia-south1:supermandi-staging), Redis (10.107.71.27:6379)
- Expected base path: N/A (infrastructure issue)

## Root Cause Hypothesis

The DB pool initializes at 01:03:23 with min=2, max=20. The timeout errors occur 40 seconds later at 01:04:03. This suggests:
1. The minimum 2 connections are being established
2. Some background query or connection validation fails after 30 seconds (matching statementTimeout=30000ms)
3. The unhandled rejection means the error is not caught by the connection pool error handler

Potential causes:
- Cloud SQL connection via Unix socket `/cloudsql/supermandi-backend:asia-south1:supermandi-staging` having intermittent issues
- Redis connection at 10.107.71.27:6379 timing out (VPC connector needed)
- Background scheduler (SyncCleanup) making DB calls that timeout

## Blockers / Dependencies

- Internal: DB connection pool error handling investigation
- External: Cloud SQL / Redis network path verification
- Ops: Final signoff only after Claude provides root-cause and before/after runtime evidence

## Notes

- Why this is production-impacting: Unhandled rejections may crash Node.js in strict mode; connection timeouts indicate DB/Redis connectivity issues that affect all data-dependent routes
- Rollback-safe fix hint: Add proper error handlers to connection pool; investigate if SyncCleanup scheduler is the source of timeouts
