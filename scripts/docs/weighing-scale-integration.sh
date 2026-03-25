#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0674 — Weighing Scale Bluetooth Integration
# ────────────────────────────────────────────────────────────────
# Documents Bluetooth weighing scale protocol, BLE service UUIDs,
# weight data parsing, and supported scale brands.
#
# Usage:  bash scripts/docs/weighing-scale-integration.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'GUIDE'
================================================================
  WEIGHING SCALE BLUETOOTH INTEGRATION — SuperMandi POS
================================================================

1. BLE SERVICE UUID FOR WEIGHT DATA
------------------------------------

  Common BLE UUIDs used by weighing scales:

  Weight Measurement Service:
    Service UUID:        0000181D-0000-1000-8000-00805F9B34FB
    (standard Bluetooth SIG "Weight Scale" service)

  Weight Measurement Characteristic:
    Characteristic UUID: 00002A9D-0000-1000-8000-00805F9B34FB
    Properties:          Indicate (subscribe for notifications)

  Some scales use proprietary UUIDs:
    Essae:   Service 0000FFF0-..., Char 0000FFF1-...
    Sansui:  Service 0000FFE0-..., Char 0000FFE1-...

  Discovery approach:
    1. Scan for BLE devices with name containing "SCALE" or "WS"
    2. Connect and enumerate services
    3. Look for standard 181D or known proprietary UUIDs
    4. Subscribe to weight characteristic notifications

2. PARSING WEIGHT VALUE FROM CHARACTERISTIC
--------------------------------------------

  Standard Bluetooth Weight Measurement (0x2A9D):
    Byte layout:
      [0]     Flags (bit field)
      [1-2]   Weight (uint16, little-endian)

    Flags byte:
      Bit 0: 0 = SI (kg), 1 = Imperial (lb)
      Bit 1: 0 = no timestamp, 1 = timestamp present
      Bit 2: 0 = no user ID, 1 = user ID present
      Bit 3: 0 = no BMI/height, 1 = BMI/height present

    Weight resolution: 0.005 kg (5 grams) for SI

    Parsing example:
      function parseWeight(data: Uint8Array): number {
        const flags = data[0];
        const isImperial = (flags & 0x01) !== 0;
        const rawWeight = data[1] | (data[2] << 8);

        if (isImperial) {
          return rawWeight * 0.01;  // pounds
        }
        return rawWeight * 0.005;   // kilograms
      }

  Proprietary format (common Chinese scales):
    Many budget scales send ASCII strings via BLE:
      "ST,GS,  0.250kg\r\n"  → stable, gross, 0.250 kg
      "US,GS,  0.000kg\r\n"  → unstable, gross, 0.000 kg

    Parsing:
      function parseAsciiWeight(data: string): number | null {
        const match = data.match(/(\d+\.?\d*)\s*kg/i);
        return match ? parseFloat(match[1]) : null;
      }

3. AUTO-POPULATE QUANTITY FIELD
-------------------------------

  When a product is marked as "loose" (sold by weight):
    1. User scans/selects product
    2. POS detects product.unit_type === 'WEIGHT_KG'
    3. POS shows "Place item on scale" prompt
    4. BLE weight reading auto-fills quantity field
    5. User confirms or manually adjusts

  Flow:
    Product scan → check unit_type → if WEIGHT_KG:
      → subscribe to scale notifications
      → wait for stable reading (ST flag or 3 consistent readings)
      → populate quantity = weight_kg
      → calculate price = weight_kg × price_per_kg
      → show confirmation: "0.250 kg × ₹120/kg = ₹30.00"

  Stability detection:
    - Wait for "ST" (stable) flag in scale data
    - OR: 3 consecutive readings within 2g tolerance
    - Timeout after 10 seconds → show manual entry fallback

4. SUPPORTED SCALE BRANDS
--------------------------

  Tier 1 (common in Indian retail):
    - Essae DS-252     — Bluetooth + USB, 30kg capacity
    - Essae DS-852     — Bluetooth, 30kg, popular in kirana
    - Sansui SSK-150BT — Bluetooth kitchen scale, 15kg
    - iball LS-12      — Budget Bluetooth scale

  Tier 2 (higher-end):
    - CAS SW-II        — Industrial, RS-232 + BLE adapter
    - Mettler Toledo   — Premium, proprietary BLE protocol
    - Sartorius        — Lab-grade, BLE + WiFi

  Budget recommendation for kirana stores:
    Essae DS-852 (₹3,500–4,500) — best price/feature ratio

5. REACT NATIVE BLE IMPLEMENTATION
------------------------------------

  Library: react-native-ble-plx

  Setup:
    import { BleManager } from 'react-native-ble-plx';
    const manager = new BleManager();

    // Scan for scales
    manager.startDeviceScan(
      ['0000181D-0000-1000-8000-00805F9B34FB'],  // filter by service
      null,
      (error, device) => {
        if (device?.name?.includes('SCALE')) {
          connectToScale(device);
        }
      }
    );

    // Subscribe to weight notifications
    async function connectToScale(device) {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      connected.monitorCharacteristicForService(
        '0000181D-0000-1000-8000-00805F9B34FB',
        '00002A9D-0000-1000-8000-00805F9B34FB',
        (error, char) => {
          if (char?.value) {
            const weight = parseWeight(base64ToBytes(char.value));
            updateWeightDisplay(weight);
          }
        }
      );
    }

6. IMPLEMENTATION NOTES
-----------------------

  Current status: FUTURE FEATURE — REQUIRES HARDWARE TESTING

  This feature cannot be fully validated without physical
  weighing scales. Development steps:

    Phase 1: BLE scanning + connection (testable with any BLE device)
    Phase 2: Weight parsing (testable with mock data)
    Phase 3: Hardware testing with Essae DS-852 (requires physical unit)
    Phase 4: Multi-brand compatibility testing

  Android permissions required:
    - BLUETOOTH_SCAN (Android 12+)
    - BLUETOOTH_CONNECT (Android 12+)
    - ACCESS_FINE_LOCATION (for BLE scanning)

  Priority: LOW — most kirana products are pre-packaged.
  Loose items (dal, rice, atta) are weighed at supplier end.

================================================================
  END OF WEIGHING SCALE INTEGRATION GUIDE
================================================================
GUIDE
