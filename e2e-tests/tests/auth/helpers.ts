/**
 * TQ-001: Auth E2E test helpers
 * Provides real JWT-based auth flows — NO x-actor-id shortcuts.
 */
import { APIRequestContext, expect } from "@playwright/test";

export const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const RUN_ID = Date.now().toString(36);

let phoneCounter = 0;
export function uniquePhone(): string {
  phoneCounter++;
  const base = (Date.now() % 100000).toString().padStart(5, "0");
  const cnt = phoneCounter.toString().padStart(3, "0");
  return `+91800${cnt}${base}`;
}

let gstinCounter = 0;
export function uniqueGstin(): string {
  gstinCounter++;
  const suffix = gstinCounter.toString().padStart(4, "0");
  return `27AABCA${suffix}A1Z5`;
}

export interface AuthContext {
  storeId: string;
  deviceToken: string;
  enrollmentCode: string;
  phone: string;
}

/**
 * Register a store + enroll a POS device.
 * Returns device token (JWT) for real authenticated API calls.
 */
export async function registerAndEnroll(
  request: APIRequestContext,
  label: string
): Promise<AuthContext> {
  const phone = uniquePhone();
  const gstin = uniqueGstin();

  // Register store (dev-mode OTP bypass)
  const regRes = await request.post(`${API_BASE}/api/v1/retailer/register`, {
    data: {
      phone,
      otpProof: "dev-mode-skip",
      businessName: `Auth Test ${label} ${RUN_ID}`,
      ownerName: `Owner ${label}`,
      gstin,
      source: "POS_DEVICE",
      deviceMeta: { model: "test", appVersion: "1.0.0" },
    },
  });

  expect(regRes.status(), `Registration failed for ${label}`).toBe(201);
  const regBody = await regRes.json();

  // Enroll POS device
  const enrollRes = await request.post(`${API_BASE}/api/v1/pos/enroll`, {
    data: {
      code: regBody.enrollmentCode,
      deviceMeta: {
        label: `auth-test-${label}-${RUN_ID}`,
        deviceType: "RETAILER_PHONE",
        model: "TestDevice",
        manufacturer: "TestMfg",
        appVersion: "1.0.0",
      },
    },
  });

  expect(enrollRes.status(), `Enrollment failed for ${label}`).toBeLessThan(300);
  const enrollBody = await enrollRes.json();

  return {
    storeId: regBody.storeId,
    deviceToken: enrollBody.deviceToken,
    enrollmentCode: regBody.enrollmentCode,
    phone,
  };
}

/**
 * Make authenticated request with device token (POS JWT).
 * This uses real x-device-token auth — NOT x-actor-id shortcuts.
 */
export function posAuthHeaders(deviceToken: string) {
  return {
    "x-device-token": deviceToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Make authenticated request with admin bearer token.
 */
export function adminAuthHeaders() {
  return {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
