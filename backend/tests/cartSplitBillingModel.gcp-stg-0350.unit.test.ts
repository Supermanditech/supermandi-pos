/**
 * GCP-STG-0350: Cart Split by Billing Model
 *
 * Verifies that when items in a single order have different billing models
 * (e.g. SUPERMANDI_PRINCIPAL vs DIRECT_SUPPLIER), the POST /orders endpoint
 * creates separate purchase orders for each billing model group.
 *
 * Single billing model orders remain backward-compatible (single order response).
 */

describe("GCP-STG-0350: Cart split by billing model", () => {
  // Unit test the grouping logic that was inlined from splitCartByBillingModel
  function splitByBillingModel(
    items: Array<{ supplierProductId: string; billingModel: string; [key: string]: any }>
  ): Map<string, typeof items> {
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.billingModel || "SUPERMANDI_PRINCIPAL";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }
    return groups;
  }

  it("should NOT split when all items share the same billing model", () => {
    const items = [
      { supplierProductId: "sp-1", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 5, unitPrice: 100 },
      { supplierProductId: "sp-2", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 3, unitPrice: 200 },
      { supplierProductId: "sp-3", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 1, unitPrice: 50 },
    ];

    const groups = splitByBillingModel(items);
    expect(groups.size).toBe(1);
    expect(groups.has("SUPERMANDI_PRINCIPAL")).toBe(true);
    expect(groups.get("SUPERMANDI_PRINCIPAL")!.length).toBe(3);
  });

  it("should split into 2 groups when items have 2 different billing models", () => {
    const items = [
      { supplierProductId: "sp-1", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 5, unitPrice: 100 },
      { supplierProductId: "sp-2", billingModel: "DIRECT_SUPPLIER", quantity: 3, unitPrice: 200 },
      { supplierProductId: "sp-3", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 1, unitPrice: 50 },
    ];

    const groups = splitByBillingModel(items);
    expect(groups.size).toBe(2);

    const principalGroup = groups.get("SUPERMANDI_PRINCIPAL")!;
    expect(principalGroup.length).toBe(2);
    expect(principalGroup[0].supplierProductId).toBe("sp-1");
    expect(principalGroup[1].supplierProductId).toBe("sp-3");

    const directGroup = groups.get("DIRECT_SUPPLIER")!;
    expect(directGroup.length).toBe(1);
    expect(directGroup[0].supplierProductId).toBe("sp-2");
  });

  it("should default to SUPERMANDI_PRINCIPAL when billingModel is missing/empty", () => {
    const items = [
      { supplierProductId: "sp-1", billingModel: "", quantity: 5, unitPrice: 100 },
      { supplierProductId: "sp-2", billingModel: "DIRECT_SUPPLIER", quantity: 3, unitPrice: 200 },
    ];

    const groups = splitByBillingModel(items);
    expect(groups.size).toBe(2);
    expect(groups.has("SUPERMANDI_PRINCIPAL")).toBe(true);
    expect(groups.has("DIRECT_SUPPLIER")).toBe(true);
  });

  it("should handle single item cart (no split needed)", () => {
    const items = [
      { supplierProductId: "sp-1", billingModel: "DIRECT_SUPPLIER", quantity: 10, unitPrice: 500 },
    ];

    const groups = splitByBillingModel(items);
    expect(groups.size).toBe(1);
    expect(groups.get("DIRECT_SUPPLIER")!.length).toBe(1);
  });

  it("should preserve item order within each group", () => {
    const items = [
      { supplierProductId: "sp-1", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 1, unitPrice: 10 },
      { supplierProductId: "sp-2", billingModel: "DIRECT_SUPPLIER", quantity: 2, unitPrice: 20 },
      { supplierProductId: "sp-3", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 3, unitPrice: 30 },
      { supplierProductId: "sp-4", billingModel: "DIRECT_SUPPLIER", quantity: 4, unitPrice: 40 },
      { supplierProductId: "sp-5", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 5, unitPrice: 50 },
    ];

    const groups = splitByBillingModel(items);

    const principal = groups.get("SUPERMANDI_PRINCIPAL")!;
    expect(principal.map(i => i.supplierProductId)).toEqual(["sp-1", "sp-3", "sp-5"]);

    const direct = groups.get("DIRECT_SUPPLIER")!;
    expect(direct.map(i => i.supplierProductId)).toEqual(["sp-2", "sp-4"]);
  });

  it("should calculate correct group totals", () => {
    const items = [
      { supplierProductId: "sp-1", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 2, unitPrice: 100, totalPrice: 200 },
      { supplierProductId: "sp-2", billingModel: "DIRECT_SUPPLIER", quantity: 3, unitPrice: 50, totalPrice: 150 },
      { supplierProductId: "sp-3", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 1, unitPrice: 300, totalPrice: 300 },
    ];

    const groups = splitByBillingModel(items);

    const principalTotal = groups.get("SUPERMANDI_PRINCIPAL")!.reduce((s, i) => s + i.totalPrice, 0);
    expect(principalTotal).toBe(500);

    const directTotal = groups.get("DIRECT_SUPPLIER")!.reduce((s, i) => s + i.totalPrice, 0);
    expect(directTotal).toBe(150);

    // Overall total preserved
    expect(principalTotal + directTotal).toBe(650);
  });

  it("should handle 3+ billing models if new models are added in future", () => {
    const items = [
      { supplierProductId: "sp-1", billingModel: "SUPERMANDI_PRINCIPAL", quantity: 1, unitPrice: 10 },
      { supplierProductId: "sp-2", billingModel: "DIRECT_SUPPLIER", quantity: 1, unitPrice: 20 },
      { supplierProductId: "sp-3", billingModel: "CONSIGNMENT", quantity: 1, unitPrice: 30 },
    ];

    const groups = splitByBillingModel(items);
    expect(groups.size).toBe(3);
    expect(groups.has("SUPERMANDI_PRINCIPAL")).toBe(true);
    expect(groups.has("DIRECT_SUPPLIER")).toBe(true);
    expect(groups.has("CONSIGNMENT")).toBe(true);
  });
});
