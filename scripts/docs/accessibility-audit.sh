#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0648 — WCAG AA Accessibility Audit Documentation
# ────────────────────────────────────────────────────────────────
# Documents WCAG AA compliance checks for critical POS screens.
# Run this script to see the audit checklist and testing guidance.
#
# Usage:  bash scripts/docs/accessibility-audit.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'AUDIT'
================================================================
  WCAG AA ACCESSIBILITY AUDIT — SuperMandi POS
================================================================

1. CRITICAL SCREENS TO AUDIT (Priority Order)
----------------------------------------------

  Screen 1: Login / PIN Entry
    - High contrast between input fields and background
    - Touch targets for PIN digits >= 44x44 dp
    - Screen reader labels on all input fields
    - Error messages announced to assistive technology
    - Focus management: auto-focus first field on mount

  Screen 2: Sell / Home Screen
    - Barcode scan button: minimum 44x44 dp touch target
    - Product search input: accessible label + placeholder
    - Cart item list: each item row has accessible description
    - Quantity +/- buttons: labeled for screen readers
    - Category tabs: keyboard/switch navigation support

  Screen 3: Payment Screen
    - Payment method buttons: minimum 44x44 dp, clear labels
    - Amount display: large text (>= 18sp), high contrast
    - Cash tendered input: labeled, numeric keyboard
    - UPI/card selection: accessible radio group pattern
    - Confirm button: distinct color, >= 44x44 dp

  Screen 4: Payment Success / Receipt
    - Success state: non-color-only indicator (icon + text)
    - Receipt details: readable at 200% zoom
    - Print/share buttons: labeled with action description
    - New sale button: prominent, accessible

  Screen 5: Settings
    - Toggle switches: labeled with current state
    - Language selector: accessible dropdown
    - Logout button: clearly labeled, confirmation dialog
    - Store info: readable text hierarchy

2. COLOR CONTRAST REQUIREMENTS (WCAG AA)
-----------------------------------------

  Normal text (< 18sp):      minimum 4.5:1 ratio
  Large text (>= 18sp bold): minimum 3:1 ratio
  UI components & icons:     minimum 3:1 ratio

  Key colors to verify:
    - Primary action buttons (green #4CAF50 on white: 3.1:1 — MAY NEED darkening)
    - Error text (red on white/light background)
    - Disabled state text (must still be readable)
    - Link text vs body text (distinguishable without color alone)

  Tools for testing:
    - Android: Accessibility Scanner app (Google Play)
    - Manual: https://webaim.org/resources/contrastchecker/
    - Automated: react-native-a11y or eslint-plugin-jsx-a11y

3. TOUCH TARGET SIZE REQUIREMENTS
-----------------------------------

  Minimum touch target: 44x44 dp (iOS) / 48x48 dp (Material Design)
  Recommended:          48x48 dp for all interactive elements

  Common violations to check:
    - Small icon buttons (close, delete, edit)
    - Inline text links
    - Checkbox/radio inputs
    - Tab bar items
    - Quantity stepper +/- buttons

4. SCREEN READER LABELS
-------------------------

  React Native accessibility props to verify on every interactive element:
    - accessible={true}
    - accessibilityLabel="descriptive text"
    - accessibilityRole="button" | "link" | "header" | "search" | etc.
    - accessibilityState={{ disabled, selected, checked }}
    - accessibilityHint="what happens when activated" (for non-obvious actions)

  Must NOT have:
    - Images without accessibilityLabel
    - Decorative images without accessible={false}
    - Buttons with only icon (no label)
    - Dynamic content changes without accessibilityLiveRegion

5. KEYBOARD / SWITCH NAVIGATION
---------------------------------

  All screens must support:
    - Tab order follows visual layout (top-to-bottom, left-to-right)
    - Focus indicator visible on focused element
    - No keyboard traps (can always move forward/backward)
    - Modal dialogs trap focus within dialog until dismissed
    - Hardware keyboard support for POS terminal use

6. TESTING PROCEDURE
---------------------

  Step 1: Enable TalkBack (Android) or VoiceOver (iOS)
  Step 2: Navigate each critical screen using ONLY screen reader
  Step 3: Verify all interactive elements are announced
  Step 4: Verify all state changes are announced
  Step 5: Run Android Accessibility Scanner on each screen
  Step 6: Document findings with screenshot + severity

  Severity levels:
    CRITICAL: Blocks usage for assistive tech users (e.g., unlabeled login button)
    HIGH:     Major difficulty (e.g., low contrast error text)
    MEDIUM:   Inconvenience (e.g., missing hint text)
    LOW:      Enhancement (e.g., reading order optimization)

================================================================
  END OF AUDIT CHECKLIST
================================================================
AUDIT

echo ""
echo "To run automated checks (if eslint-plugin-jsx-a11y is installed):"
echo "  npx eslint --rule 'jsx-a11y/*: warn' src/screens/"
echo ""
echo "To test with Android Accessibility Scanner:"
echo "  1. Install from Google Play on test device"
echo "  2. Enable in Settings > Accessibility"
echo "  3. Open SuperMandi POS and tap the scanner overlay on each screen"
