# QA Execution Checklist (Release Gate)

### Devices covered (minimum: Sunmi V2s + 1 other)
- [ ] Sunmi V2s
- [ ] iMin Swift 2 **or** Redmi 13

### SELL scan/cart tests
- [ ] Scan 1 barcode -> item added to SELL cart
- [ ] Scan same barcode 5x -> **single row**, qty increments to 5 (no duplicate rows)
- [ ] Scan does **not** open network/settings popup
- [ ] After tapping other UI controls, scanning still works (focus recovery)

### PURCHASE scan/cart tests
- [ ] Scan 1 barcode -> item added to PURCHASE cart
- [ ] Scan same barcode 5x -> **single row**, qty increments to 5 (no duplicate rows)

### UI Verification (small screens)
- [ ] On Sunmi V2s, all required row actions/fields are reachable (scroll or compact/edit UI)
- [ ] No clipped primary action buttons (Sell/Purchase/Checkout) on Sunmi V2s

### Evidence attached
- [ ] Screenshots: SELL (1 scan, 5 scans), PURCHASE (1 scan, 5 scans)
- [ ] Proof: "No network popup on SELL scan" (video preferred)
- [ ] Screenshot: Sunmi V2s UI reachability (fields/buttons visible or reachable)

---

## QA Sign-off
- **Build/Version:** `__________`
- **Backend env (VM / prod / staging):** `__________`
- **Date:** `__________`
- **Tested by:** `__________`
- **Devices tested:** `__________`
- **Notes / known issues:** `__________`

**QA Complete / Release Gate Approved:** `YES / NO`
