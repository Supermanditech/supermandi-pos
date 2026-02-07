/**
 * Shared test utilities for Retailer ↔ POS sync tests
 * @retailer-pos-sync
 */
import { APIRequestContext, expect } from "@playwright/test";

export const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";
export const RUN_ID = Date.now().toString(36);

let barcodeCounter = 0;
/**
 * Generate a unique 13-digit barcode for test isolation.
 * Format: 8 + 8-digit timestamp slice + 4-digit sequence = 13 digits
 */
export function uniqueBarcode(): string {
  barcodeCounter++;
  const ts = Date.now().toString().slice(-8);
  const seq = barcodeCounter.toString().padStart(4, "0");
  return `8${ts}${seq}`;
}

let phoneCounter = 0;
export function uniquePhone(): string {
  phoneCounter++;
  const base = (Date.now() % 100000).toString().padStart(5, "0");
  const cnt = phoneCounter.toString().padStart(3, "0");
  return `+91900${cnt}${base}`;
}

let gstinCounter = 0;
export function uniqueGstin(): string {
  gstinCounter++;
  const suffix = gstinCounter.toString().padStart(4, "0");
  return `27AABCS${suffix}A1Z5`;
}

export interface TestStoreContext {
  storeId: string;
  deviceToken: string;
  enrollmentCode: string;
}

/**
 * Register a store and enroll a POS device.
 * Uses dev-mode-skip OTP bypass (local/staging only).
 */
export async function setupTestStore(
  request: APIRequestContext,
  suffix: string
): Promise<TestStoreContext> {
  const phone = uniquePhone();
  const gstin = uniqueGstin();

  // Step 1: Register store
  const registerRes = await request.post(`${API_BASE}/api/v1/retailer/register`, {
    data: {
      phone,
      otpProof: "dev-mode-skip",
      businessName: `Sync Test ${suffix} ${RUN_ID}`,
      ownerName: `Test Owner ${suffix}`,
      gstin,
      source: "POS_DEVICE",
      deviceMeta: { model: "test", appVersion: "1.0.0" },
    },
  });

  expect(registerRes.status(), `Registration failed for ${suffix}`).toBe(201);
  const registerBody = await registerRes.json();
  const storeId = registerBody.storeId;
  const enrollmentCode = registerBody.enrollmentCode;
  expect(storeId, "storeId missing from registration").toBeTruthy();
  expect(enrollmentCode, "enrollmentCode missing from registration").toBeTruthy();

  // Step 2: Enroll POS device
  const enrollRes = await request.post(`${API_BASE}/api/v1/pos/enroll`, {
    data: {
      code: enrollmentCode,
      deviceMeta: {
        label: `test-device-${suffix}-${RUN_ID}`,
        deviceType: "RETAILER_PHONE",
        model: "TestDevice",
        manufacturer: "TestMfg",
        appVersion: "1.0.0",
      },
    },
  });

  expect(enrollRes.status(), `Enrollment failed for ${suffix}`).toBeLessThan(300);
  const enrollBody = await enrollRes.json();
  const deviceToken = enrollBody.deviceToken;
  expect(deviceToken, "deviceToken missing from enrollment").toBeTruthy();

  return { storeId, deviceToken, enrollmentCode };
}

/** Retailer Dashboard auth headers */
export function retailerHeaders(storeId: string) {
  return {
    "x-actor-id": storeId,
    "x-actor-type": "STORE",
    "Content-Type": "application/json",
  };
}

/** POS device auth headers */
export function posHeaders(deviceToken: string) {
  return {
    "x-device-token": deviceToken,
    "Content-Type": "application/json",
  };
}
