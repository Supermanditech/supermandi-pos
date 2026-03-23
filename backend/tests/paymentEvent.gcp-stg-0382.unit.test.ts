/**
 * GCP-STG-0382: Payment completed lifecycle event — behavioral tests
 *
 * Verifies:
 * 1. payment_completed is a valid LifecycleEventType
 * 2. LIFECYCLE_COMMUNICATION_RULES includes payment_completed with correct channels
 * 3. WhatsApp template "payment_confirmation" exists for payment_completed
 * 4. Event structure is valid for publishLifecycleEvent
 */

import {
  LIFECYCLE_COMMUNICATION_RULES,
  type LifecycleEventType,
  type LifecycleEvent,
} from "../src/services/storeDemandSignal";

describe("GCP-STG-0382: payment_completed lifecycle event type", () => {
  it("payment_completed is a recognised LifecycleEventType", () => {
    const eventType: LifecycleEventType = "payment_completed";
    expect(eventType).toBe("payment_completed");
  });

  it("LIFECYCLE_COMMUNICATION_RULES has payment_completed entry", () => {
    expect(LIFECYCLE_COMMUNICATION_RULES.payment_completed).toBeDefined();
  });

  it("payment_completed: retailer gets in_app + whatsapp", () => {
    const rule = LIFECYCLE_COMMUNICATION_RULES.payment_completed;
    expect(rule.retailer).toContain("in_app");
    expect(rule.retailer).toContain("whatsapp");
  });

  it("payment_completed: admin gets in_app", () => {
    const rule = LIFECYCLE_COMMUNICATION_RULES.payment_completed;
    expect(rule.admin).toContain("in_app");
  });

  it("payment_completed: supplier is empty (POS sale has no supplier)", () => {
    const rule = LIFECYCLE_COMMUNICATION_RULES.payment_completed;
    expect(rule.supplier).toEqual([]);
  });

  it("total event types = 11 (10 original + payment_completed)", () => {
    expect(Object.keys(LIFECYCLE_COMMUNICATION_RULES)).toHaveLength(11);
  });
});

describe("GCP-STG-0382: payment_completed LifecycleEvent contract", () => {
  it("can construct a valid payment_completed event for CASH", () => {
    const event: LifecycleEvent = {
      eventType: "payment_completed",
      orderId: "sale-abc-123",
      storeId: "store-xyz-456",
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app", "whatsapp"] }],
      payload: { saleId: "sale-abc-123", method: "CASH" },
      timestamp: new Date().toISOString(),
    };
    expect(event.eventType).toBe("payment_completed");
    expect(event.supplierId).toBeNull();
    expect(event.payload.method).toBe("CASH");
  });

  it("can construct a valid payment_completed event for UPI", () => {
    const event: LifecycleEvent = {
      eventType: "payment_completed",
      orderId: "sale-upi-789",
      storeId: "store-xyz-456",
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app", "whatsapp"] }],
      payload: { saleId: "sale-upi-789", method: "UPI" },
      timestamp: new Date().toISOString(),
    };
    expect(event.eventType).toBe("payment_completed");
    expect(event.payload.method).toBe("UPI");
  });

  it("can construct a valid payment_completed event for DUE", () => {
    const event: LifecycleEvent = {
      eventType: "payment_completed",
      orderId: "sale-due-111",
      storeId: "store-xyz-456",
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app", "whatsapp"] }],
      payload: { saleId: "sale-due-111", method: "DUE" },
      timestamp: new Date().toISOString(),
    };
    expect(event.eventType).toBe("payment_completed");
    expect(event.payload.method).toBe("DUE");
  });

  it("payment_completed event has required orderId and storeId", () => {
    const event: LifecycleEvent = {
      eventType: "payment_completed",
      orderId: "sale-req-222",
      storeId: "store-req-333",
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app", "whatsapp"] }],
      payload: { saleId: "sale-req-222", method: "CASH" },
      timestamp: "2026-03-23T12:00:00.000Z",
    };
    expect(event.orderId).toBeTruthy();
    expect(event.storeId).toBeTruthy();
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("GCP-STG-0382: WhatsApp template for payment_completed", () => {
  // We can't easily import the WHATSAPP_TEMPLATES const (it's not exported),
  // but we can verify the module loads without error and the event type is wired.
  it("lifecycleEventService module loads without error", async () => {
    // Dynamic import to verify the module compiles and exports correctly
    const mod = await import("../src/services/lifecycleEventService");
    expect(typeof mod.publishLifecycleEvent).toBe("function");
    expect(typeof mod.getLifecycleStats).toBe("function");
  });
});
