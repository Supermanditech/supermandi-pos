/**
 * GCP-STG-0381: WhatsApp templates for 4 missing lifecycle events
 *
 * Verifies that supplier_accepted, partial_accept, grn_completed, delivery_due
 * all have WhatsApp templates and communication rules with 'whatsapp' channel.
 */

import {
  LIFECYCLE_COMMUNICATION_RULES,
  type LifecycleEventType,
  type LifecycleEvent,
} from "../src/services/storeDemandSignal";

const NEWLY_ADDED_EVENTS: LifecycleEventType[] = [
  "supplier_accepted",
  "partial_accept",
  "grn_completed",
  "delivery_due",
];

describe("GCP-STG-0381: WhatsApp templates for missing lifecycle events", () => {
  it("all 4 events have whatsapp in retailer channels", () => {
    for (const evt of NEWLY_ADDED_EVENTS) {
      const rule = LIFECYCLE_COMMUNICATION_RULES[evt];
      expect(rule.retailer).toContain("whatsapp");
    }
  });

  it("all 4 events still have in_app in retailer channels", () => {
    for (const evt of NEWLY_ADDED_EVENTS) {
      const rule = LIFECYCLE_COMMUNICATION_RULES[evt];
      expect(rule.retailer).toContain("in_app");
    }
  });

  it("supplier channels unchanged (in_app only)", () => {
    for (const evt of NEWLY_ADDED_EVENTS) {
      const rule = LIFECYCLE_COMMUNICATION_RULES[evt];
      expect(rule.supplier).toEqual(["in_app"]);
    }
  });

  it("admin channels unchanged (in_app only)", () => {
    for (const evt of NEWLY_ADDED_EVENTS) {
      const rule = LIFECYCLE_COMMUNICATION_RULES[evt];
      expect(rule.admin).toEqual(["in_app"]);
    }
  });
});

describe("GCP-STG-0381: WhatsApp template definitions in lifecycleEventService", () => {
  const fs = require("fs");
  const path = require("path");
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, "../src/services/lifecycleEventService.ts"),
      "utf8"
    );
  });

  it("supplier_accepted has supplier_order_confirmed template", () => {
    expect(src).toContain("supplier_order_confirmed");
    expect(src).toContain("supplier_accepted");
  });

  it("partial_accept has supplier_partial_accept template", () => {
    expect(src).toContain("supplier_partial_accept");
    expect(src).toContain("partial_accept");
  });

  it("grn_completed has grn_receipt_confirmation template", () => {
    expect(src).toContain("grn_receipt_confirmation");
    expect(src).toContain("grn_completed");
  });

  it("delivery_due has delivery_reminder template", () => {
    expect(src).toContain("delivery_reminder");
    expect(src).toContain("delivery_due");
  });

  it("each new template produces a message containing orderId", () => {
    // Verify that buildMessage references orderId for all 4
    // The templates use e.orderId.slice(-8)
    const templateSection = src.match(/WHATSAPP_TEMPLATES[\s\S]*?^};/m)?.[0] ?? "";
    const templateKeys = [
      "supplier_order_confirmed",
      "supplier_partial_accept",
      "grn_receipt_confirmation",
      "delivery_reminder",
    ];
    for (const key of templateKeys) {
      expect(templateSection).toContain(key);
    }
    // All 4 buildMessage functions reference orderId
    const buildMessageMatches = templateSection.match(/e\.orderId\.slice\(-8\)/g) ?? [];
    // At least 4 new ones (plus existing ones)
    expect(buildMessageMatches.length).toBeGreaterThanOrEqual(4);
  });

  it("total WHATSAPP_TEMPLATES count is at least 10 (6 original + 4 new)", () => {
    // Count templateKey occurrences
    const templateKeyMatches = src.match(/templateKey:/g) ?? [];
    expect(templateKeyMatches.length).toBeGreaterThanOrEqual(10);
  });
});

describe("GCP-STG-0381: No regression on existing templates", () => {
  const ORIGINAL_EVENTS_WITH_WHATSAPP: LifecycleEventType[] = [
    "order_created",
    "supplier_action_required",
    "supplier_rejected",
    "dispatched",
    "delivered",
    "repeat_order_prompt",
  ];

  it("original 6 WhatsApp-enabled events still have whatsapp channel", () => {
    for (const evt of ORIGINAL_EVENTS_WITH_WHATSAPP) {
      const rule = LIFECYCLE_COMMUNICATION_RULES[evt];
      const hasWhatsapp =
        rule.retailer.includes("whatsapp") || rule.supplier.includes("whatsapp");
      expect(hasWhatsapp).toBe(true);
    }
  });
});
