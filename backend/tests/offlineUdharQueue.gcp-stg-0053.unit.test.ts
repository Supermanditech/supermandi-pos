// GCP-STG-0053: Offline queue for Udhar/credit sales
// Tests that customer info flows through offline outbox and backend sync

import * as fs from "fs";
import * as path from "path";

const offlineSalesPath = path.resolve(__dirname, "../../src/services/offline/sales.ts");
const offlineSalesCode = fs.readFileSync(offlineSalesPath, "utf-8");

const posApiPath = path.resolve(__dirname, "../../src/services/api/posApi.ts");
const posApiCode = fs.readFileSync(posApiPath, "utf-8");

const salesRoutePath = path.resolve(__dirname, "../src/routes/v1/pos/sales.ts");
const salesRouteCode = fs.readFileSync(salesRoutePath, "utf-8");

const syncPath = path.resolve(__dirname, "../src/routes/v1/pos/sync.ts");
const syncCode = fs.readFileSync(syncPath, "utf-8");

describe("GCP-STG-0053: Offline Udhar queue with customer info", () => {
  describe("offline/sales.ts — recordOfflineDuePayment", () => {
    test("accepts customerName parameter", () => {
      expect(offlineSalesCode).toContain("customerName?: string");
    });

    test("accepts customerPhone parameter", () => {
      expect(offlineSalesCode).toContain("customerPhone?: string");
    });

    test("includes customerName in PAYMENT_DUE outbox event", () => {
      expect(offlineSalesCode).toContain("customerName: input.customerName ?? null");
    });

    test("includes customerPhone in PAYMENT_DUE outbox event", () => {
      expect(offlineSalesCode).toContain("customerPhone: input.customerPhone ?? null");
    });
  });

  describe("posApi.ts — recordDuePayment offline path", () => {
    test("passes customerName to recordOfflineDuePayment", () => {
      expect(posApiCode).toContain("customerName: input.customerName");
    });

    test("passes customerPhone to recordOfflineDuePayment", () => {
      expect(posApiCode).toContain("customerPhone: input.customerPhone");
    });
  });

  describe("backend POST /payments/due — accepts customer info from body", () => {
    test("destructures customerName from request body", () => {
      // The endpoint should read customerName from req.body
      const dueSection = salesRouteCode.slice(
        salesRouteCode.lastIndexOf('"/payments/due"'),
        salesRouteCode.indexOf('"/collections/upi/init"')
      );
      expect(dueSection).toContain("customerName");
      expect(dueSection).toContain("customerPhone");
    });

    test("updates sale with customer info before validation", () => {
      expect(salesRouteCode).toContain(
        "UPDATE sales SET customer_name = $1, customer_phone = $2 WHERE id = $3 AND store_id = $4"
      );
    });

    test("uses effectivePhone that combines sale record and request body", () => {
      expect(salesRouteCode).toContain("const effectivePhone = sale.customer_phone ||");
    });
  });

  describe("backend sync — PAYMENT_DUE sets customer info", () => {
    test("sync handler reads customerName from payload", () => {
      expect(syncCode).toContain('asTrimmedString((payload as any)?.customerName)');
    });

    test("sync handler reads customerPhone from payload", () => {
      expect(syncCode).toContain('asTrimmedString((payload as any)?.customerPhone)');
    });

    test("sync handler updates sale with customer info using COALESCE", () => {
      expect(syncCode).toContain(
        "UPDATE sales SET customer_name = COALESCE(customer_name, $1), customer_phone = COALESCE(customer_phone, $2)"
      );
    });
  });
});
