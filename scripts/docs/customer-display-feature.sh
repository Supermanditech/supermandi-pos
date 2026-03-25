#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0675 — Customer-Facing Display Feature
# ────────────────────────────────────────────────────────────────
# Documents second-screen/pole display support for customer-facing
# cart and total display using Android Presentation API.
#
# Usage:  bash scripts/docs/customer-display-feature.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'GUIDE'
================================================================
  CUSTOMER-FACING DISPLAY — SuperMandi POS
================================================================

1. ANDROID PRESENTATION API
----------------------------

  Android supports secondary displays via the Presentation API:

  Core classes:
    - android.app.Presentation — renders on secondary display
    - android.hardware.display.DisplayManager — detects displays
    - MediaRouter — routes content to secondary display

  Detection:
    DisplayManager dm = getSystemService(DisplayManager.class);
    Display[] displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
    if (displays.length > 0) {
      // Secondary display available
      showCustomerDisplay(displays[0]);
    }

  For React Native, use a native module bridge:
    - Detect secondary display availability
    - Create Presentation with custom layout
    - Send cart data from JS → native → Presentation

2. CUSTOMER DISPLAY CONTENT
-----------------------------

  Layout for customer-facing screen:

  ┌─────────────────────────────────────────┐
  │          SuperMandi POS                 │
  │         [Store Name Here]               │
  ├─────────────────────────────────────────┤
  │                                         │
  │  Item                    Qty    Amount  │
  │  ─────────────────────  ────  ────────  │
  │  Amul Butter 500g         2    ₹550.00  │
  │  Tata Salt 1kg            1     ₹24.00  │
  │  Fortune Oil 1L           1    ₹175.00  │
  │  Parle-G 800g             3     ₹90.00  │
  │                                         │
  ├─────────────────────────────────────────┤
  │  Items: 4                               │
  │  Subtotal:                    ₹839.00   │
  │  GST (5%):                     ₹41.95   │
  │                                         │
  │  ████████████████████████████████████   │
  │  ██     TOTAL: ₹880.95            ██   │
  │  ████████████████████████████████████   │
  │                                         │
  │         Thank you for shopping!         │
  └─────────────────────────────────────────┘

3. DISPLAY REQUIREMENTS
-----------------------

  Font sizes (for customer readability at arm's length):
    - Store name:    32sp
    - Item names:    24sp
    - Quantities:    24sp
    - Amounts:       24sp (bold)
    - Total:         48sp (bold, highlighted background)
    - Footer:        20sp

  Colors:
    - Background:    White (#FFFFFF)
    - Text:          Dark gray (#333333)
    - Total bar:     Brand green (#2E7D32) with white text
    - Item alternate: Light gray (#F5F5F5) striping

  Auto-scroll: If more than 8 items, auto-scroll list to show
  most recently added item.

4. DATA SYNC (JS → NATIVE → DISPLAY)
--------------------------------------

  Architecture:
    React Native (JS)
      └── NativeModule: CustomerDisplayModule
            └── Android Presentation (native)
                  └── Customer Display Layout (XML/Compose)

  Events from JS to native:
    - updateCart(items[])     — full cart state
    - addItem(item)          — single item added (animation)
    - removeItem(itemId)     — item removed
    - updateTotal(total)     — total amount changed
    - showPaymentScreen()    — payment in progress
    - showThankYou()         — transaction complete
    - showIdle()             — return to idle/welcome screen

  Idle screen content:
    - Store name + logo
    - Current date/time
    - "Welcome to [Store Name]"
    - Optional: promotional banner rotation

5. HARDWARE OPTIONS
-------------------

  Option A: Dual-screen POS device
    - Devices like Sunmi T2s have built-in customer display
    - Uses Android Presentation API natively
    - Best experience, no extra hardware

  Option B: HDMI/USB-C secondary display
    - Cheap 7-10 inch monitor via HDMI adapter
    - Android device must support DisplayPort Alt Mode
    - Works with any external monitor

  Option C: Pole display (VFD/LCD)
    - Traditional 2-line VFD displays
    - Connected via USB serial
    - Limited to showing total + last item
    - Protocol: ESC/POS subset (vendor-specific)

6. INDIAN KIRANA STORE CONTEXT
-------------------------------

  IMPORTANT: Most kirana stores use SINGLE-SCREEN POS devices.

  Typical setup:
    - One Android phone or tablet
    - Customer sees the same screen as shopkeeper
    - No space or budget for secondary display

  Target audience for this feature:
    - Larger format kirana stores with counter setup
    - Mini-supermarkets / convenience stores
    - Stores upgrading to proper POS hardware
    - Chain stores with standardized equipment

  Priority: LOW — post-launch enhancement for premium setups.

  Implementation order:
    Phase 1: Sunmi T2s dual-display support (most common POS device)
    Phase 2: HDMI external monitor support
    Phase 3: VFD pole display support (low priority)

================================================================
  END OF CUSTOMER DISPLAY FEATURE GUIDE
================================================================
GUIDE
