# MICRO-BATCH-13: Fix-to-Green Report

**Batch**: MICRO-BATCH-13 — Cross-Cutting Polish (9 issues)
**Gate**: `pnpm -r typecheck` = 0 errors / 22 projects
**Risk**: LOW — additive polish, no API contract changes

---

## Issues Fixed

| # | Issue | Priority | What Changed | Files |
|---|-------|----------|-------------|-------|
| 1 | ISSUE-MICRO-104 | P3 | Health check start_period 5s → 10s for 3 static frontends | `scripts/docker-compose.local-prod.yml` |
| 2 | ISSUE-MICRO-103 | P3 | Sync batch size 50 → 20 for low-memory POS devices | `src/services/offline/sync.ts` |
| 3 | ISSUE-MICRO-107 | P3 | 30s AbortController timeout: retailer authFetch + all 11 superadmin API files | `retailer-admin/src/lib/api.ts`, `supermandi-superadmin/src/api/*.ts` (11 files) |
| 4 | ISSUE-MICRO-051 | P2 | Inline min-length hint for account number (9-digit minimum) | `supplier-portal/src/app/(dashboard)/kyc/page.tsx` |
| 5 | ISSUE-MICRO-080 | P2 | Auth storage strategy documentation (per-surface) | `docs/AUTH_STORAGE_STRATEGY.md` (NEW) |
| 6 | ISSUE-MICRO-087 | P2 | POS outbox count from local SQLite instead of server API | `src/screens/PosRootLayout.tsx` |
| 7 | ISSUE-MICRO-085 | P2 | Upload progress bar during CSV processing | `supplier-portal/src/app/(dashboard)/upload/page.tsx` |
| 8 | ISSUE-MICRO-105 | P3 | ErrorBoundary components wrapping App root | `retailer-admin/src/components/ErrorBoundary.tsx` (NEW), `retailer-admin/src/App.tsx`, `supermandi-superadmin/src/components/ErrorBoundary.tsx` (NEW), `supermandi-superadmin/src/App.tsx` |
| 9 | ISSUE-MICRO-106 | P3 | Skeleton loading fallback replacing "Loading..." text | `retailer-admin/src/App.tsx` |

---

## Blackbox Verification Tests

1. **Docker health checks**: `docker compose -f scripts/docker-compose.local-prod.yml config | grep start_period` → all 3 static frontends show `10s`
2. **API timeout (retailer)**: Open retailer admin → network requests should abort after 30s on slow connections
3. **API timeout (superadmin)**: Open superadmin → API calls use `fetchWithTimeout` (30s default)
4. **KYC validation**: Go to supplier portal KYC → enter <9 digit account → see "must be at least 9 digits" hint
5. **Error boundary**: Force a render error → should see "Something went wrong" with refresh button
6. **Skeleton loading**: Navigate between lazy-loaded retailer pages → should see skeleton blocks instead of "Loading..."
7. **Upload progress**: Go to supplier upload → upload a CSV → should see progress bar during processing
8. **POS outbox**: POS status bar shows local outbox count from SQLite (not server's 0)

---

## Files Changed (18 modified, 3 new)

### Modified
- `scripts/docker-compose.local-prod.yml` — 3 start_period changes
- `src/services/offline/sync.ts` — batch size 50→20
- `src/screens/PosRootLayout.tsx` — import + use local outbox count
- `retailer-admin/src/lib/api.ts` — AbortController timeout
- `retailer-admin/src/App.tsx` — ErrorBoundary + skeleton fallback
- `supplier-portal/src/app/(dashboard)/kyc/page.tsx` — min length hint
- `supplier-portal/src/app/(dashboard)/upload/page.tsx` — progress bar
- `supermandi-superadmin/src/App.tsx` — ErrorBoundary wrapper
- `supermandi-superadmin/src/api/authToken.ts` — fetchWithTimeout utility
- `supermandi-superadmin/src/api/stores.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/users.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/devices.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/suppliers.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/analytics.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/health.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/settings.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/documents.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/ai.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/audit.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/barcodeSheets.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/posEvents.ts` — use fetchWithTimeout
- `supermandi-superadmin/src/api/deviceEnrollments.ts` — use fetchWithTimeout

### New
- `docs/AUTH_STORAGE_STRATEGY.md` — auth storage documentation
- `retailer-admin/src/components/ErrorBoundary.tsx` — React error boundary
- `supermandi-superadmin/src/components/ErrorBoundary.tsx` — React error boundary

---

## Regression Risk Assessment

| Change | Risk | Reason |
|--------|------|--------|
| Health check start_period | None | Only affects container startup grace window |
| Sync batch size 50→20 | None | Reduces memory pressure, same behavior |
| API timeout 30s | Very Low | AbortController respects existing signal if provided |
| Account number hint | None | Additive UI, submit validation unchanged |
| Auth docs | None | Documentation only |
| Local outbox count | None | Reads from existing SQLite query |
| Upload progress bar | None | Additive UI element |
| Error boundaries | None | Only catches otherwise-unhandled errors |
| Skeleton loading | None | Visual-only change to loading state |
