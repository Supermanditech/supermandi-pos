# Feature Flag & Settings Gating Audit

> Generated: 2026-01-15
> Related Ticket: UI-AUDIT-003

---

## Summary

| Area | Status |
|------|--------|
| Backend → Store sync | ✅ Working |
| Settings store usage | ✅ Consistent |
| Menu gating | ✅ Correct |
| Tab gating | ✅ Correct |
| Direct route protection | ✅ Fixed (FeatureGate added) |

---

## 1. Flag Flow Architecture

```
Backend (ui-status API)
        ↓
  GET /api/v1/pos/ui-status
        ↓
  Response: { features: { buyEnabled, reorderEnabled, ... } }
        ↓
PosRootLayout.tsx (polls every 15s)
        ↓
  useSettingsStore.getState().setBuyEnabled(buyFlag)
  useSettingsStore.getState().setReorderEnabled(reorderFlag)
        ↓
settingsStore (Zustand + AsyncStorage persistence)
        ↓
  UI Components read via useSettingsStore hooks
```

---

## 2. Feature Flags Reference

| Flag Key | Source Field | Default | Controls |
|----------|--------------|---------|----------|
| `buyEnabled` | `features.buyEnabled` or `features.ordersEnabled` | `true` | BUY tab, Purchase Orders, GRN |
| `reorderEnabled` | `features.reorderEnabled` | `false` | REORDER tab, Reorder Settings/Policies |
| `isQaMenuEnabled()` | `__DEV__` or env flag | `false` | UiShowcase screen |

---

## 3. Gating Implementation

### 3.1 Tab Bar (PosRootLayout.tsx)

```typescript
// Lines 837-842
{TABS.filter((tab) => {
  if (tab.id === "PURCHASE" && !buyEnabled) return false;
  if (tab.id === "REORDER" && !reorderEnabled) return false;
  return true;
}).map(/* render tabs */)}
```

**Status:** ✅ Correct - Tabs are filtered based on flags

### 3.2 Menu Items (MenuScreen.tsx)

```typescript
// Lines 42-44
const buyEnabled = useSettingsStore((state) => state.buyEnabled);
const reorderEnabled = useSettingsStore((state) => state.reorderEnabled);
const showPurchasingSection = buyEnabled || reorderEnabled;

// Lines 267-313 - Conditional rendering
{showPurchasingSection && (/* Purchasing section */)}
{buyEnabled && (/* Purchase Orders menu item */)}
{reorderEnabled && (/* Reorder Settings/Policies menu items */)}
```

**Status:** ✅ Correct - Menu items hidden when flags are off

### 3.3 Direct Route Protection (App.tsx)

**Before Fix:** Screens could be accessed via deep links even when feature was disabled.

**After Fix (UI-AUDIT-003):** All feature-gated screens wrapped with `<FeatureGate>`:

| Screen | Feature | Wrapper |
|--------|---------|---------|
| OrderHistory | `buy` | OrderHistoryWrapper |
| OrderDetail | `buy` | OrderDetailWrapper |
| GRN | `buy` | GRNWrapper |
| ReorderSettings | `reorder` | ReorderSettingsWrapper |
| ReorderPolicies | `reorder` | ReorderPoliciesWrapper |

**Status:** ✅ Fixed

---

## 4. New Utilities Created

### 4.1 Feature Flags Utility (`src/utils/featureFlags.ts`)

```typescript
// Check feature status imperatively
isFeatureEnabled("buy")  // returns boolean

// React hook (re-renders on change)
useFeatureEnabled("buy") // returns boolean

// Get route requirement
getRouteFeatureRequirement("OrderHistory") // returns "buy"

// Check route accessibility
isRouteAccessible("OrderHistory") // returns boolean
```

### 4.2 FeatureGate Component (`src/components/FeatureGate.tsx`)

```typescript
// Wrap protected content
<FeatureGate feature="buy" onBack={goBack}>
  <OrderHistoryScreen {...props} />
</FeatureGate>
```

When feature is disabled, shows a friendly "Feature Disabled" screen with:
- Lock icon
- Feature name
- Description of what's disabled
- "Contact support" info box
- Back button

---

## 5. Backend Sync Verification

### 5.1 ui-status API Response Shape

```typescript
interface UiStatusResponse {
  storeId?: string;
  storeName?: string;
  deviceId?: string;
  storeActive: boolean | null;
  deviceActive: boolean | null;
  pendingOutboxCount: number;
  features?: {
    scan_lookup_v2?: boolean;
    reorderEnabled?: boolean;
    buyEnabled?: boolean;
    inventoryEnabled?: boolean;
    suppliersEnabled?: boolean;
    ordersEnabled?: boolean;
  };
}
```

### 5.2 Flag Sync Logic (PosRootLayout.tsx:360-368)

```typescript
if (status.features) {
  const { setBuyEnabled, setReorderEnabled } = useSettingsStore.getState();
  // buyEnabled defaults to ordersEnabled if not explicitly set
  const buyFlag = status.features.buyEnabled ?? status.features.ordersEnabled ?? true;
  const reorderFlag = status.features.reorderEnabled ?? false;
  setBuyEnabled(buyFlag);
  setReorderEnabled(reorderFlag);
}
```

**Status:** ✅ Correct - Defaults are sensible, fallback to ordersEnabled

---

## 6. Settings Store Persistence

```typescript
// settingsStore.ts
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      buyEnabled: true,  // Default enabled
      reorderEnabled: false,  // Default disabled
      // ...
    }),
    {
      name: 'supermandi.settings.v1',
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
```

**Status:** ✅ Correct - Flags persist across app restarts, synced on next ui-status poll

---

## 7. Remaining Items (Low Priority)

### 7.1 UiShowcase Gating

The UiShowcase screen uses `isQaMenuEnabled()` at Stack.Screen level:

```typescript
{isQaMenuEnabled() && (
  <Stack.Screen name="UiShowcase" component={UiShowcaseWrapper} />
)}
```

This is stricter than FeatureGate (route doesn't exist when disabled) but could be inconsistent with other patterns. **Low priority** - current behavior is acceptable.

### 7.2 Feature Flag API Endpoint

Consider adding explicit endpoint for feature flags separate from ui-status:
`GET /api/v1/stores/{storeId}/features`

**Status:** Not blocking - current ui-status integration works fine

---

## 8. Testing Checklist

- [x] Set `buyEnabled: false` in backend → BUY tab hides
- [x] Set `reorderEnabled: false` in backend → REORDER tab hides
- [x] Navigate directly to `/OrderHistory` when buyEnabled=false → Shows "Feature Disabled"
- [x] Navigate directly to `/ReorderSettings` when reorderEnabled=false → Shows "Feature Disabled"
- [x] Menu items hide correctly when flags are off
- [x] Flags persist after app restart
- [x] Flags update on next ui-status poll (15s)

---

## Conclusion

Feature flag gating is now consistent across all entry points:

1. **Tab bar** - Tabs hidden when flag is off
2. **Menu** - Menu items hidden when flag is off
3. **Direct routes** - FeatureGate shows "Feature Disabled" screen

No screens can be accessed when the corresponding feature is disabled.
