# POS Compatibility Matrix — Device & Environment Testing

> **Phase**: POS_COMPATIBILITY_MATRIX_PASS
> **Purpose**: Prove multi-device, multi-environment compatibility before production promotion
> **Rule**: Discovery only. No code changes. No fix wave. Findings appended as STG-722+.
> **Status**: PENDING

---

## Pre-Scan Risk Summary (Code Analysis)

Before operator device testing, Claude performed a code-level pre-scan across 5 dimensions.
These findings predict where compatibility issues are **most likely** to surface.

### HIGH-RISK areas (test first)

| # | Area | Code Evidence | Predicted Impact |
|---|------|--------------|-----------------|
| R1 | **Small phone (<360dp) layout overflow** | `PurchaseScreen.tsx:99` uses static `Dimensions.get()` at module scope for 3-column grid. No breakpoint below 360dp. Cards need ~100dp min each. | Product grid will overflow/truncate on 320dp devices |
| R2 | **PurchaseScreen not reactive to orientation** | `Dimensions.get("window")` at module scope, not `useWindowDimensions()` hook | Card width stale after orientation change or split-screen |
| R3 | **Camera permission denied — no settings link** | `PosRootLayout.tsx:1398-1411` shows "Allow Camera" retry but no `Linking.openSettings()` | User permanently denies camera → no way to re-enable from within app |
| R4 | **UPI payment mid-flight network drop** | `PaymentScreen.tsx:232-233` stores `pendingPaymentRef` but NOT persisted to AsyncStorage | App close during UPI confirmation → payment status lost, unrecoverable |
| R5 | **Microphone first-deny silent** | `voiceClient.ts:115` — `startRecording()` returns false; no user toast or notice | User taps voice button, nothing happens, no feedback |

### MEDIUM-RISK areas

| # | Area | Code Evidence | Predicted Impact |
|---|------|--------------|-----------------|
| R6 | System font scaling (200%+) | `maxFontSizeMultiplier: 1.2-1.3` across SellScanScreen | Text overflow in cart item rows on large font + small screen |
| R7 | Tab text on ultra-small devices | `PosRootLayout.tsx:272` compact threshold at 280dp | Devices 280-320dp get full-size tabs that may not fit |
| R8 | Printer not connected UX | `printerService.ts` returns false on failure but no persistent queue | Failed print lost; user must manually retry |
| R9 | Auto-print setting not wired | `settingsStore.ts:printerAutoPrint` exists but never read in SuccessPrintScreenV2 | Toggle does nothing — cosmetic-only setting |
| R10 | Split payment polling no max timeout | `SplitPaymentModal.tsx` polls every 2s indefinitely | Flaky network → user stuck waiting forever for UPI status |
| R11 | HID scanner focus loss | `PosRootLayout.tsx` re-focuses hidden TextInput on blur | Edge case: keyboard/modal steals focus → HID scans ignored |

### LOW-RISK areas

| # | Area | Code Evidence |
|---|------|--------------|
| R12 | DailyReportScreen uses ScrollView (not FlatList) for HTML | High-transaction stores may lag |
| R13 | No tablet-specific layouts beyond barcode sheet | iPad users get phone layout |
| R14 | Push notifications silently fail on deny | No user notice that alerts are disabled |
| R15 | Offline queue rejected events not shown to user | Silently discarded after 10 attempts |

---

## Testing Matrix

### Axis 1: Device Classes

| ID | Device Class | Suggested Device/Emulator | Width (dp) | Android Version | Priority |
|----|-------------|---------------------------|-----------|----------------|----------|
| D1 | Small phone | Android AVD: Pixel 3a (392dp) OR Galaxy A03 | <400 | Android 10-11 | **P1** |
| D2 | Normal phone | Android AVD: Pixel 6 (412dp) OR real device | 400-420 | Android 12-13 | **P1** |
| D3 | Large/tall phone | Android AVD: Pixel 7 Pro (412×892) OR Samsung S24 Ultra | 420+ | Android 14+ | **P2** |
| D4 | Low-end Android | Real device if available (2GB RAM, budget SoC) | Any | Android 10+ | **P2** |
| D5 | OEM POS device | Sunmi / PAX / Urovo if available | Varies | Android 9-12 | **P3** |

### Axis 2: Capability/Environment Variants

| ID | Variant | How to Test |
|----|---------|-------------|
| E1 | Camera GRANTED | Normal flow — allow camera permission on prompt |
| E2 | Camera DENIED | Deny camera permission when prompted. Verify HID/manual fallback works. |
| E3 | Microphone GRANTED | Allow microphone when voice button pressed |
| E4 | Microphone DENIED | Deny microphone permission. Check voice button feedback. |
| E5 | Online (stable) | Normal WiFi/mobile data connection |
| E6 | Flaky network | Toggle airplane mode every 10-15s during operations |
| E7 | Offline | Airplane mode ON for full duration of flow |
| E8 | Printer connected | WiFi/BT printer paired in Android settings |
| E9 | Printer disconnected | No printer paired / printer powered off |
| E10 | Scanner: Camera | Use CameraView barcode scanning (tap camera icon) |
| E11 | Scanner: HID/Manual | Use hardware scanner or type barcode manually |
| E12 | Scanner: Intent | DataWedge if available on OEM device |

### Axis 3: Critical Flows (10 flows)

| ID | Flow | Entry Point | Key Screens | What to Verify |
|----|------|-------------|-------------|----------------|
| F1 | **EnrollDevice** | Fresh install or cleared data | SplashScreen → EnrollDeviceScreen | QR scan → device registered → staff login appears |
| F2 | **StaffLogin** | After enrollment | StaffLoginScreen | Phone + PIN → logged in → SellScan tab visible |
| F3 | **SellScan** | Sell tab | PosRootLayout → SellScanScreen | Scan barcode → product appears in cart → qty adjust → totals correct |
| F4 | **Payment** | Checkout from cart | PaymentScreen + SplitPaymentModal | Cash/UPI/Due/Split → payment completes → success screen |
| F5 | **SuccessPrint** | After payment | SuccessPrintScreenV2 | Bill visible → Print button works → receipt prints or graceful failure |
| F6 | **Purchase** | Buy tab | BuyScreen → ProductDetailModal → PurchaseCartModal | Search product → add to cart → place order → confirmation |
| F7 | **Return** | Menu → Returns | ReturnScreen | Look up bill → select items → process return → success |
| F8 | **DailyClosing** | Menu → Daily Report | DailyReportScreen | Report loads → data shown → print/share works |
| F9 | **Chat** | Menu → Chat | ChatListScreen → ChatConversationScreen | List loads → open conversation → send message → receive response |
| F10 | **PrinterSettings** | Menu → Printer Settings | PrinterSettingsScreen | Change paper width → change copies → test print |

---

## Recording Template

**For each tested combination, record:**

```
MATRIX ROW: [row-number]
Device:      [D1-D5] — [exact device/emulator name]
Android:     [version]
Resolution:  [WxH dp] / [density]
Variant:     [E1-E12] — [description]
Flow:        [F1-F10] — [flow name]
Result:      PASS | FINDING | BLOCKED
Finding ID:  STG-[number] (if FINDING)
Details:     [exact issue description, steps to reproduce]
Screenshot:  [yes/no, filename if yes]
```

---

## Recommended Test Order (Risk-Ranked)

### Phase 1: Smoke (must pass before deeper testing)
Test on **D2 (normal phone)** with **E1+E3+E5+E8** (all permissions granted, online, printer connected):

| Row | Device | Variant | Flow | Why First |
|-----|--------|---------|------|-----------|
| 1 | D2 | E1+E5 | F1 EnrollDevice | Gate: cannot test anything else without enrollment |
| 2 | D2 | E1+E5 | F2 StaffLogin | Gate: cannot test sell/buy without login |
| 3 | D2 | E1+E5+E10 | F3 SellScan (camera) | Core POS function |
| 4 | D2 | E1+E5 | F4 Payment (cash) | Core POS function |
| 5 | D2 | E1+E5+E8 | F5 SuccessPrint | Receipt printing |
| 6 | D2 | E1+E5 | F6 Purchase | Buy flow |
| 7 | D2 | E1+E5 | F7 Return | Return flow |
| 8 | D2 | E1+E5 | F8 DailyClosing | Report flow |
| 9 | D2 | E1+E5 | F9 Chat | Chat flow |
| 10 | D2 | E1+E5+E8 | F10 PrinterSettings | Printer config |

### Phase 2: Permission Variants (camera/mic denied)
Test on **D2** with permission denials:

| Row | Device | Variant | Flow | Risk Target |
|-----|--------|---------|------|-------------|
| 11 | D2 | **E2** (camera denied) | F3 SellScan | R3: Verify manual/HID fallback works |
| 12 | D2 | **E2** | F1 EnrollDevice | QR scanning with camera denied |
| 13 | D2 | **E4** (mic denied) | F3 SellScan | R5: Verify voice button shows feedback |

### Phase 3: Network Variants (offline, flaky)
Test on **D2**:

| Row | Device | Variant | Flow | Risk Target |
|-----|--------|---------|------|-------------|
| 14 | D2 | **E7** (offline) | F3 SellScan | Offline scan + offline sale |
| 15 | D2 | **E7** | F4 Payment (cash only) | Cash payment offline |
| 16 | D2 | **E7** | F4 Payment (UPI) | R4: UPI blocked with clear message |
| 17 | D2 | **E6** (flaky) | F4 Payment (UPI) | R4: Network drop mid-UPI |
| 18 | D2 | **E6** | F3 SellScan | Product lookup during flaky network |
| 19 | D2 | **E7** | F8 DailyClosing | Report loads from cache or shows error |

### Phase 4: Printer Variants
Test on **D2**:

| Row | Device | Variant | Flow | Risk Target |
|-----|--------|---------|------|-------------|
| 20 | D2 | **E9** (printer off) | F5 SuccessPrint | R8: Graceful failure message |
| 21 | D2 | **E9** | F10 PrinterSettings | Test print fails gracefully |
| 22 | D2 | **E8** (printer on) | F5 SuccessPrint | Receipt prints correctly |

### Phase 5: Small Phone (layout stress)
Test on **D1 (small phone)**:

| Row | Device | Variant | Flow | Risk Target |
|-----|--------|---------|------|-------------|
| 23 | D1 | E1+E5 | F3 SellScan | R1: Cart layout, tab text fit |
| 24 | D1 | E1+E5 | F6 Purchase | R1: 3-column grid overflow |
| 25 | D1 | E1+E5 | F4 Payment | Split payment modal on small screen |
| 26 | D1 | E1+E5 | F7 Return | Wizard steps on small screen |

### Phase 6: Large Phone
Test on **D3 (large phone)**:

| Row | Device | Variant | Flow | Risk Target |
|-----|--------|---------|------|-------------|
| 27 | D3 | E1+E5 | F3 SellScan | Layout doesn't feel sparse |
| 28 | D3 | E1+E5 | F6 Purchase | Grid cards reasonable size |
| 29 | D3 | E1+E5 | F4 Payment | QR code visible, timer readable |

### Phase 7: Low-End Android (performance)
Test on **D4 (low-end)** if available:

| Row | Device | Variant | Flow | Risk Target |
|-----|--------|---------|------|-------------|
| 30 | D4 | E1+E5 | F3 SellScan | Scroll smoothness, camera preview lag |
| 31 | D4 | E1+E5 | F4 Payment | Payment screen render time |
| 32 | D4 | E1+E5+E10 | F3 SellScan (camera scan) | Camera barcode detection speed |

### Phase 8: Scanner Variants
Test on **D2** (or D5 if OEM available):

| Row | Device | Variant | Flow | Risk Target |
|-----|--------|---------|------|-------------|
| 33 | D2 | **E11** (HID/manual) | F3 SellScan | Manual barcode entry works |
| 34 | D5 | **E12** (intent) | F3 SellScan | DataWedge intent scanning |
| 35 | D5 | **E11** (HID) | F3 SellScan | HID scanner detection + scan |

---

## Total Matrix Size

| Phase | Rows | Priority |
|-------|------|----------|
| Phase 1: Smoke | 10 | **P0 — must pass** |
| Phase 2: Permissions | 3 | **P1** |
| Phase 3: Network | 6 | **P1** |
| Phase 4: Printer | 3 | **P1** |
| Phase 5: Small phone | 4 | **P1** |
| Phase 6: Large phone | 3 | **P2** |
| Phase 7: Low-end | 3 | **P2** |
| Phase 8: Scanner variants | 3 | **P3** (if OEM available) |
| **TOTAL** | **35** | |

---

## Results Log

> Operator fills this section during testing. One entry per row.

### Phase 1: Smoke

| Row | Device | Android | Resolution | Variant | Flow | Result | Finding | Details |
|-----|--------|---------|-----------|---------|------|--------|---------|---------|
| 1 | | | | E1+E5 | F1 EnrollDevice | | | |
| 2 | | | | E1+E5 | F2 StaffLogin | | | |
| 3 | | | | E1+E5+E10 | F3 SellScan | | | |
| 4 | | | | E1+E5 | F4 Payment | | | |
| 5 | | | | E1+E5+E8 | F5 SuccessPrint | | | |
| 6 | | | | E1+E5 | F6 Purchase | | | |
| 7 | | | | E1+E5 | F7 Return | | | |
| 8 | | | | E1+E5 | F8 DailyClosing | | | |
| 9 | | | | E1+E5 | F9 Chat | | | |
| 10 | | | | E1+E5+E8 | F10 PrinterSettings | | | |

### Phase 2: Permission Variants

| Row | Device | Android | Resolution | Variant | Flow | Result | Finding | Details |
|-----|--------|---------|-----------|---------|------|--------|---------|---------|
| 11 | | | | E2 | F3 SellScan | | | |
| 12 | | | | E2 | F1 EnrollDevice | | | |
| 13 | | | | E4 | F3 SellScan | | | |

### Phase 3: Network Variants

| Row | Device | Android | Resolution | Variant | Flow | Result | Finding | Details |
|-----|--------|---------|-----------|---------|------|--------|---------|---------|
| 14 | | | | E7 | F3 SellScan | | | |
| 15 | | | | E7 | F4 Payment (cash) | | | |
| 16 | | | | E7 | F4 Payment (UPI) | | | |
| 17 | | | | E6 | F4 Payment (UPI) | | | |
| 18 | | | | E6 | F3 SellScan | | | |
| 19 | | | | E7 | F8 DailyClosing | | | |

### Phase 4: Printer Variants

| Row | Device | Android | Resolution | Variant | Flow | Result | Finding | Details |
|-----|--------|---------|-----------|---------|------|--------|---------|---------|
| 20 | | | | E9 | F5 SuccessPrint | | | |
| 21 | | | | E9 | F10 PrinterSettings | | | |
| 22 | | | | E8 | F5 SuccessPrint | | | |

### Phase 5: Small Phone

| Row | Device | Android | Resolution | Variant | Flow | Result | Finding | Details |
|-----|--------|---------|-----------|---------|------|--------|---------|---------|
| 23 | | | | E1+E5 | F3 SellScan | | | |
| 24 | | | | E1+E5 | F6 Purchase | | | |
| 25 | | | | E1+E5 | F4 Payment | | | |
| 26 | | | | E1+E5 | F7 Return | | | |

### Phase 6: Large Phone

| Row | Device | Android | Resolution | Variant | Flow | Result | Finding | Details |
|-----|--------|---------|-----------|---------|------|--------|---------|---------|
| 27 | | | | E1+E5 | F3 SellScan | | | |
| 28 | | | | E1+E5 | F6 Purchase | | | |
| 29 | | | | E1+E5 | F4 Payment | | | |

### Phase 7: Low-End Android

| Row | Device | Android | Resolution | Variant | Flow | Result | Finding | Details |
|-----|--------|---------|-----------|---------|------|--------|---------|---------|
| 30 | | | | E1+E5 | F3 SellScan | | | |
| 31 | | | | E1+E5 | F4 Payment | | | |
| 32 | | | | E1+E5+E10 | F3 SellScan | | | |

### Phase 8: Scanner Variants

| Row | Device | Android | Resolution | Variant | Flow | Result | Finding | Details |
|-----|--------|---------|-----------|---------|------|--------|---------|---------|
| 33 | | | | E11 | F3 SellScan | | | |
| 34 | | | | E12 | F3 SellScan | | | |
| 35 | | | | E11 | F3 SellScan | | | |

---

## Findings Log

> New findings start at STG-722. Append here.

| ID | Row | Severity | Summary | Steps to Reproduce | Screenshot |
|----|-----|----------|---------|-------------------|-----------|
| | | | | | |

---

## Sign-Off

- [ ] Phase 1 Smoke: All 10 rows PASS
- [ ] Phase 2 Permissions: All 3 rows PASS or FINDING logged
- [ ] Phase 3 Network: All 6 rows PASS or FINDING logged
- [ ] Phase 4 Printer: All 3 rows PASS or FINDING logged
- [ ] Phase 5 Small Phone: All 4 rows PASS or FINDING logged
- [ ] Phase 6 Large Phone: All 3 rows PASS or FINDING logged
- [ ] Phase 7 Low-End: All 3 rows PASS or FINDING logged (or N/A if no device)
- [ ] Phase 8 Scanner: All 3 rows PASS or FINDING logged (or N/A if no OEM device)

**Matrix PASS**: All P0+P1 phases signed off (Phases 1-5, 22 rows minimum).
**Matrix COMPLETE**: All 8 phases signed off (35 rows total).

---

*Generated by Claude Code — POS_COMPATIBILITY_MATRIX_PASS phase*
