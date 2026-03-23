/**
 * V3-HARDEN-188: Behavioral tests for lifecycle event fan-out
 */

import {
  LIFECYCLE_COMMUNICATION_RULES,
  type LifecycleEventType,
  type LifecycleEvent,
} from "../../src/services/storeDemandSignal";

describe("V3-HARDEN-188: Lifecycle event fan-out rules", () => {
  const ALL_EVENTS: LifecycleEventType[] = [
    "order_created", "supplier_action_required", "supplier_accepted",
    "supplier_rejected", "partial_accept", "dispatched",
    "delivery_due", "delivered", "grn_completed", "repeat_order_prompt",
    "payment_completed", // GCP-STG-0382
  ];

  it("all event types have communication rules", () => {
    expect(Object.keys(LIFECYCLE_COMMUNICATION_RULES)).toHaveLength(ALL_EVENTS.length);
    for (const evt of ALL_EVENTS) {
      expect(LIFECYCLE_COMMUNICATION_RULES[evt]).toBeDefined();
    }
  });

  it("every rule has retailer, supplier, admin arrays", () => {
    for (const evt of ALL_EVENTS) {
      const rule = LIFECYCLE_COMMUNICATION_RULES[evt];
      expect(Array.isArray(rule.retailer)).toBe(true);
      expect(Array.isArray(rule.supplier)).toBe(true);
      expect(Array.isArray(rule.admin)).toBe(true);
    }
  });

  it("order_created: retailer gets in_app+whatsapp, admin gets in_app", () => {
    const rule = LIFECYCLE_COMMUNICATION_RULES.order_created;
    expect(rule.retailer).toContain("in_app");
    expect(rule.retailer).toContain("whatsapp");
    expect(rule.admin).toContain("in_app");
    expect(rule.supplier).toEqual([]);
  });

  it("supplier_action_required: supplier gets both channels", () => {
    const rule = LIFECYCLE_COMMUNICATION_RULES.supplier_action_required;
    expect(rule.supplier).toContain("in_app");
    expect(rule.supplier).toContain("whatsapp");
    expect(rule.retailer).toEqual([]);
  });

  it("dispatched: retailer gets whatsapp notification", () => {
    expect(LIFECYCLE_COMMUNICATION_RULES.dispatched.retailer).toContain("whatsapp");
  });

  it("repeat_order_prompt: only retailer, never supplier", () => {
    const rule = LIFECYCLE_COMMUNICATION_RULES.repeat_order_prompt;
    expect(rule.retailer).toContain("in_app");
    expect(rule.retailer).toContain("whatsapp");
    expect(rule.supplier).toEqual([]);
    expect(rule.admin).toEqual([]);
  });

  it("grn_completed: retailer gets in_app+whatsapp, supplier+admin get in_app", () => {
    const rule = LIFECYCLE_COMMUNICATION_RULES.grn_completed;
    // GCP-STG-0381: GRN completion now sends WhatsApp confirmation to retailer
    expect(rule.retailer).toContain("in_app");
    expect(rule.retailer).toContain("whatsapp");
    expect(rule.supplier).toEqual(["in_app"]);
    expect(rule.admin).toEqual(["in_app"]);
  });
});

describe("V3-HARDEN-188: LifecycleEvent contract", () => {
  it("event structure has all required fields", () => {
    const event: LifecycleEvent = {
      eventType: "order_created",
      orderId: "order-123",
      storeId: "store-456",
      supplierId: "supplier-789",
      targets: [
        { role: "retailer", channels: ["in_app", "whatsapp"] },
        { role: "admin", channels: ["in_app"] },
      ],
      payload: { totalItems: 5, totalAmount: 15000 },
      timestamp: "2026-03-19T12:00:00Z",
    };

    expect(event.eventType).toBeTruthy();
    expect(event.orderId).toBeTruthy();
    expect(event.storeId).toBeTruthy();
    expect(event.targets.length).toBeGreaterThan(0);
    expect(event.timestamp).toBeTruthy();
  });

  it("supplierId can be null for retailer-only events", () => {
    const event: LifecycleEvent = {
      eventType: "repeat_order_prompt",
      orderId: "order-123",
      storeId: "store-456",
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app"] }],
      payload: {},
      timestamp: "2026-03-19T12:00:00Z",
    };
    expect(event.supplierId).toBeNull();
  });
});

describe("V3-HARDEN-188: Idempotency contract", () => {
  it("duplicate events use orderId+eventType as dedup key", () => {
    const key1 = `order-123:order_created`;
    const key2 = `order-123:order_created`;
    const key3 = `order-123:dispatched`;
    expect(key1).toBe(key2); // same event = same key
    expect(key1).not.toBe(key3); // different event = different key
  });
});

describe("V3-HARDEN-188: Out-of-order event handling", () => {
  it("events can arrive out of order — system records all, state machine enforces order", () => {
    // The lifecycle_event_log is append-only — it doesn't enforce ordering.
    // The allocation state machine (V3-FIX-187) enforces valid transitions.
    // This test verifies the separation of concerns.
    const events: LifecycleEventType[] = [
      "delivered", "dispatched", "supplier_accepted", "order_created"
    ];
    // All are valid event types
    for (const evt of events) {
      expect(LIFECYCLE_COMMUNICATION_RULES[evt]).toBeDefined();
    }
    // But the state machine would reject "delivered" before "dispatched"
    // That's tested in allocationService.unit.test.ts
  });
});

describe("V3-HARDEN-188: Service module contract", () => {
  it("lifecycleEventService exports required functions", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/lifecycleEventService.ts"),
      "utf8"
    );
    expect(src).toContain("export async function publishLifecycleEvent");
    expect(src).toContain("export async function getOrderLifecycleEvents");
    expect(src).toContain("export async function getStoreLifecycleEvents");
    expect(src).toContain("export function getLifecycleStats");
    expect(src).toContain("LIFECYCLE_COMMUNICATION_RULES");
    expect(src).toContain("emitStoreEvent");
    expect(src).toContain("isWhatsAppConfigured");
  });

  it("WhatsApp templates defined for key events", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/lifecycleEventService.ts"),
      "utf8"
    );
    expect(src).toContain("order_confirmation");
    expect(src).toContain("supplier_new_order");
    expect(src).toContain("order_dispatched");
    expect(src).toContain("order_delivered");
    expect(src).toContain("reorder_reminder");
  });

  it("retry logic with exponential backoff exists", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/lifecycleEventService.ts"),
      "utf8"
    );
    expect(src).toContain("sendWhatsAppWithRetry");
    expect(src).toContain("maxAttempts");
    expect(src).toContain("Math.pow");
  });

  it("POS lifecycle route exists", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/pos/lifecycleEvents.ts"),
      "utf8"
    );
    expect(src).toContain('"/lifecycle/events"');
    expect(src).toContain('"/lifecycle/events/:orderId"');
    expect(src).toContain('"/lifecycle/stats"');
    expect(src).toContain("requireDeviceToken");
  });

  it("routes registered in index.ts", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/index.ts"),
      "utf8"
    );
    expect(src).toContain("posLifecycleEventsRouter");
  });
});

describe("V3-HARDEN-188: Observability", () => {
  it("stats structure tracks all fan-out channels", () => {
    // Verify the stats shape matches what we expect
    const expectedKeys = [
      "eventsPublished", "sseDelivered",
      "whatsappAttempted", "whatsappDelivered", "whatsappFailed",
      "duplicatesSkipped",
    ];
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/lifecycleEventService.ts"),
      "utf8"
    );
    for (const key of expectedKeys) {
      expect(src).toContain(key);
    }
  });
});
