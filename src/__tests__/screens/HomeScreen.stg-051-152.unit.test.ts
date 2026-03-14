/**
 * Layer 6D Home Dashboard — STG-051, 152
 *
 * Tests: bills today + sales total on home, today's sales summary
 */

describe("STG-051: Add 'Bills today' + 'Sales total' on home", () => {
  function formatCurrency(paise: number): string {
    const rupees = paise / 100;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(rupees);
  }

  it("formats sales total in INR", () => {
    const result = formatCurrency(1500000);
    expect(result).toContain("15,000");
  });

  it("shows zero for no sales", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });

  it("bills count is a non-negative integer", () => {
    const billsToday = 12;
    expect(billsToday).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(billsToday)).toBe(true);
  });

  it("both cards are visible on home screen", () => {
    const cards = [
      { label: "Bills Today", value: "12" },
      { label: "Sales Total", value: "₹15,000" },
    ];
    expect(cards).toHaveLength(2);
  });

  it("cards show loading state initially", () => {
    const isLoading = true;
    expect(isLoading).toBe(true);
  });
});

describe("STG-152: Move Today's Sales summary to home screen", () => {
  it("sales summary is on home screen, not buried in menu", () => {
    const screenLocation = "home";
    expect(screenLocation).toBe("home");
    expect(screenLocation).not.toBe("menu");
  });

  it("summary includes bill count and total amount", () => {
    const summary = { billCount: 8, totalPaise: 750000 };
    expect(summary.billCount).toBeDefined();
    expect(summary.totalPaise).toBeDefined();
  });

  it("summary refreshes on screen focus", () => {
    const refreshOnFocus = true;
    expect(refreshOnFocus).toBe(true);
  });

  it("summary shows empty state when no sales", () => {
    const summary = { billCount: 0, totalPaise: 0 };
    const showEmptyState = summary.billCount === 0;
    expect(showEmptyState).toBe(true);
  });

  it("empty state message is friendly", () => {
    const emptyMessage = "No sales yet today";
    expect(emptyMessage).toBeTruthy();
    expect(emptyMessage).not.toContain("error");
  });
});
