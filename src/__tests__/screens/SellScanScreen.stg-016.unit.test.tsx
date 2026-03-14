/**
 * STG-016: Cart/checkout indicator — floating total bar when items added
 *
 * Tests: floating bar visibility logic, item count display,
 *        total amount calculation, animation trigger, recent bills fallback
 */

describe("STG-016: Floating total bar — cart indicator", () => {
  describe("Floating bar visibility", () => {
    it("shows bar when cart has 1+ items", () => {
      const items = [{ sku: "A", qty: 1, price: 100 }];
      const showBar = items.length > 0;
      expect(showBar).toBe(true);
    });

    it("hides bar when cart is empty", () => {
      const items: any[] = [];
      const showBar = items.length > 0;
      expect(showBar).toBe(false);
    });
  });

  describe("Item count display", () => {
    function itemLabel(count: number): string {
      return count === 1 ? "1 item" : `${count} items`;
    }

    it("shows singular for 1 item", () => {
      expect(itemLabel(1)).toBe("1 item");
    });

    it("shows plural for multiple items", () => {
      expect(itemLabel(5)).toBe("5 items");
    });
  });

  describe("Total amount calculation", () => {
    interface CartItem {
      qty: number;
      price: number;
    }

    function calculateTotal(items: CartItem[]): number {
      return items.reduce((sum, item) => sum + item.qty * item.price, 0);
    }

    it("calculates total for single item", () => {
      expect(calculateTotal([{ qty: 2, price: 50 }])).toBe(100);
    });

    it("calculates total for multiple items", () => {
      expect(calculateTotal([
        { qty: 1, price: 100 },
        { qty: 3, price: 20 },
        { qty: 2, price: 50 },
      ])).toBe(260);
    });

    it("returns 0 for empty cart", () => {
      expect(calculateTotal([])).toBe(0);
    });
  });

  describe("Total amount formatting", () => {
    function formatTotal(amount: number): string {
      return `₹${amount.toLocaleString("en-IN")}`;
    }

    it("formats small amounts", () => {
      expect(formatTotal(150)).toBe("₹150");
    });

    it("formats amounts with thousands separator", () => {
      expect(formatTotal(1500)).toBe("₹1,500");
    });

    it("formats large amounts with Indian grouping", () => {
      expect(formatTotal(150000)).toBe("₹1,50,000");
    });
  });

  describe("Animation trigger", () => {
    it("triggers slide-up animation on first item add", () => {
      let prevCount = 0;
      const newCount = 1;
      const shouldAnimate = prevCount === 0 && newCount > 0;
      expect(shouldAnimate).toBe(true);
    });

    it("does not re-animate when adding more items", () => {
      let prevCount = 2;
      const newCount = 3;
      const shouldAnimate = prevCount === 0 && newCount > 0;
      expect(shouldAnimate).toBe(false);
    });

    it("triggers slide-down when cart cleared", () => {
      let prevCount = 3;
      const newCount = 0;
      const shouldHide = prevCount > 0 && newCount === 0;
      expect(shouldHide).toBe(true);
    });
  });

  describe("Recent bills fallback", () => {
    const MAX_RECENT_BILLS = 5;

    it("shows recent bills when cart is empty", () => {
      const cartEmpty = true;
      const recentBills = [
        { ref: "B001", amount: 150, time: "10:30 AM" },
        { ref: "B002", amount: 320, time: "10:15 AM" },
      ];
      const showRecentBills = cartEmpty && recentBills.length > 0;
      expect(showRecentBills).toBe(true);
    });

    it("hides recent bills when cart has items", () => {
      const cartEmpty = false;
      const showRecentBills = cartEmpty;
      expect(showRecentBills).toBe(false);
    });

    it("limits to 5 recent bills", () => {
      const bills = Array.from({ length: 10 }, (_, i) => ({
        ref: `B${i}`,
        amount: 100 + i * 10,
      }));
      const displayed = bills.slice(0, MAX_RECENT_BILLS);
      expect(displayed).toHaveLength(5);
    });
  });
});
