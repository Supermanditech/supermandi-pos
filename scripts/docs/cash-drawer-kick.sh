#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0671 — Cash Drawer Kick ESC/POS Command
# ────────────────────────────────────────────────────────────────
# Documents ESC/POS command for opening a cash drawer and how
# to integrate it into the POS printerService.
#
# Usage:  bash scripts/docs/cash-drawer-kick.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'GUIDE'
================================================================
  CASH DRAWER KICK — ESC/POS Integration
================================================================

1. ESC/POS COMMAND
------------------

  Command:  ESC p 0 25 250
  Hex:      \x1B\x70\x00\x19\xFA
  Decimal:  27 112 0 25 250

  Byte breakdown:
    \x1B  = ESC (escape character)
    \x70  = p   (cash drawer kick command)
    \x00  = 0   (drawer pin connector: 0 = pin 2, 1 = pin 5)
    \x19  = 25  (on-time: 25 × 2ms = 50ms pulse)
    \xFA  = 250 (off-time: 250 × 2ms = 500ms wait)

  Alternative for pin 5 connector:
    \x1B\x70\x01\x19\xFA

  Note: Most thermal receipt printers with RJ-11 DK port
  support this command (Epson TM series, Star TSP series,
  generic 80mm thermal printers).

2. INTEGRATION INTO printerService.ts
--------------------------------------

  File: src/services/printerService.ts

  Add openCashDrawer() function:

    export async function openCashDrawer(): Promise<void> {
      // ESC p 0 25 250 — kick cash drawer on pin 2
      const DRAWER_KICK = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);

      const printer = await getConnectedPrinter();
      if (!printer) {
        console.warn('No printer connected — cannot open cash drawer');
        return;
      }

      try {
        await printer.write(DRAWER_KICK);
        console.log('Cash drawer kick sent');
      } catch (err) {
        console.error('Failed to kick cash drawer:', err);
        throw new Error('CASH_DRAWER_OPEN_FAILED');
      }
    }

  Call sites:
    - After successful CASH payment → auto-open drawer
    - Manual "Open Drawer" button in POS settings
    - Shift open / shift close ceremonies

3. BLUETOOTH PRINTER CONSIDERATIONS
------------------------------------

  For Bluetooth thermal printers (common in Indian kirana):
    - Send raw bytes via BLE characteristic write
    - Some Bluetooth printers ignore drawer kick commands
      (no physical RJ-11 port)
    - Test with specific printer model before enabling

  For USB OTG printers:
    - Use react-native-usb-serialport or similar
    - Send raw bytes to USB device
    - Most USB thermal printers support ESC/POS drawer kick

4. INDIAN KIRANA STORE CONTEXT
-------------------------------

  IMPORTANT: Most Indian kirana stores do NOT have cash drawers.

  Typical kirana POS setup:
    - Single Android device (phone or tablet)
    - Bluetooth thermal printer (58mm or 80mm)
    - Cash kept in simple box or drawer (manual, no solenoid)
    - No barcode scanner (manual entry or camera scan)

  Cash drawer integration is a FUTURE FEATURE for:
    - Larger format stores with proper POS counters
    - Stores upgrading to full POS hardware setup
    - Chains with standardized hardware requirements

  Implementation priority: LOW (post-launch enhancement)

5. HARDWARE COMPATIBILITY
-------------------------

  Tested drawer kick command works with:
    - Epson TM-T88 series (USB + Ethernet)
    - Star TSP100 series (USB + Bluetooth)
    - Generic 80mm thermal printers (USB + Bluetooth)
    - RONGTA RP80 series

  RJ-11 DK connector pinout:
    Pin 1: Frame GND
    Pin 2: Drawer kick drive signal 1 (use \x00)
    Pin 3: Drawer open sensor
    Pin 4: VDC (24V typically)
    Pin 5: Drawer kick drive signal 2 (use \x01)
    Pin 6: Frame GND

================================================================
  END OF CASH DRAWER KICK GUIDE
================================================================
GUIDE
