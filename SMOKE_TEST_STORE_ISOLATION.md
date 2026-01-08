# Smoke Test: Store Checkout Isolation (C4)

Date:
Tester:
Device:
App build (APK/version/commit):
Backend build/commit:

Prereqs:
- Store A and Store B exist and are active.
- Device can enroll to both stores.
- scan_lookup_v2 enabled for the device or both stores (if testing v2 scan flow).

Test Data:
- Barcode / scan text:
- Expected Store A price/stock (if known):
- Expected Store B price/stock (if known):

Steps
1) Store A scan + sell
- Enroll device to Store A.
- Scan the test barcode.
- Verify cart shows Store A details (name/price/stock).
- Complete checkout (Cash or Due).
- Capture evidence (screenshot + log snippet).

2) Store B scan + sell
- Re-enroll device to Store B (clear/switch cache as needed).
- Scan the same barcode.
- Verify cart shows Store B details (name/price/stock), not Store A.
- Complete checkout.
- Capture evidence (screenshot + log snippet).

Verification Checklist
- Store A checkout succeeds with Store A data.
- Store B checkout succeeds with Store B data.
- No cross-store joins in backend logs (store_id matches store for each sale item).

Results
- Store A saleId:
- Store B saleId:
- Backend log snippet (store_id + saleId + variant/global info):
  - 
- Screenshots:
  - screenshots/store-a-checkout.png
  - screenshots/store-b-checkout.png

Notes:
- 
