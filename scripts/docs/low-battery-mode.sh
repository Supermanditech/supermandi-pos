#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0673 — Low-Battery Mode for POS App
# ────────────────────────────────────────────────────────────────
# Documents React Native battery detection and power-saving
# behavior for the POS app on Android devices.
#
# Usage:  bash scripts/docs/low-battery-mode.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'GUIDE'
================================================================
  LOW-BATTERY MODE — SuperMandi POS App
================================================================

1. BATTERY DETECTION
--------------------

  Option A: expo-battery (preferred for Expo-managed workflow)
    import * as Battery from 'expo-battery';

    const level = await Battery.getBatteryLevelAsync();  // 0.0–1.0
    const state = await Battery.getBatteryStateAsync();
    // BatteryState.CHARGING | UNPLUGGED | FULL | UNKNOWN

    // Subscribe to battery level changes
    Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (batteryLevel < 0.15) enableLowBatteryMode();
    });

  Option B: react-native-device-info (bare workflow)
    import DeviceInfo from 'react-native-device-info';

    const level = await DeviceInfo.getBatteryLevel();  // 0.0–1.0
    const charging = await DeviceInfo.isBatteryCharging();

2. LOW-BATTERY THRESHOLD
-------------------------

  Threshold: 15% (0.15)

  Behavior matrix:
    Battery > 15%  → Normal mode
    Battery <= 15% → Low-battery mode activated
    Battery <= 5%  → Critical mode (further reductions)
    Charging       → Always normal mode (regardless of level)

3. POWER-SAVING MEASURES
-------------------------

  a) REDUCE SYNC FREQUENCY
     Normal mode:  sync every 5 minutes
     Low-battery:  sync every 30 minutes
     Critical:     sync only on user action (manual)

     Implementation:
       const SYNC_INTERVAL = isLowBattery ? 30 * 60 * 1000 : 5 * 60 * 1000;
       // Update background sync timer when mode changes

  b) DISABLE ANIMATIONS
     Low-battery mode disables non-essential animations:
       - List item enter/exit animations → instant
       - Screen transition animations → reduced (150ms vs 300ms)
       - Loading spinners → static progress bar
       - Pull-to-refresh bounce → simple indicator

     Implementation:
       import { LayoutAnimation, UIManager } from 'react-native';
       // Conditionally skip LayoutAnimation.configureNext()
       // Set animationDuration = isLowBattery ? 0 : 300

  c) REDUCE IMAGE QUALITY
     Normal: Load full-resolution product images
     Low-battery: Load thumbnail versions (200px width)
     Critical: Show placeholder icons only (no network image loads)

     Implementation:
       const imageSize = isLowBattery ? 'thumb' : 'full';
       const imageUri = `${CDN_URL}/products/${id}/${imageSize}.webp`;

  d) REDUCE BACKGROUND OPERATIONS
     Low-battery mode:
       - Pause analytics event batching (queue locally)
       - Disable pre-fetching of catalog pages
       - Reduce location polling frequency
       - Defer non-critical API calls (e.g., product recommendations)

4. BATTERY INDICATOR IN HEADER
-------------------------------

  Display battery level in the POS app header bar:

  Component: <BatteryIndicator />
    - Shows battery icon + percentage
    - Green (>50%), Yellow (15-50%), Red (<15%)
    - Charging icon when plugged in
    - Positioned in header right, next to sync status

  Visual:
    [🔋 72%]  → Normal (green)
    [🔋 14%]  → Low battery (red, pulsing)
    [⚡ 14%]  → Charging (yellow, charging icon)

5. STATE MANAGEMENT
-------------------

  Add to app global state (Zustand/Context):

    interface BatteryState {
      level: number;          // 0.0–1.0
      isCharging: boolean;
      isLowBattery: boolean;  // level < 0.15 && !isCharging
      isCritical: boolean;    // level < 0.05 && !isCharging
    }

  Components read isLowBattery to conditionally:
    - Skip animations
    - Use thumbnail images
    - Show battery warning banner

6. IMPLEMENTATION NOTES
-----------------------

  Current status: POST-LAUNCH ENHANCEMENT

  Most kirana store POS devices are:
    - Budget Android phones/tablets
    - Often plugged in during business hours
    - Battery life is a concern for mobile POS setups
      (market stalls, delivery runs)

  Priority: LOW — basic POS functionality works without
  battery optimization. Useful for stores with unreliable power.

  Dependencies:
    - expo-battery package (add to package.json)
    - Battery permission on Android (auto-granted)
    - No iOS considerations (Android-only POS app)

================================================================
  END OF LOW-BATTERY MODE GUIDE
================================================================
GUIDE
