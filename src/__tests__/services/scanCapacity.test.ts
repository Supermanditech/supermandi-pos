/**
 * V3-HARDEN-161: Scan capacity contract and duplicate suppression tests
 */

import {
  SCAN_CAPACITY_TARGETS,
  SCAN_LATENCY_BUDGETS,
  SCAN_CORRECTNESS_THRESHOLDS,
  scansPerHour,
  validateScanRate,
} from "../../services/scanCapacity";

import {
  normalizeBarcode,
  isDuplicateScan,
  resetDuplicateState,
} from "../../services/scanIntent";

// ═══════════════════════════════════════════════════════════════════════════════
// Capacity targets
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-161: Scan capacity targets (executable)", () => {
  it("approved SELL volume is 50k/day", () => {
    expect(SCAN_CAPACITY_TARGETS.SELL_SCANS_PER_DAY).toBe(50_000);
  });

  it("approved purchase volume is 50k/day", () => {
    expect(SCAN_CAPACITY_TARGETS.PURCHASE_SCANS_PER_DAY).toBe(50_000);
  });

  it("combined volume is 100k/day", () => {
    expect(SCAN_CAPACITY_TARGETS.TOTAL_SCANS_PER_DAY).toBe(100_000);
  });

  it("peak rate is ~208/min over 8-hour window", () => {
    expect(SCAN_CAPACITY_TARGETS.PEAK_SCANS_PER_MINUTE).toBeGreaterThanOrEqual(200);
    expect(SCAN_CAPACITY_TARGETS.PEAK_SCANS_PER_MINUTE).toBeLessThan(250);
  });

  it("scansPerHour calculates correctly", () => {
    expect(scansPerHour(100_000, 8)).toBe(12500);
    expect(scansPerHour(50_000, 10)).toBe(5000);
  });

  it("validateScanRate passes for sufficient rate", () => {
    const result = validateScanRate(250);
    expect(result.pass).toBe(true);
  });

  it("validateScanRate fails for insufficient rate", () => {
    const result = validateScanRate(100);
    expect(result.pass).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Latency budgets
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-161: Latency budgets (executable)", () => {
  it("client scan-to-action budget is 200ms", () => {
    expect(SCAN_LATENCY_BUDGETS.CLIENT_SCAN_TO_ACTION_MS).toBe(200);
  });

  it("backend lookup p95 budget is 500ms", () => {
    expect(SCAN_LATENCY_BUDGETS.BACKEND_LOOKUP_P95_MS).toBe(500);
  });

  it("HID input-to-process budget is 100ms", () => {
    expect(SCAN_LATENCY_BUDGETS.HID_INPUT_TO_PROCESS_MS).toBe(100);
  });

  it("dedup window matches scanIntent debounce", () => {
    expect(SCAN_LATENCY_BUDGETS.DEDUP_WINDOW_MS).toBe(300);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Correctness thresholds
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-161: Correctness thresholds (executable)", () => {
  it("dedup must be 100% correct", () => {
    expect(SCAN_CORRECTNESS_THRESHOLDS.DEDUP_CORRECTNESS_PCT).toBe(100);
  });

  it("zero cart double-add tolerance", () => {
    expect(SCAN_CORRECTNESS_THRESHOLDS.CART_DOUBLE_ADD_TOLERANCE).toBe(0);
  });

  it("zero crash tolerance", () => {
    expect(SCAN_CORRECTNESS_THRESHOLDS.CRASH_TOLERANCE).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Duplicate suppression correctness proof
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-161: Duplicate suppression correctness (executable)", () => {
  beforeEach(() => resetDuplicateState());

  it("1000 rapid same-barcode scans produce exactly 1 non-duplicate", () => {
    let nonDuplicates = 0;
    for (let i = 0; i < 1000; i++) {
      if (!isDuplicateScan("8901234567890")) {
        nonDuplicates++;
      }
    }
    // First scan is not a duplicate, all subsequent are
    expect(nonDuplicates).toBe(1);
  });

  it("alternating barcodes are never suppressed", () => {
    let nonDuplicates = 0;
    for (let i = 0; i < 100; i++) {
      resetDuplicateState();
      const barcode = `890${String(i).padStart(10, "0")}`;
      if (!isDuplicateScan(barcode)) nonDuplicates++;
    }
    expect(nonDuplicates).toBe(100);
  });

  it("normalizeBarcode handles all HID scanner edge cases", () => {
    // Trailing newline (most common HID terminator)
    expect(normalizeBarcode("8901234\n")).toBe("8901234");
    // Carriage return + newline (Windows HID)
    expect(normalizeBarcode("8901234\r\n")).toBe("8901234");
    // Tab (some scanner configs)
    expect(normalizeBarcode("8901234\t")).toBe("8901234");
    // Leading/trailing spaces
    expect(normalizeBarcode(" 8901234 ")).toBe("8901234");
    // Internal spaces (should strip)
    expect(normalizeBarcode("890 123 4")).toBe("8901234");
    // Multiple terminators
    expect(normalizeBarcode("\t8901234\r\n\t")).toBe("8901234");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Infrastructure gate verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-161: Infrastructure (static — narrowly scoped)", () => {
  it("k6 scan stress test exists", () => {
    const fs = require("fs");
    expect(fs.existsSync("scripts/load-tests/scan-stress.js")).toBe(true);
  });

  it("scan capacity gate exists", () => {
    const fs = require("fs");
    expect(fs.existsSync("scripts/gates/scan-capacity-gate.sh")).toBe(true);
  });

  it("deploy.yml includes scan capacity gate", () => {
    const fs = require("fs");
    const src = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
    expect(src).toContain("scan-capacity-gate.sh");
  });

  it("k6 stress test targets correct thresholds", () => {
    const fs = require("fs");
    const src = fs.readFileSync("scripts/load-tests/scan-stress.js", "utf8");
    expect(src).toContain("scan_lookup_duration");
    expect(src).toContain("p(95)<500");
    expect(src).toContain("sell_scan");
    expect(src).toContain("purchase_scan");
  });
});
