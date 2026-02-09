# SA-P0-005 + SA-P1-007: Runtime Proofs

**Date:** 2026-02-09
**Branch:** feat/sa-p0-005-p1-007-feature-flags
**Head SHA:** d88e4e0
**Docker rebuild:** main-backend + superadmin rebuilt from branch HEAD

---

## Proof 1: GET global flags (11 flags: 7 canonical + 4 legacy)

```
curl.exe -s "http://localhost:3010/api/v1/admin/feature-flags" -H "x-admin-token: local-test-token"
```

**Response (200):**
```json
{"flags":[
  {"flag_key":"bnplEnabled","enabled":true,"description":"Buy Now Pay Later — supplier credit drawdowns","updated_at":"2026-02-09T15:59:43.938Z"},
  {"flag_key":"buyEnabled","enabled":true,"description":"BUY tab — purchase ordering from suppliers","updated_at":"2026-02-09T15:59:43.938Z"},
  {"flag_key":"categoryBrowsingEnabled","enabled":true,"description":"Category browsing rail in SELL tab","updated_at":"2026-02-09T15:59:43.938Z"},
  {"flag_key":"creditEnabled","enabled":true,"description":"Credit/Loans — consumer credit offers","updated_at":"2026-02-09T15:59:43.938Z"},
  {"flag_key":"multi_supplier","enabled":true,"description":"Allow stores to link multiple suppliers","updated_at":"2026-02-08T12:30:53.037Z"},
  {"flag_key":"offline_mode","enabled":true,"description":"Enable offline POS operations","updated_at":"2026-02-08T12:30:53.037Z"},
  {"flag_key":"reorderEnabled","enabled":true,"description":"REORDER tab — automated reorder suggestions","updated_at":"2026-02-09T15:59:43.938Z"},
  {"flag_key":"reorder_system","enabled":true,"description":"Enable automated reorder suggestions","updated_at":"2026-02-08T12:30:53.037Z"},
  {"flag_key":"scanLookupV2","enabled":true,"description":"Scan Lookup V2 — enhanced barcode resolution","updated_at":"2026-02-09T15:59:43.938Z"},
  {"flag_key":"scan_lookup_v2","enabled":true,"description":"Enable V2 barcode lookup with fuzzy matching","updated_at":"2026-02-08T12:30:53.037Z"},
  {"flag_key":"voiceEnabled","enabled":true,"description":"Voice assistant — AI-powered voice ordering","updated_at":"2026-02-09T15:59:43.938Z"}
]}
```

**Verdict:** PASS — 7 canonical seeds + 4 legacy flags present, all enabled.

---

## Proof 2: PATCH kill buyEnabled (global kill switch)

```
curl.exe -s -X PATCH "http://localhost:3010/api/v1/admin/feature-flags/buyEnabled" -H "Content-Type: application/json" -H "x-admin-token: local-test-token" -d '{"enabled":false}'
```

**Response (200):**
```json
{"flag":{"flag_key":"buyEnabled","enabled":false,"description":"BUY tab — purchase ordering from suppliers","updated_at":"2026-02-09T16:02:18.659Z"}}
```

**Verdict:** PASS — global flag toggled to false.

---

## Proof 3: GET ui-status reflects kill switch

```
curl.exe -s "http://localhost:3010/api/v1/pos/ui-status" -H "X-Device-Token: demo-smoke-test-token-001"
```

**Response (200, features excerpt):**
```json
{
  "features": {
    "scan_lookup_v2": true,
    "buyEnabled": false,
    "reorderEnabled": true,
    "inventoryEnabled": true,
    "suppliersEnabled": true,
    "bnplEnabled": false,
    "creditEnabled": false,
    "voiceEnabled": true,
    "categoryBrowsingEnabled": true,
    "ordersEnabled": false
  }
}
```

**Verdict:** PASS — `buyEnabled: false` + legacy alias `ordersEnabled: false` both reflect kill.

---

## Proof 4: PATCH restore buyEnabled

```
curl.exe -s -X PATCH "http://localhost:3010/api/v1/admin/feature-flags/buyEnabled" -H "Content-Type: application/json" -H "x-admin-token: local-test-token" -d '{"enabled":true}'
```

**Response (200):**
```json
{"flag":{"flag_key":"buyEnabled","enabled":true,"description":"BUY tab — purchase ordering from suppliers","updated_at":"2026-02-09T16:02:18.951Z"}}
```

**Verdict:** PASS — restored to enabled.

---

## Proof 5: Unknown flag_key rejected (typo safety)

```
curl.exe -s -X PATCH "http://localhost:3010/api/v1/admin/feature-flags/buyEnabld" -H "Content-Type: application/json" -H "x-admin-token: local-test-token" -d '{"enabled":false}'
```

**Response (400):**
```json
{"error":"invalid_feature_key","valid_keys":["buyEnabled","reorderEnabled","voiceEnabled","bnplEnabled","creditEnabled","categoryBrowsingEnabled","scanLookupV2"]}
```

**Verdict:** PASS — typo rejected with 400 + valid keys listed. No phantom row created.

---

## Summary

| # | Test | Result |
|---|------|--------|
| 1 | GET global flags | PASS |
| 2 | PATCH kill buyEnabled | PASS |
| 3 | ui-status reflects kill | PASS |
| 4 | PATCH restore buyEnabled | PASS |
| 5 | Unknown flag_key rejected | PASS |

**All 5 runtime proofs PASS.**
