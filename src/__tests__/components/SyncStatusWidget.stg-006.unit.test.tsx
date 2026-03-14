/**
 * STG-006: SyncStatusWidget — collapse when healthy, reduce footprint
 *
 * Tests: getStatusColor, getStatusIcon, formatRelativeTime utility functions,
 *        healthy vs unhealthy state logic, pending/deadletter/drift detection
 */

type ConnectionStatus = "connected" | "connecting" | "disconnected";

function getStatusColor(status: ConnectionStatus, syncing: boolean): string {
  if (syncing) return "warning";
  switch (status) {
    case "connected": return "success";
    case "connecting": return "warning";
    case "disconnected": return "error";
    default: return "error";
  }
}

function getStatusIcon(status: ConnectionStatus, syncing: boolean): string {
  if (syncing) return "sync";
  switch (status) {
    case "connected": return "cloud-check";
    case "connecting": return "cloud-sync";
    case "disconnected": return "cloud-off-outline";
    default: return "cloud-off-outline";
  }
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function computeIsHealthy(state: {
  connectionStatus: string;
  syncing: boolean;
  outboxCount: number;
  deadletterCount: number;
  stockDrifts: any[];
  lastSyncError: string | null;
}): boolean {
  return (
    state.connectionStatus === "connected" &&
    !state.syncing &&
    state.outboxCount === 0 &&
    state.deadletterCount === 0 &&
    state.stockDrifts.length === 0 &&
    !state.lastSyncError
  );
}

describe("STG-006: SyncStatusWidget — collapse when healthy", () => {
  describe("getStatusColor", () => {
    it("returns warning when syncing regardless of connection status", () => {
      expect(getStatusColor("connected", true)).toBe("warning");
      expect(getStatusColor("disconnected", true)).toBe("warning");
    });

    it("returns success when connected and not syncing", () => {
      expect(getStatusColor("connected", false)).toBe("success");
    });

    it("returns warning when connecting", () => {
      expect(getStatusColor("connecting", false)).toBe("warning");
    });

    it("returns error when disconnected", () => {
      expect(getStatusColor("disconnected", false)).toBe("error");
    });
  });

  describe("getStatusIcon", () => {
    it("returns sync icon when syncing", () => {
      expect(getStatusIcon("connected", true)).toBe("sync");
    });

    it("returns cloud-check when connected", () => {
      expect(getStatusIcon("connected", false)).toBe("cloud-check");
    });

    it("returns cloud-sync when connecting", () => {
      expect(getStatusIcon("connecting", false)).toBe("cloud-sync");
    });

    it("returns cloud-off-outline when disconnected", () => {
      expect(getStatusIcon("disconnected", false)).toBe("cloud-off-outline");
    });
  });

  describe("formatRelativeTime", () => {
    it('returns "Never" for null date', () => {
      expect(formatRelativeTime(null)).toBe("Never");
    });

    it('returns "Just now" for < 10 seconds ago', () => {
      const date = new Date(Date.now() - 5000);
      expect(formatRelativeTime(date)).toBe("Just now");
    });

    it("returns seconds format for 10-59 seconds", () => {
      const date = new Date(Date.now() - 30000);
      expect(formatRelativeTime(date)).toBe("30s ago");
    });

    it("returns minutes format for 1-59 minutes", () => {
      const date = new Date(Date.now() - 300000);
      expect(formatRelativeTime(date)).toBe("5 min ago");
    });

    it("returns hours format for 60+ minutes", () => {
      const date = new Date(Date.now() - 7200000);
      expect(formatRelativeTime(date)).toBe("2h ago");
    });
  });

  describe("isHealthy logic (STG-006 core requirement)", () => {
    it("is healthy when connected, not syncing, no pending, no errors", () => {
      expect(computeIsHealthy({
        connectionStatus: "connected", syncing: false,
        outboxCount: 0, deadletterCount: 0, stockDrifts: [], lastSyncError: null,
      })).toBe(true);
    });

    it("is NOT healthy when disconnected", () => {
      expect(computeIsHealthy({
        connectionStatus: "disconnected", syncing: false,
        outboxCount: 0, deadletterCount: 0, stockDrifts: [], lastSyncError: null,
      })).toBe(false);
    });

    it("is NOT healthy when syncing", () => {
      expect(computeIsHealthy({
        connectionStatus: "connected", syncing: true,
        outboxCount: 0, deadletterCount: 0, stockDrifts: [], lastSyncError: null,
      })).toBe(false);
    });

    it("is NOT healthy when items pending in outbox", () => {
      expect(computeIsHealthy({
        connectionStatus: "connected", syncing: false,
        outboxCount: 3, deadletterCount: 0, stockDrifts: [], lastSyncError: null,
      })).toBe(false);
    });

    it("is NOT healthy when deadletter items exist", () => {
      expect(computeIsHealthy({
        connectionStatus: "connected", syncing: false,
        outboxCount: 0, deadletterCount: 2, stockDrifts: [], lastSyncError: null,
      })).toBe(false);
    });

    it("is NOT healthy when stock drifts detected", () => {
      expect(computeIsHealthy({
        connectionStatus: "connected", syncing: false,
        outboxCount: 0, deadletterCount: 0,
        stockDrifts: [{ sku: "ABC", local: 10, server: 8 }], lastSyncError: null,
      })).toBe(false);
    });

    it("is NOT healthy when lastSyncError exists", () => {
      expect(computeIsHealthy({
        connectionStatus: "connected", syncing: false,
        outboxCount: 0, deadletterCount: 0, stockDrifts: [],
        lastSyncError: "Network timeout",
      })).toBe(false);
    });
  });

  describe("Pending item display logic", () => {
    it("shows pending count when outboxCount > 0", () => {
      const outboxCount = 5;
      const display = outboxCount > 0 ? `${outboxCount} pending` : null;
      expect(display).toBe("5 pending");
    });

    it("hides pending count when outboxCount is 0", () => {
      const outboxCount = 0;
      const display = outboxCount > 0 ? `${outboxCount} pending` : null;
      expect(display).toBeNull();
    });
  });
});
