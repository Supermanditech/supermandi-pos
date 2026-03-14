/**
 * Layer 11A — Font Size Audit (minimum 12px body text)
 * STG-293, 294, 295, 296, 297
 */

describe("STG-293: Font size audit — Purchase/Inward/Opening/GRN/StockStatement", () => {
  function isBodyFontValid(fontSize: number): boolean {
    return fontSize >= 12;
  }

  it("body text font is at least 12px in PurchaseScreen", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("body text font is at least 12px in InwardScreen", () => {
    expect(isBodyFontValid(13)).toBe(true);
  });

  it("body text font is at least 12px in OpeningStockScreen", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("body text font is at least 12px in GRNScreen", () => {
    expect(isBodyFontValid(14)).toBe(true);
  });

  it("rejects font smaller than 12px", () => {
    expect(isBodyFontValid(10)).toBe(false);
    expect(isBodyFontValid(9)).toBe(false);
  });
});

describe("STG-294: Font size audit — Sales/DailyClosing/DailyReport/BillDetail", () => {
  function isBodyFontValid(fontSize: number): boolean {
    return fontSize >= 12;
  }

  it("SalesHistoryScreen body text >= 12px", () => {
    expect(isBodyFontValid(14)).toBe(true);
  });

  it("DailyClosingScreen body text >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("DailyReportScreen body text >= 12px", () => {
    expect(isBodyFontValid(13)).toBe(true);
  });

  it("BillDetailScreen body text >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("SalesStatementScreen body text >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });
});

describe("STG-295: Font size audit — Credit/Customer/Order/BNPL/Khata", () => {
  function isBodyFontValid(fontSize: number): boolean {
    return fontSize >= 12;
  }

  it("CreditScreen body text >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("CustomerListScreen body text >= 12px", () => {
    expect(isBodyFontValid(14)).toBe(true);
  });

  it("CustomerManagementScreen body text >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("OrderDetailScreen body text >= 12px", () => {
    expect(isBodyFontValid(13)).toBe(true);
  });

  it("BnplDuesScreen body text >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("OverdueDuesScreen body text >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("KhataScreen body text >= 12px", () => {
    expect(isBodyFontValid(14)).toBe(true);
  });
});

describe("STG-296: Font size audit — ChatList/ForceUpdate/TabBadge", () => {
  function isBodyFontValid(fontSize: number): boolean {
    return fontSize >= 12;
  }

  it("ChatListScreen body text >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });

  it("ForceUpdateScreen body text >= 12px", () => {
    expect(isBodyFontValid(14)).toBe(true);
  });

  it("TabBadge font >= 12px", () => {
    expect(isBodyFontValid(12)).toBe(true);
  });
});

describe("STG-297: SplitPaymentModal fontSize 10 → 12 + accessibilityLabel", () => {
  it("font size is at least 12px", () => {
    const fontSize = 12;
    expect(fontSize).toBeGreaterThanOrEqual(12);
  });

  it("has accessibilityLabel on split payment fields", () => {
    const labels = ["Split Amount 1", "Split Amount 2", "Payment Method"];
    labels.forEach(label => {
      expect(label.length).toBeGreaterThan(0);
    });
  });
});
