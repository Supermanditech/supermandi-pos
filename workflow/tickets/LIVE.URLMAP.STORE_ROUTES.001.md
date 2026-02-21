# Live Ticket Intake (GCP Staging Only)

## Required Identity

- `ticketId`: LIVE.URLMAP.STORE_ROUTES.001
- `screenId`: RETAILER.STORE_SCOPED
- `surface`: shared
- `title`: GCP URL map missing /s/* path rule — 24 store-scoped retailer routes return 404
- `severity`: P0

## Required Live Evidence (Section 2G)

- Staging URL or flow: https://staging.supermandi.tech/s/TEST001
- Observation timestamp (UTC/IST): 2026-02-21T01:15:14Z / 06:45 IST
- Runtime evidence:
  - HTTP response/status: HTTP 404 from nginx/1.29.5 (landing service, not retailer-admin)
  - API payload/log snippet: `<center><h1>404 Not Found</h1></center><hr><center>nginx/1.29.5</center>`
  - Screenshot/video path: N/A (CLI test)
- Active Cloud Run revision ID(s):
  - api-gateway-00054-lxt
  - main-backend-00071-654
  - retailer-admin-00056-msv
  - supplier-portal-00051-2vb
  - superadmin-00049-ff6
  - landing-00049-jld

## Micro Check Results (per issue context)

- UI: BLOCKED (page never loads)
- UX: BLOCKED
- wiring: BLOCKED
- navigation: FAIL — all 24 /s/{storeCode}/* routes return 404
- API contract: N/A (frontend routing issue)
- backend behavior: N/A
- DB/migration impact: N/A
- GCP staging parity: FAIL — URL map only has /retailer/* rule, no /s/* rule

## Repro Steps

1. Open https://staging.supermandi.tech/s/TEST001 in browser or curl
2. Observe 404 from nginx/1.29.5 (landing service default backend)
3. Verify URL map: `gcloud compute url-maps describe supermandi-staging-urlmap --project=supermandi-backend --format=json`
4. Confirm /s/* path rule is MISSING from pathMatchers.pathRules

## Service Mapping

- Primary service: retailer-admin (retailer-backend NEG)
- Secondary services: landing (incorrectly receiving /s/* traffic as default backend)
- Expected base path: /s/{storeCode}/*

## Root Cause

The GCP URL map `supermandi-staging-urlmap` has path rules for:
- `/retailer`, `/retailer/*` → retailer-backend
- `/supplier`, `/supplier/*` → supplier-backend
- `/admin`, `/admin/*` → superadmin-backend
- `/api/*` → api-gateway-backend
- `/health`, `/version` → api-gateway-backend

But NO rule for `/s`, `/s/*` → retailer-backend. Requests to `/s/*` fall through to the default service (landing-backend), which returns 404 since its nginx doesn't handle `/s/` paths.

The retailer-admin nginx config DOES have a `/s/` location block with `try_files` (T1-013 in nginx-local-prod.conf:57-66), so the fix is purely at the GCP URL map level.

## Fix

Add path rules to the URL map:
```bash
gcloud compute url-maps add-path-matcher supermandi-staging-urlmap \
  --path-rules="/s=retailer-backend,/s/*=retailer-backend" \
  --default-service=landing-backend \
  --path-matcher-name=portal-routes \
  --project=supermandi-backend
```

Or update the existing path matcher to include `/s` and `/s/*`.

## Impact

- 24 of 31 retailer routes are completely broken (77%)
- Store dashboard, products, inventory, suppliers, settings, analytics — all inaccessible
- Only 7 public routes (/retailer/, /retailer/login, etc.) work
- BLOCKS all authenticated retailer functionality

## Blockers / Dependencies

- Internal: GCP URL map update (Claude executes via scripted gcloud/infra path)
- External: None
- Ops: Final signoff only after Claude provides route recovery evidence

## Stability / Closure Criteria

- A single green smoke run is insufficient to close this P0.
- Closure requires explicit verification of `/s` and `/s/*` route behavior after remediation.
- Evidence must include repeated successful checks over multiple runs/time windows.

## Notes

- Why this is production-impacting: Retailers cannot access any store-scoped pages (dashboard, products, inventory, etc.)
- Rollback-safe fix hint: Adding a path rule is additive; if broken, remove the rule to restore previous state
