# V3 Screen Registry — Source of Truth Lock

> **UI Reference**: https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html
> **HEAD**: d74749d3 | **103 fixes** | Zero drift
> **Protocol**: Lock one screen → complete 100% → unlock next

---

## All 27 Screens (from Prototype)

| # | Screen ID | Screen Name | Code File | Status |
|---|-----------|-------------|-----------|--------|
| 1 | `splash` | Splash / Loading | SplashScreenV3.tsx | LOCK |
| 2 | `login` | Phone + OTP Auth | PhoneScreenV3.tsx + OTPScreenV3.tsx | PENDING |
| 3 | `sell` | Sell (Product Grid) | SellScreenV3.tsx | PENDING |
| 4 | `search` | Universal Search | UniversalSearchV3.tsx | PENDING |
| 5 | `cart` | Cart Sheet | CartSheetV3.tsx | PENDING |
| 6 | `voice` | Voice Input | VoiceOverlayV3.tsx | PENDING |
| 7 | `scan` | Barcode Scanner | ScanScreenV3.tsx | PENDING |
| 8 | `newprod` | New Product Entry | NewProductScreenV3.tsx | PENDING |
| 9 | `payment` | Payment Hub | PaymentScreenV3.tsx | PENDING |
| 10 | `cash` | Cash Payment | PaymentScreenV3.tsx (cash tab) | PENDING |
| 11 | `upi` | UPI Payment | PaymentScreenV3.tsx (UPI tab) | PENDING |
| 12 | `udhar` | Udhar/Due Payment | PaymentScreenV3.tsx (due tab) | PENDING |
| 13 | `success` | Sale Success | SuccessScreenV3.tsx | PENDING |
| 14 | `buy` | Supplier Catalogue | BuyScreenV3.tsx | PENDING |
| 15 | `compare` | Price Comparison | CompareScreenV3.tsx | PENDING |
| 16 | `counter` | Counter Purchase | CounterPurchaseScreenV3.tsx | PENDING |
| 17 | `store` | Store Hub | StoreHubScreenV3.tsx | PENDING |
| 18 | `grn` | Goods Received Note | GRNScreenV3.tsx | PENDING |
| 19 | `reorder` | Reorder Suggestions | ReorderScreenV3.tsx | PENDING |
| 20 | `more` | More / Dashboard | MoreScreenV3.tsx | PENDING |
| 21 | `khata` | Khata / Credit Book | KhataScreenV3.tsx | PENDING |
| 22 | `finance` | Credit & Finance | FinanceScreenV3.tsx | PENDING |
| 23 | `reports` | Reports | ReportsScreenV3.tsx | PENDING |
| 24 | `stock` | Stock & Inventory | StockScreenV3.tsx | PENDING |
| 25 | `customers` | Customers | CustomersScreenV3.tsx | PENDING |
| 26 | `sales` | Sales History | (sub-screen of More) | PENDING |
| 27 | `settings` | Settings | SettingsScreenV3.tsx | PENDING |

---

## Lock Protocol

For each screen, the following 12 dimensions MUST be 100% complete before unlocking:

### Dimension Checklist

| # | Dimension | What Must Be Defined |
|---|-----------|---------------------|
| D1 | **User Interactions** | Every tap, swipe, scroll, input, scan, voice action |
| D2 | **UI/UX States** | Loading, success, empty, error, offline, disabled |
| D3 | **Navigation** | All entry points, exit points, back behavior, deep links |
| D4 | **API Contracts** | Every endpoint called: method, path, request, response |
| D5 | **Backend Services** | Express routes, controllers, validation, authorization |
| D6 | **Database** | Tables, columns, indexes, constraints, migrations |
| D7 | **Business Logic** | Validation rules, calculations, domain invariants |
| D8 | **Edge Cases** | Network failure, concurrent access, invalid input, timeout |
| D9 | **Offline** | What works offline, outbox sync, cache strategy |
| D10 | **GCP Parity** | Cloud Run compatibility, env vars, secrets |
| D11 | **Cross-Role** | How Retailer/Supplier/SuperAdmin interact with this screen's data |
| D12 | **Production Tickets** | Specific implementation tickets derived from above |

---

## SCREEN 1: SPLASH (LOCKED)

### D1: User Interactions
| # | Interaction | Trigger | Result |
|---|------------|---------|--------|
| 1.1 | App launches | System | Show animated logo + "Connecting to store..." |
| 1.2 | Session check completes (has token) | Auto | Navigate to SELL (4-tab POS) |
| 1.3 | Session check completes (no token) | Auto | Navigate to LOGIN (Phone screen) |
| 1.4 | Device blocked | Auto | Navigate to DeviceBlocked screen |
| 1.5 | Force update needed | Auto | Navigate to ForceUpdate screen |
| 1.6 | Network timeout | Auto 5s | Show "Continue Offline" button |
| 1.7 | Tap "Continue" | User tap | Navigate based on session state |

### D2: UI/UX States
| State | Visual |
|-------|--------|
| Loading | SuperMandi logo (spring animation), spinning loader, "Connecting to store..." |
| Success | Logo completes animation, brief "Ready!" text, auto-navigate |
| Error | "Something went wrong" + Retry button |
| Offline | "Continue Offline" button appears after 5s timeout |

### D3: Navigation
| From | To | Condition |
|------|-----|-----------|
| App launch | Splash | Always (initial route) |
| Splash | SELL (PosRootLayoutV3) | Has valid device token + session |
| Splash | LOGIN (PhoneScreenV3) | No device token |
| Splash | DeviceBlocked | Device deactivated by admin |
| Splash | ForceUpdate | App version below minimum |

### D4: API Contracts
| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/api/v1/pos/ui-status` | GET | Check device status + version | Header: `Authorization: Bearer <token>` | `{ deviceActive: bool, minAppVersion: string, forceUpdate: bool }` |

### D5: Backend Services
- `uiStatusApi.ts` → `fetchUiStatusStrict()` — throws on error (gate screen behavior)
- `deviceSession.ts` → `getDeviceToken()` — reads AsyncStorage for persisted device token

### D6: Database
- No direct DB access from splash
- Backend reads `devices` table to check `active` status

### D7: Business Logic
- Minimum splash display: 1.2 seconds (brand impression)
- Session token validated locally first (exists?), then server-side (active?)
- If offline and has cached session → proceed to POS (offline-first)
- If offline and no session → show Phone screen (can't auth offline)

### D8: Edge Cases
| Case | Handling |
|------|----------|
| Slow network (>5s) | Show "Continue Offline" button |
| Invalid/expired token | Clear token, navigate to Phone |
| Server 500 | Retry once, then offline fallback |
| Font loading failure | Proceed anyway (system fonts) |
| App killed during splash | Next launch restarts normally |

### D9: Offline
- AsyncStorage token check works offline ✓
- Server status check fails gracefully → offline fallback ✓
- If cached session exists → allow POS access offline

### D10: GCP Parity
- `/api/v1/pos/ui-status` must exist on Cloud Run
- Currently deployed: YES (existing endpoint at `81c3a2a4`)
- No new deployment needed for splash

### D11: Cross-Role
| Role | Interaction |
|------|------------|
| Retailer POS | Direct — this is their entry point |
| SuperAdmin | Can deactivate device → splash shows DeviceBlocked |
| Supplier | No interaction with POS splash |

### D12: Production Tickets
| Ticket | Description | Status |
|--------|-------------|--------|
| V3-047 | SplashScreenV3 animated logo + session check + routing | DONE ✓ |
| V3-035 | Replace enrollment with Phone+OTP auth flow | DONE ✓ |
| V3-036 | Instant splash → phone screen, white native splash | DONE ✓ |

### Current Code Status
- **File**: `src/screens/v3/SplashScreenV3.tsx` (98 lines)
- **Animated logo**: Spring scale + opacity ✓
- **Spinning loader**: Animated rotation ✓
- **Session check**: `getDeviceToken()` + `fetchUiStatusStrict()` ✓
- **Routing**: phone/pos/blocked/update ✓
- **Offline fallback**: Proceeds to POS if has cached session ✓
- **1.2s minimum display**: Timer-based ✓

### VERDICT: SCREEN 1 COMPLETE ✅
All 12 dimensions covered. No missing interactions, logic, or dependencies.

---
