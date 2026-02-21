# Live Ticket Intake (GCP Staging Only)

## Required Identity

- `ticketId`: LIVE.SECURITY.CACHE_HEADERS.001
- `screenId`: SECURITY.HTTP_HEADERS
- `surface`: shared
- `title`: Missing Cache-Control headers on retailer-admin and superadmin HTML responses
- `severity`: P3

## Required Live Evidence (Section 2G)

- Staging URL or flow: https://staging.supermandi.tech/retailer/ and https://staging.supermandi.tech/admin/
- Observation timestamp (UTC/IST): 2026-02-21T01:28:00Z / 06:58 IST
- Runtime evidence:
  - HTTP response/status: HTTP 200 (pages load correctly)
  - API payload/log snippet:
    ```
    --- https://staging.supermandi.tech/retailer/ ---
    Cache-Control: (empty)
    --- https://staging.supermandi.tech/admin/ ---
    Cache-Control: (empty)
    --- https://staging.supermandi.tech/supplier/login/ ---
    Cache-Control: cache-control: s-maxage=31536000 (set)
    --- https://staging.supermandi.tech/ ---
    Cache-Control: cache-control: no-cache (set)
    ```
  - Screenshot/video path: N/A
- Active Cloud Run revision ID(s):
  - retailer-admin-00056-msv
  - superadmin-00049-ff6

## Micro Check Results (per issue context)

- UI: PASS (pages render)
- UX: PASS
- wiring: N/A
- navigation: N/A
- API contract: N/A
- backend behavior: N/A
- DB/migration impact: N/A
- GCP staging parity: WARN — inconsistent cache headers across portals

## Repro Steps

1. `curl -sI https://staging.supermandi.tech/retailer/` — observe no Cache-Control header
2. `curl -sI https://staging.supermandi.tech/admin/` — observe no Cache-Control header
3. Compare with supplier: `curl -sI https://staging.supermandi.tech/supplier/login/` — has `s-maxage=31536000`
4. Compare with landing: `curl -sI https://staging.supermandi.tech/` — has `no-cache`

## Service Mapping

- Primary service: retailer-admin, superadmin
- Secondary services: None
- Expected base path: /retailer/, /admin/

## Fix

Add `Cache-Control: no-cache` to HTML responses in retailer-admin and superadmin nginx configs to prevent stale SPA shells after deploys.

## Blockers / Dependencies

- Internal: nginx config update in retailer-admin/nginx-local-prod.conf and supermandi-superadmin Dockerfile/nginx config
- External: None
- Ops: None

## Notes

- Why this is production-impacting: Without Cache-Control, browsers or CDN may serve stale SPA shell after deployments
- Rollback-safe fix hint: Adding Cache-Control: no-cache to HTML location blocks in nginx config
