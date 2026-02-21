# Live Ticket Intake (GCP Staging Only)

## Required Identity

- `ticketId`: LIVE.SUPPLIER.FAVICON_PATH.001
- `screenId`: SUPPLIER.ASSETS
- `surface`: supplier_web
- `title`: Supplier portal favicon link points to /favicon.svg (root) instead of /supplier/favicon.svg
- `severity`: P3

## Required Live Evidence (Section 2G)

- Staging URL or flow: https://staging.supermandi.tech/supplier/login/
- Observation timestamp (UTC/IST): 2026-02-21T01:47:00Z / 07:17 IST
- Runtime evidence:
  - HTTP response/status: HTML contains `<link rel="icon" href="/favicon.svg"/>` — missing /supplier/ prefix
  - API payload/log snippet: Browser requests https://staging.supermandi.tech/favicon.svg which goes to landing service
  - Screenshot/video path: N/A
- Active Cloud Run revision ID(s):
  - supplier-portal-00051-2vb

## Micro Check Results (per issue context)

- UI: WARN — favicon may not display in browser tab
- UX: PASS (minor visual only)
- wiring: N/A
- navigation: N/A
- API contract: N/A
- backend behavior: N/A
- DB/migration impact: N/A
- GCP staging parity: WARN — asset path inconsistency

## Repro Steps

1. Open https://staging.supermandi.tech/supplier/login/ in browser
2. Check browser tab — favicon may be missing or show wrong icon
3. View page source: `<link rel="icon" href="/favicon.svg"/>` — no /supplier/ prefix
4. Verify: GET /favicon.svg → 404 (landing service doesn't have it), GET /supplier/favicon.svg → 200

## Service Mapping

- Primary service: supplier-portal
- Secondary services: None
- Expected base path: /supplier/

## Fix

Update Next.js config to use basePath-aware favicon: ensure `next.config.js` basePath `/supplier` is applied to the favicon link, or explicitly set `<link rel="icon" href="/supplier/favicon.svg"/>` in the layout.

## Blockers / Dependencies

- Internal: Next.js configuration
- External: None
- Ops: None

## Notes

- Why this is production-impacting: Minor — favicon may not display in browser tab
- Rollback-safe fix hint: Update favicon href in layout.tsx or next.config.js
