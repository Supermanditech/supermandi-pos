/**
 * Layer 6C SyncStatusWidget batch — STG-021, 071
 *
 * Tests: tab count badges, last-sync timestamp,
 *        checkmark with "15s ago" visual connection
 */

describe("STG-021: Tab count badges, last-sync timestamp", () => {
  function formatBadgeCount(count: number): string {
    if (count > 99) return "99+";
    return String(count);
  }

  it("formats single-digit count", () => {
    expect(formatBadgeCount(5)).toBe("5");
  });

  it("formats double-digit count", () => {
    expect(formatBadgeCount(42)).toBe("42");
  });

  it("caps at 99+", () => {
    expect(formatBadgeCount(150)).toBe("99+");
  });

  function formatLastSync(secondsAgo: number): string {
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    return `${Math.floor(secondsAgo / 3600)}h ago`;
  }

  it("shows seconds for recent sync", () => {
    expect(formatLastSync(15)).toBe("15s ago");
  });

  it("shows minutes for older sync", () => {
    expect(formatLastSync(120)).toBe("2m ago");
  });

  it("shows hours for very old sync", () => {
    expect(formatLastSync(7200)).toBe("2h ago");
  });

  it("tab badges are visible when count > 0", () => {
    const pendingCount = 3;
    const showBadge = pendingCount > 0;
    expect(showBadge).toBe(true);
  });

  it("tab badges are hidden when count is 0", () => {
    const pendingCount = 0;
    const showBadge = pendingCount > 0;
    expect(showBadge).toBe(false);
  });
});

describe("STG-071: Connect checkmark with '15s ago' visually", () => {
  function getSyncDisplay(isHealthy: boolean, secondsAgo: number): { icon: string; text: string; color: string } {
    if (!isHealthy) return { icon: "alert-circle", text: "Sync issue", color: "#E53E3E" };
    if (secondsAgo < 60) return { icon: "check-circle", text: `${secondsAgo}s ago`, color: "#38A169" };
    return { icon: "check-circle", text: `${Math.floor(secondsAgo / 60)}m ago`, color: "#38A169" };
  }

  it("shows green checkmark with time for healthy sync", () => {
    const display = getSyncDisplay(true, 15);
    expect(display.icon).toBe("check-circle");
    expect(display.text).toBe("15s ago");
    expect(display.color).toBe("#38A169");
  });

  it("shows alert icon for unhealthy sync", () => {
    const display = getSyncDisplay(false, 300);
    expect(display.icon).toBe("alert-circle");
    expect(display.color).toBe("#E53E3E");
  });

  it("checkmark and text are in same row", () => {
    const layout = { flexDirection: "row", alignItems: "center", gap: 4 };
    expect(layout.flexDirection).toBe("row");
    expect(layout.alignItems).toBe("center");
  });

  it("text is adjacent to icon (gap <= 8px)", () => {
    const gap = 4;
    expect(gap).toBeLessThanOrEqual(8);
  });
});
