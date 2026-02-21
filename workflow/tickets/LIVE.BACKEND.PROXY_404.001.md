# Live Ticket Intake (GCP Staging Only)

## Required Identity

- `ticketId`: LIVE.BACKEND.PROXY_404.001
- `screenId`: BACKEND.API_ROUTING
- `surface`: backend
- `title`: Main-backend returns 404 for proxied public auth/POS endpoints despite routes being defined in source
- `severity`: P0

## Required Live Evidence (Section 2G)

- Staging URL or flow: POST https://staging.supermandi.tech/api/v1/supplier/auth/login
- Observation timestamp (UTC/IST): 2026-02-21T01:32:53Z / 07:02 IST
- Runtime evidence:
  - HTTP response/status: HTTP 404 (Google Cloud Run default HTML error page)
  - API payload/log snippet:
    ```
    [PROXY] POST /api/v1/supplier/auth/login -> supplier-portal (https://main-backend-jwgq6sc6aq-el.a.run.app)
    [PROXY] POST /api/v1/supplier/auth/login <- supplier-portal (404)
    ```
  - Screenshot/video path: N/A (CLI test with Cloud Run logs)
- Active Cloud Run revision ID(s):
  - api-gateway-00054-lxt
  - main-backend-00071-654

## Micro Check Results (per issue context)

- UI: N/A (API-level issue)
- UX: N/A
- wiring: FAIL — auth endpoints unreachable from portals
- navigation: N/A
- API contract: FAIL — POST /api/v1/supplier/auth/login should return 200/401, gets 404
- backend behavior: FAIL — main-backend doesn't handle proxied requests
- DB/migration impact: N/A (route registration, not DB)
- GCP staging parity: FAIL — routes exist in source but not at runtime

## Affected Endpoints (all return 404 from main-backend)

| Endpoint | Method | Expected | Actual |
|----------|--------|----------|--------|
| /api/v1/supplier/auth/login | POST | 200/401 | 404 |
| /api/v1/supplier/auth/register | POST | 200/400 | 404 |
| /api/v1/retailer-admin/auth/login | POST | 200/401 | 404* |
| /api/v1/auth/phone/exists | POST | 200 | 404 |
| /api/v1/pos/enroll | POST | 200/401 | 404 |
| /api/v1/pos/health | GET | 200 | 404 |
| /api/v1/retailer-admin/health | GET | 200 | 404 |
| /api/v1/retailer-admin/registration/lookup | GET/POST | 200 | 404 |

*Note: /api/v1/retailer-admin/auth/login intermittently returns 429 (rate limiter) or 400 (validation error) — suggesting it sometimes works. Flapping behavior observed.

## Working Endpoints (for comparison)

These endpoints work because the api-gateway handles them LOCALLY (no proxy to main-backend):
- /api/v1/health → 200 (gateway-local health check)
- /api/v1/version → 200 (gateway-local version)
- /api/v1/admin/stores → 401 (gateway JWT middleware rejects before proxy)
- /api/v1/supplier/products → 401 (gateway JWT middleware rejects before proxy)

## Repro Steps

1. POST https://staging.supermandi.tech/api/v1/supplier/auth/login with body {"email":"test@test.com","password":"test"}
2. Observe HTTP 404 with Google Cloud Run HTML error page
3. Check api-gateway logs: `gcloud run services logs read api-gateway --project=supermandi-backend --region=asia-south1 --limit=10`
4. Confirm proxy shows: `[PROXY] POST /api/v1/supplier/auth/login <- supplier-portal (404)`
5. Check main-backend logs: `gcloud run services logs read main-backend --project=supermandi-backend --region=asia-south1 --limit=10`
6. Observe NO request logs in main-backend (instance was SIGTERM'd, no new instance started)

## Service Mapping

- Primary service: main-backend (target of api-gateway proxy)
- Secondary services: api-gateway (proxy source)
- Expected base path: /api/v1/supplier/*, /api/v1/pos/*, /api/v1/auth/*, /api/v1/retailer-admin/*

## Root Cause Analysis

The api-gateway correctly identifies and proxies public (no-JWT) requests to main-backend at `https://main-backend-jwgq6sc6aq-el.a.run.app`. However:

1. Main-backend instance was SIGTERM'd at 01:17:53 (Cloud Run idle scaling)
2. Subsequent proxied requests return 404 with ~200ms response time
3. NO startup logs appear for a new main-backend instance
4. The 200ms response time is too fast for a cold start (which takes 7+ seconds)
5. This suggests Google Cloud Frontend is returning the 404 without attempting to start a new instance

Possible causes:
- Cloud Run min-instances = 0 (default) causing scale-to-zero
- Proxy requests from api-gateway not triggering Cloud Run autoscaler
- Cloud Run instance failing to start silently
- Connection timeout errors (3 at startup) corrupting instance health state

## Blockers / Dependencies

- Internal: Cloud Run configuration investigation, possibly set min-instances=1 for main-backend
- External: None
- Ops: Final signoff only after Claude provides main-backend recovery evidence

## Stability / Closure Criteria

- A single green smoke run is insufficient to close this P0.
- Closure requires repeated successful validation of proxied auth/POS endpoints across multiple runs/time windows.
- Evidence must include at least one cold/warm transition window proving no recurrent 404 behavior.

## Notes

- Why this is production-impacting: NO user can log in to any portal (retailer, supplier). NO POS device can enroll. Authentication is completely broken.
- Rollback-safe fix hint: Set min-instances=1 for main-backend to prevent scale-to-zero: `gcloud run services update main-backend --min-instances=1`
