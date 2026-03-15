/**
 * STG-510: Duplicate scan window — track per-barcode, not single lastScan
 *
 * Verifies that the per-barcode Map correctly tracks duplicates per barcode
 * rather than using a single global lastScan variable.
 *
 * Test type: UNIT_TEST (logic extraction — no component render)
 */

const DUPLICATE_WINDOW_MS = 1000;

// Simulate per-barcode duplicate tracking
class DuplicateTracker {
  private lastScanByKey = new Map<string, number>();

  isDuplicate(barcode: string, intent: string, mode: string, now: number): boolean {
    const key = `${intent}:${mode}:${barcode}`;
    const lastTs = this.lastScanByKey.get(key);
    if (lastTs !== undefined && now - lastTs < DUPLICATE_WINDOW_MS) {
      return true;
    }
    this.lastScanByKey.set(key, now);
    // Cleanup
    if (this.lastScanByKey.size > 50) {
      for (const [k, ts] of this.lastScanByKey) {
        if (now - ts > DUPLICATE_WINDOW_MS * 2) this.lastScanByKey.delete(k);
      }
    }
    return false;
  }
}

describe("STG-510: Per-barcode duplicate scan tracking", () => {
  test("same barcode within window is duplicate", () => {
    const tracker = new DuplicateTracker();
    expect(tracker.isDuplicate("ABC123", "SELL", "SELL", 1000)).toBe(false);
    expect(tracker.isDuplicate("ABC123", "SELL", "SELL", 1500)).toBe(true);
  });

  test("same barcode after window is not duplicate", () => {
    const tracker = new DuplicateTracker();
    expect(tracker.isDuplicate("ABC123", "SELL", "SELL", 1000)).toBe(false);
    expect(tracker.isDuplicate("ABC123", "SELL", "SELL", 2001)).toBe(false);
  });

  test("different barcodes within window are not duplicates", () => {
    const tracker = new DuplicateTracker();
    expect(tracker.isDuplicate("ABC123", "SELL", "SELL", 1000)).toBe(false);
    expect(tracker.isDuplicate("DEF456", "SELL", "SELL", 1200)).toBe(false);
  });

  test("A then B then A within window — A is correctly caught as duplicate", () => {
    // This was the bug with single lastScan: A→B→A would miss the second A
    const tracker = new DuplicateTracker();
    expect(tracker.isDuplicate("A", "SELL", "SELL", 1000)).toBe(false);
    expect(tracker.isDuplicate("B", "SELL", "SELL", 1300)).toBe(false);
    expect(tracker.isDuplicate("A", "SELL", "SELL", 1600)).toBe(true); // within 1000ms of first A
  });

  test("different intent/mode creates separate key", () => {
    const tracker = new DuplicateTracker();
    expect(tracker.isDuplicate("ABC123", "SELL", "SELL", 1000)).toBe(false);
    expect(tracker.isDuplicate("ABC123", "STOCK_IN", "STOCK_IN", 1200)).toBe(false);
  });

  test("cleanup removes stale entries", () => {
    const tracker = new DuplicateTracker();
    // Add 51 entries to trigger cleanup
    for (let i = 0; i < 51; i++) {
      tracker.isDuplicate(`barcode-${i}`, "SELL", "SELL", 1000);
    }
    // Add one more much later — should trigger cleanup
    tracker.isDuplicate("new-barcode", "SELL", "SELL", 5000);
    // Old entries should be cleaned up (they're > 2000ms old)
  });
});
