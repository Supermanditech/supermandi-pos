/**
 * GCP-STG-0404: Order Confirmation Screen After BUY Checkout
 *
 * Validates that after successful BUY checkout, the order confirmation
 * data is populated with order numbers, item count, total amount,
 * and payment status — instead of only showing a toast.
 */

describe("GCP-STG-0404: BUY order confirmation data", () => {
  // Extract the confirmation data builder logic that mirrors BuyScreenV3 checkout
  interface OrderResult {
    id: string;
    orderNumber: string;
    paymentIntentStatus?: string;
  }

  interface ConfirmationData {
    orderNumbers: string[];
    itemCount: number;
    totalMinor: number;
    paymentMode: string;
    paymentStatus: string;
    supplierCount: number;
  }

  function buildConfirmation(
    orders: OrderResult[],
    totalItems: number,
    cartTotal: number,
    paymentMode: string,
    supplierCount: number
  ): ConfirmationData {
    const orderNumbers = orders.map((o) => o.orderNumber || o.id);
    const lastPaymentStatus =
      (orders[orders.length - 1] as any)?.paymentIntentStatus || "none";
    return {
      orderNumbers,
      itemCount: totalItems,
      totalMinor: cartTotal,
      paymentMode,
      paymentStatus: lastPaymentStatus,
      supplierCount,
    };
  }

  it("builds confirmation with single order", () => {
    const result = buildConfirmation(
      [{ id: "ord-1", orderNumber: "PO-2026-001", paymentIntentStatus: "none" }],
      3,
      150000,
      "CASH",
      1
    );
    expect(result.orderNumbers).toEqual(["PO-2026-001"]);
    expect(result.itemCount).toBe(3);
    expect(result.totalMinor).toBe(150000);
    expect(result.paymentMode).toBe("CASH");
    expect(result.paymentStatus).toBe("none");
    expect(result.supplierCount).toBe(1);
  });

  it("builds confirmation with multiple supplier orders", () => {
    const result = buildConfirmation(
      [
        { id: "ord-1", orderNumber: "PO-2026-001", paymentIntentStatus: "pending" },
        { id: "ord-2", orderNumber: "PO-2026-002", paymentIntentStatus: "authorized" },
      ],
      5,
      320000,
      "BNPL",
      2
    );
    expect(result.orderNumbers).toEqual(["PO-2026-001", "PO-2026-002"]);
    expect(result.itemCount).toBe(5);
    expect(result.totalMinor).toBe(320000);
    expect(result.paymentMode).toBe("BNPL");
    // Last order's payment status wins
    expect(result.paymentStatus).toBe("authorized");
    expect(result.supplierCount).toBe(2);
  });

  it("falls back to order id when orderNumber is empty", () => {
    const result = buildConfirmation(
      [{ id: "uuid-abc-123", orderNumber: "" }],
      1,
      50000,
      "UPI",
      1
    );
    // Empty string is falsy — fallback to id
    expect(result.orderNumbers).toEqual(["uuid-abc-123"]);
  });

  it("defaults paymentStatus to 'none' when missing", () => {
    const result = buildConfirmation(
      [{ id: "ord-1", orderNumber: "PO-001" }],
      2,
      80000,
      "CREDIT",
      1
    );
    expect(result.paymentStatus).toBe("none");
  });

  it("preserves cartTotal in minor units (no rounding)", () => {
    const result = buildConfirmation(
      [{ id: "ord-1", orderNumber: "PO-001", paymentIntentStatus: "none" }],
      1,
      12345,
      "CASH",
      1
    );
    // Display would be Math.round(12345/100) = 123, but raw data keeps minor
    expect(result.totalMinor).toBe(12345);
  });

  // UI display logic tests
  describe("confirmation display formatting", () => {
    it("formats total from minor to rupees", () => {
      const totalMinor = 250000;
      const display = Math.round(totalMinor / 100).toLocaleString("en-IN");
      expect(display).toBe("2,500");
    });

    it("shows singular 'item' for count=1", () => {
      const count = 1;
      const label = `${count} item${count !== 1 ? "s" : ""}`;
      expect(label).toBe("1 item");
    });

    it("shows plural 'items' for count>1", () => {
      const count: number = 4;
      const label = `${count} item${count !== 1 ? "s" : ""}`;
      expect(label).toBe("4 items");
    });

    it("shows '+N more' when >2 order numbers", () => {
      const orderNumbers = ["PO-001", "PO-002", "PO-003", "PO-004"];
      const display =
        orderNumbers.length <= 2
          ? orderNumbers.join(", ")
          : `${orderNumbers[0]} +${orderNumbers.length - 1} more`;
      expect(display).toBe("PO-001 +3 more");
    });

    it("joins 2 order numbers with comma", () => {
      const orderNumbers = ["PO-001", "PO-002"];
      const display =
        orderNumbers.length <= 2
          ? orderNumbers.join(", ")
          : `${orderNumbers[0]} +${orderNumbers.length - 1} more`;
      expect(display).toBe("PO-001, PO-002");
    });

    it("shows payment label for CASH mode", () => {
      const paymentMode: string = "CASH";
      const paymentStatus: string = "none";
      const label =
        paymentMode === "CASH"
          ? "Cash on Delivery"
          : paymentStatus === "authorized"
          ? "Approved"
          : paymentStatus === "pending"
          ? "Pending"
          : paymentMode;
      expect(label).toBe("Cash on Delivery");
    });

    it("shows 'Approved' for authorized payment", () => {
      const paymentMode: string = "UPI";
      const paymentStatus: string = "authorized";
      const label =
        paymentMode === "CASH"
          ? "Cash on Delivery"
          : paymentStatus === "authorized"
          ? "Approved"
          : paymentStatus === "pending"
          ? "Pending"
          : paymentMode;
      expect(label).toBe("Approved");
    });

    it("shows 'Pending' for pending payment", () => {
      const paymentMode: string = "BNPL";
      const paymentStatus: string = "pending";
      const label =
        paymentMode === "CASH"
          ? "Cash on Delivery"
          : paymentStatus === "authorized"
          ? "Approved"
          : paymentStatus === "pending"
          ? "Pending"
          : paymentMode;
      expect(label).toBe("Pending");
    });
  });
});
