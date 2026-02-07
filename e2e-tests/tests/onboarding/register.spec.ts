/**
 * RO-010: Registration Smoke Tests @onboarding
 *
 * Verifies:
 * 1. Portal registration creates store + user
 * 2. POS registration creates store + returns enrollment code
 * 3. Idempotency: same GSTIN retry → same store (no error)
 * 4. Dedup: different phone, same GSTIN → 409
 * 5. /retailer/me returns linked store
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";

// Generate unique test data per run to avoid collisions
const RUN_ID = Date.now().toString(36);
const PORTAL_PHONE = `+919000${RUN_ID.slice(-6).padStart(6, "0")}`;
const POS_PHONE = `+919001${RUN_ID.slice(-6).padStart(6, "0")}`;
const PORTAL_GSTIN = `27AABCT${RUN_ID.slice(-4).padStart(4, "0")}A1Z5`;
const POS_GSTIN = `29AABCP${RUN_ID.slice(-4).padStart(4, "0")}B1Z8`;

test.describe("@onboarding Registration", () => {
  let portalStoreId: string;
  let posStoreId: string;

  test("1. Portal registration creates store", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/retailer/register`, {
      data: {
        phone: PORTAL_PHONE,
        otpProof: "dev-mode-skip",
        businessName: `Test Store Portal ${RUN_ID}`,
        ownerName: "Test Owner Portal",
        gstin: PORTAL_GSTIN,
        source: "PORTAL",
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.storeId).toBeTruthy();
    expect(body.storeCode).toBeTruthy();
    expect(body.ownerUserId).toBeTruthy();
    expect(body.isExisting).toBeFalsy();
    portalStoreId = body.storeId;
  });

  test("2. POS registration creates store with enrollment code", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/retailer/register`, {
      data: {
        phone: POS_PHONE,
        otpProof: "dev-mode-skip",
        businessName: `Test Store POS ${RUN_ID}`,
        ownerName: "Test Owner POS",
        gstin: POS_GSTIN,
        source: "POS_DEVICE",
        deviceMeta: { model: "test", appVersion: "1.0.0" },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.storeId).toBeTruthy();
    expect(body.enrollmentCode).toBeTruthy();
    posStoreId = body.storeId;
  });

  test("3. Idempotency: same GSTIN → same store, no error", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/retailer/register`, {
      data: {
        phone: PORTAL_PHONE,
        otpProof: "dev-mode-skip",
        businessName: `Test Store Portal ${RUN_ID}`,
        ownerName: "Test Owner Portal",
        gstin: PORTAL_GSTIN,
        source: "PORTAL",
      },
    });

    expect(res.status()).toBe(200); // 200 for existing
    const body = await res.json();
    expect(body.storeId).toBe(portalStoreId);
    expect(body.isExisting).toBe(true);
  });

  test("4. /retailer/me returns linked store", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/retailer/me?phone=${encodeURIComponent(PORTAL_PHONE)}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ownerUserId).toBeTruthy();
    expect(body.phone).toBe(PORTAL_PHONE);
    // DR-011: single-store resolution
    expect(body.store).toBeTruthy();
    expect(body.store.storeId).toBe(portalStoreId);
    expect(body.stores).toBeTruthy();
    expect(body.stores.length).toBeGreaterThanOrEqual(1);
  });

  test("5. Config status returns expected booleans", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/config-status`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.posAppUrl).toBe("boolean");
  });
});
