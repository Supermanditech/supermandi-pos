/**
 * Shared test utilities for Supplier → POS Purchase pipeline tests
 * @supplier_purchase
 */
import { APIRequestContext, expect } from "@playwright/test";

export const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-admin-token";
export const RUN_ID = Date.now().toString(36);

let barcodeCounter = 0;
export function uniqueBarcode(): string {
  barcodeCounter++;
  const ts = Date.now().toString().slice(-8);
  const seq = barcodeCounter.toString().padStart(4, "0");
  return `9${ts}${seq}`;
}

let phoneCounter = 0;
export function uniquePhone(): string {
  phoneCounter++;
  const base = (Date.now() % 100000).toString().padStart(5, "0");
  const cnt = phoneCounter.toString().padStart(3, "0");
  return `+91800${cnt}${base}`;
}

let emailCounter = 0;
export function uniqueEmail(): string {
  emailCounter++;
  return `sup_test_${RUN_ID}_${emailCounter}@test.supermandi.com`;
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

export interface TestSupplierContext {
  supplierId: string;
  token: string;
  email: string;
  businessName: string;
}

/** Admin auth headers */
export function adminHeaders() {
  return {
    "x-admin-token": ADMIN_TOKEN,
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

/** Supplier auth headers */
export function supplierHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** Retailer dashboard auth headers */
export function retailerHeaders(storeId: string) {
  return {
    "x-actor-id": storeId,
    "x-actor-type": "STORE",
    "Content-Type": "application/json",
  };
}

/**
 * Register a store and enroll a POS device.
 * Uses dev-mode-skip OTP bypass.
 */
export async function setupTestStore(
  request: APIRequestContext,
  suffix: string
): Promise<TestStoreContext> {
  const phone = uniquePhone();
  const gstin = uniqueGstin();

  const registerRes = await request.post(`${API_BASE}/api/v1/retailer/register`, {
    data: {
      phone,
      otpProof: "dev-mode-skip",
      businessName: `SPurchase Store ${suffix} ${RUN_ID}`,
      ownerName: `Test Owner ${suffix}`,
      gstin,
      source: "POS_DEVICE",
      deviceMeta: { model: "test", appVersion: "1.0.0" },
    },
  });

  expect(registerRes.status(), `Store registration failed for ${suffix}`).toBe(201);
  const body = await registerRes.json();
  const { storeId, enrollmentCode } = body;
  expect(storeId).toBeTruthy();
  expect(enrollmentCode).toBeTruthy();

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

  expect(enrollRes.status(), `POS enrollment failed for ${suffix}`).toBeLessThan(300);
  const enrollBody = await enrollRes.json();
  const { deviceToken } = enrollBody;
  expect(deviceToken).toBeTruthy();

  return { storeId, deviceToken, enrollmentCode };
}

/**
 * Register a supplier via email/password auth.
 * Uses the /auth/register endpoint (email+password, non-Firebase).
 */
export async function setupTestSupplier(
  request: APIRequestContext,
  suffix: string
): Promise<TestSupplierContext> {
  const email = uniqueEmail();
  const gstin = uniqueGstin();
  const businessName = `SPurchase Supplier ${suffix} ${RUN_ID}`;

  const res = await request.post(`${API_BASE}/api/v1/supplier/auth/register`, {
    data: {
      email,
      password: "TestPass123!",
      businessName,
      gstin,
      phone: uniquePhone(),
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    },
  });

  expect(res.status(), `Supplier registration failed for ${suffix}`).toBe(201);
  const body = await res.json();
  const { token, supplier } = body.data;
  expect(token).toBeTruthy();
  expect(supplier.id).toBeTruthy();

  return {
    supplierId: supplier.id,
    token,
    email,
    businessName,
  };
}

/**
 * Admin approves a self-registered supplier (registered → verified).
 * Uses /admin/suppliers/:id/approve for self-registered suppliers
 * (not /admin/pending-suppliers/:id/verify which is for store-submitted requests).
 */
export async function adminVerifySupplier(
  request: APIRequestContext,
  supplierId: string
): Promise<void> {
  const res = await request.post(
    `${API_BASE}/api/v1/admin/suppliers/${supplierId}/approve`,
    { headers: adminHeaders() }
  );
  // Accept 200 or 400 (already verified)
  expect([200, 400]).toContain(res.status());
}

/**
 * Admin links a supplier to a store.
 */
export async function adminLinkSupplierToStore(
  request: APIRequestContext,
  storeId: string,
  supplierId: string
): Promise<void> {
  const res = await request.post(
    `${API_BASE}/api/v1/retailer-admin/suppliers/${supplierId}/link`,
    {
      headers: retailerHeaders(storeId),
      data: { isPreferred: false },
    }
  );
  expect([200, 201, 409]).toContain(res.status());
}
