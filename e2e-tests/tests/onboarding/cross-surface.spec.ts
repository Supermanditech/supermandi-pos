/**
 * RO-010: Cross-Surface Login Smoke Tests @onboarding
 *
 * Verifies:
 * 1. Register on Portal → /me returns store with correct source
 * 2. Same phone on different surface → resolves to same store (idempotent)
 * 3. Lookup endpoint returns action-based response (DR-009)
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";
const RUN_ID = Date.now().toString(36);
const PHONE = `+919002${RUN_ID.slice(-6).padStart(6, "0")}`;
const GSTIN = `22AABCX${RUN_ID.slice(-4).padStart(4, "0")}C1Z3`;

test.describe("@onboarding Cross-Surface", () => {
  let storeId: string;

  test("1. Register on Portal, verify /me", async ({ request }) => {
    const regRes = await request.post(`${API_BASE}/api/v1/retailer/register`, {
      data: {
        phone: PHONE,
        otpProof: "dev-mode-skip",
        businessName: `CrossSurface Store ${RUN_ID}`,
        ownerName: "Cross Owner",
        gstin: GSTIN,
        source: "PORTAL",
      },
    });
    expect(regRes.status()).toBe(201);
    const regBody = await regRes.json();
    storeId = regBody.storeId;

    // Verify /me resolves the store
    const meRes = await request.get(`${API_BASE}/api/v1/retailer/me?phone=${encodeURIComponent(PHONE)}`);
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.store.storeId).toBe(storeId);
  });

  test("2. Same phone re-register from POS → same store", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/retailer/register`, {
      data: {
        phone: PHONE,
        otpProof: "dev-mode-skip",
        businessName: `CrossSurface Store ${RUN_ID}`,
        ownerName: "Cross Owner",
        gstin: GSTIN,
        source: "POS_MOBILE",
      },
    });
    expect(res.status()).toBe(200); // 200 for existing
    const body = await res.json();
    expect(body.storeId).toBe(storeId);
    expect(body.isExisting).toBe(true);
  });

  test("3. Lookup returns action-only response (DR-009)", async ({ request }) => {
    const res = await request.get(
      `${API_BASE}/api/v1/retailer-admin/registration/lookup?phone=${encodeURIComponent(PHONE)}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    // DR-009: No 'exists' boolean
    expect(body.exists).toBeUndefined();
    expect(body.action).toBeTruthy();
    expect(body.action).toBe("LOGIN_ALLOWED");
  });
});
