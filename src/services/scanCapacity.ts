/**
 * V3-HARDEN-161: Scan capacity contract
 *
 * Approved operational targets:
 * - 50,000 purchase-side scans/day (procurement + counter purchase)
 * - 50,000 sales-side scans/day (SELL)
 * - Combined: 100,000 scans/day across all intents
 *
 * Capacity thresholds (go/no-go):
 * - Scan-to-action latency: < 200ms (client-side lookup + cart mutation)
 * - Backend barcode lookup latency: p95 < 500ms
 * - Duplicate suppression: 100% correct within 300ms debounce window
 * - No cart/inward double-add: zero drift over 1000 rapid scans
 * - Memory: < 50MB growth over 1000-scan sustained session
 * - Crash: zero crashes over 1-hour sustained scanning
 */

export const SCAN_CAPACITY_TARGETS = {
  /** Daily purchase-side scans (procurement + counter purchase) */
  PURCHASE_SCANS_PER_DAY: 50_000,
  /** Daily sales-side scans (SELL) */
  SELL_SCANS_PER_DAY: 50_000,
  /** Combined daily scan volume */
  TOTAL_SCANS_PER_DAY: 100_000,
  /** Peak scans per minute (assuming 8-hour operational window) */
  PEAK_SCANS_PER_MINUTE: Math.ceil(100_000 / (8 * 60)), // ~208/min
  /** Peak scans per second */
  PEAK_SCANS_PER_SECOND: Math.ceil(100_000 / (8 * 3600)), // ~3.5/sec
} as const;

export const SCAN_LATENCY_BUDGETS = {
  /** Client-side scan-to-action (lookup + cart/inward mutation): ms */
  CLIENT_SCAN_TO_ACTION_MS: 200,
  /** Backend barcode lookup p95: ms */
  BACKEND_LOOKUP_P95_MS: 500,
  /** Duplicate suppression debounce window: ms */
  DEDUP_WINDOW_MS: 300,
  /** HID scanner input-to-process: ms */
  HID_INPUT_TO_PROCESS_MS: 100,
} as const;

export const SCAN_CORRECTNESS_THRESHOLDS = {
  /** Duplicate suppression: must be 100% within debounce window */
  DEDUP_CORRECTNESS_PCT: 100,
  /** Cart double-add drift: must be zero over 1000 rapid scans */
  CART_DOUBLE_ADD_TOLERANCE: 0,
  /** Memory growth over 1000-scan session: max MB */
  MEMORY_GROWTH_MAX_MB: 50,
  /** Crashes allowed during 1-hour sustained scanning */
  CRASH_TOLERANCE: 0,
} as const;

/**
 * Calculate scans per operational hour at target volume.
 */
export function scansPerHour(dailyTarget: number, operationalHours: number = 8): number {
  return Math.ceil(dailyTarget / operationalHours);
}

/**
 * Validate that a measured scan rate meets the approved target.
 */
export function validateScanRate(measuredScansPerMinute: number): {
  pass: boolean;
  target: number;
  measured: number;
} {
  return {
    pass: measuredScansPerMinute >= SCAN_CAPACITY_TARGETS.PEAK_SCANS_PER_MINUTE,
    target: SCAN_CAPACITY_TARGETS.PEAK_SCANS_PER_MINUTE,
    measured: measuredScansPerMinute,
  };
}
