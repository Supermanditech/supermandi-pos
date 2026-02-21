# Live Ticket Intake (GCP Staging Only)

## Required Identity

- `ticketId`: LIVE.BACKEND.POS_HEALTH.001
- `screenId`: BACKEND.POS_SERVICE
- `surface`: backend
- `title`: No /api/v1/pos/health endpoint defined — POS microservice health unmonitorable
- `severity`: P2

## Required Live Evidence (Section 2G)

- Staging URL or flow: GET https://staging.supermandi.tech/api/v1/pos/health
- Observation timestamp (UTC/IST): 2026-02-21T01:22:12Z / 06:52 IST
- Runtime evidence:
  - HTTP response/status: HTTP 404 (route not found on main-backend)
  - API payload/log snippet:
    ```
    [PROXY] GET /api/v1/pos/health -> pos (https://main-backend-jwgq6sc6aq-el.a.run.app)
    [PROXY] GET /api/v1/pos/health <- pos (404)
    ```
  - Screenshot/video path: N/A
- Active Cloud Run revision ID(s):
  - api-gateway-00054-lxt
  - main-backend-00071-654

## Micro Check Results (per issue context)

- UI: N/A
- UX: N/A
- wiring: N/A
- navigation: N/A
- API contract: FAIL — microserviceHealth.ts defines health for 8 services but not POS
- backend behavior: WARN — POS routes exist but no health check
- DB/migration impact: N/A
- GCP staging parity: WARN — deploy.yml Gate 2 tests /api/v1/pos/health but it doesn't exist

## Repro Steps

1. GET https://staging.supermandi.tech/api/v1/pos/health
2. Observe 404 response
3. Check microserviceHealth.ts: has /inventory/health, /orders/health, /catalog/health, /suppliers/health, /reorder/health, /voice/health, /platform/health, /auth/health — but NOT /pos/health

## Service Mapping

- Primary service: main-backend (pos-service routes)
- Secondary services: api-gateway (proxy)
- Expected base path: /api/v1/pos/health

## Existing Health Endpoints (microserviceHealth.ts)

| Service | Health Endpoint | Status |
|---------|----------------|--------|
| inventory | /api/v1/inventory/health | EXISTS |
| orders | /api/v1/orders/health | EXISTS |
| catalog | /api/v1/catalog/health | EXISTS |
| suppliers | /api/v1/suppliers/health | EXISTS |
| reorder | /api/v1/reorder/health | EXISTS |
| voice | /api/v1/voice/health | EXISTS |
| platform | /api/v1/platform/health | EXISTS |
| auth | /api/v1/auth/health | EXISTS |
| **pos** | **/api/v1/pos/health** | **MISSING** |

## Fix

Add POS health endpoint to `backend/src/routes/v1/microserviceHealth.ts` following the same pattern as other services.

## Blockers / Dependencies

- Internal: Code change to microserviceHealth.ts
- External: None
- Ops: Final signoff only after Claude verifies staging endpoint and gate compatibility evidence

## Notes

- Why this is production-impacting: POS service health cannot be monitored independently; deploy Gate 2 may be testing a non-existent endpoint
- Rollback-safe fix hint: Adding a health endpoint is purely additive
