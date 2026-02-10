/**
 * SA-P0-001: Store Suspension & Reactivation — E2E Tests
 * @store_suspension
 *
 * Full end-to-end flow:
 * 1. Create and activate a test store with enrolled POS device
 * 2. Suspend store with reason → verify status=SUSPENDED
 * 3. POS store status returns active=false, status=SUSPENDED
 * 4. POS ui-status returns storeActive=false, storeStatus=SUSPENDED
 * 5. Reactivate store → verify status=ACTIVE
 * 6. POS endpoints reflect active=true after reactivation
 * 7. Audit trail: verify suspension and reactivation logged
 * 8. Edge cases: invalid transitions, double-suspend
 *
 * Run:
 *   npx playwright test --grep "@store_suspension" --project=chromium
 *
 * Prerequisites:
 *   - Backend running at localhost:3010 (or set API_BASE_URL)
 *   - Migrations applied (094, 095, 096 for store state machine + audit)
 */

import { test, expect } from "@playwright/test";
import {
  setupTestStore,
  adminActivateStore,
  adminChangeStoreStatus,
  getStoreStatusHistory,
  getPosStoreStatus,
  getPosUiStatus,
  TestStoreContext,
} from "./helpers";

// API-only tests: run sequentially on chromium only
test.use({ browserName: "chromium" });

test.describe.serial(
  "@store_suspension SA-P0-001: Store Suspension & Reactivation",
  () => {
    // Admin endpoints share a rate limiter; allow extra time
    test.describe.configure({ timeout: 180_000 });

    let store: TestStoreContext;

    // =========================================================================
    // SETUP
    // =========================================================================

    test("0. Setup: register and activate a test store", async ({ request }) => {
      store = await setupTestStore(request, "susp1");

      // Activate store via admin (DRAFT → SUSPENDED → ACTIVE)
      await adminActivateStore(request, store.storeId);

      // Verify store is now ACTIVE
      const posStatus = await getPosStoreStatus(
        request,
        store.storeId,
        store.deviceToken
      );
      expect(posStatus.status).toBe(200);
      expect(posStatus.body.active).toBe(true);
      expect(posStatus.body.status).toBe("ACTIVE");
    });

    // =========================================================================
    // SUSPEND
    // =========================================================================

    test("1. Admin suspends store with reason", async ({ request }) => {
      const result = await adminChangeStoreStatus(
        request,
        store.storeId,
        "SUSPENDED",
        "Fraud investigation - suspicious activity detected"
      );

      expect(result.status, `Suspend failed: ${JSON.stringify(result.body)}`).toBe(200);
      expect(result.body.store.status).toBe("SUSPENDED");
      expect(result.body.previous_status).toBe("ACTIVE");
    });

    test("2. POS store status returns active=false when SUSPENDED", async ({
      request,
    }) => {
      const posStatus = await getPosStoreStatus(
        request,
        store.storeId,
        store.deviceToken
      );

      expect(posStatus.status).toBe(200);
      expect(posStatus.body.active).toBe(false);
      expect(posStatus.body.status).toBe("SUSPENDED");
      expect(posStatus.body.statusReason).toContain("Fraud investigation");
    });

    test("3. POS ui-status returns storeActive=false, storeStatus=SUSPENDED", async ({
      request,
    }) => {
      const uiStatus = await getPosUiStatus(request, store.deviceToken);

      expect(uiStatus.status).toBe(200);
      expect(uiStatus.body.storeActive).toBe(false);
      expect(uiStatus.body.storeStatus).toBe("SUSPENDED");
    });

    // =========================================================================
    // REACTIVATE
    // =========================================================================

    test("4. Admin reactivates suspended store", async ({ request }) => {
      const result = await adminChangeStoreStatus(
        request,
        store.storeId,
        "ACTIVE",
        "Investigation complete - cleared"
      );

      expect(result.status, `Reactivate failed: ${JSON.stringify(result.body)}`).toBe(200);
      expect(result.body.store.status).toBe("ACTIVE");
      expect(result.body.previous_status).toBe("SUSPENDED");
    });

    test("5. POS store status returns active=true after reactivation", async ({
      request,
    }) => {
      const posStatus = await getPosStoreStatus(
        request,
        store.storeId,
        store.deviceToken
      );

      expect(posStatus.status).toBe(200);
      expect(posStatus.body.active).toBe(true);
      expect(posStatus.body.status).toBe("ACTIVE");
    });

    test("6. POS ui-status returns storeActive=true after reactivation", async ({
      request,
    }) => {
      const uiStatus = await getPosUiStatus(request, store.deviceToken);

      expect(uiStatus.status).toBe(200);
      expect(uiStatus.body.storeActive).toBe(true);
      expect(uiStatus.body.storeStatus).toBe("ACTIVE");
    });

    // =========================================================================
    // AUDIT TRAIL
    // =========================================================================

    test("7. Audit trail records suspension and reactivation", async ({
      request,
    }) => {
      const history = await getStoreStatusHistory(request, store.storeId);

      // Should have at least: initial→SUSPENDED(setup)→ACTIVE(setup)→SUSPENDED→ACTIVE
      expect(history.length).toBeGreaterThanOrEqual(4);

      // Find the ACTIVE→SUSPENDED entry (from test 1)
      const suspendEntry = history.find(
        (h: any) => h.old_status === "ACTIVE" && h.new_status === "SUSPENDED"
      );
      expect(suspendEntry, "Suspend audit entry not found").toBeTruthy();
      expect(suspendEntry.reason).toContain("Fraud investigation");

      // Find the SUSPENDED→ACTIVE entry (from test 4)
      const reactivateEntry = history.find(
        (h: any) =>
          h.old_status === "SUSPENDED" &&
          h.new_status === "ACTIVE" &&
          h.reason?.includes("Investigation complete")
      );
      expect(reactivateEntry, "Reactivate audit entry not found").toBeTruthy();
    });

    // =========================================================================
    // EDGE CASES
    // =========================================================================

    test("8. Cannot suspend an already-SUSPENDED store", async ({ request }) => {
      // First suspend the store
      const suspendRes = await adminChangeStoreStatus(
        request,
        store.storeId,
        "SUSPENDED",
        "Suspending again for edge case test"
      );
      expect(suspendRes.status).toBe(200);

      // Try to suspend again — should fail (SUSPENDED→SUSPENDED is not a valid transition)
      const doubleSuspend = await adminChangeStoreStatus(
        request,
        store.storeId,
        "SUSPENDED",
        "Double suspend attempt"
      );
      expect(doubleSuspend.status).toBe(400);
      expect(doubleSuspend.body.error).toBe("invalid_transition");

      // Clean up: reactivate
      await adminChangeStoreStatus(
        request,
        store.storeId,
        "ACTIVE",
        "Cleanup after edge case test"
      );
    });

    test("9. Cannot transition ACTIVE to invalid status", async ({
      request,
    }) => {
      // ACTIVE → DRAFT is not a valid transition
      const result = await adminChangeStoreStatus(
        request,
        store.storeId,
        "DRAFT",
        "Invalid transition attempt"
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_transition");
    });
  }
);
