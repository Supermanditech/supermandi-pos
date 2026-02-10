/**
 * Shared test utilities for SA-P0-001: Store Suspension & Reactivation tests
 * @store_suspension
 */
import { APIRequestContext, expect } from "@playwright/test";

export const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "local-test-token";
export const RUN_ID =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------------------------------------------------------------------
// Rate-limit retry
// ---------------------------------------------------------------------------

async function retryOn429<T extends { status: number }>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();
    if (result.status !== 429 || attempt === maxRetries) return result;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return fn();
}

export async function withRateLimitRetry(
  fn: () => Promise<{ status: number; body: any }>
): Promise<{ status: number; body: any }> {
  return retryOn429(fn);
}

// ---------------------------------------------------------------------------
// Unique data generators
// ---------------------------------------------------------------------------

let phoneCounter = 0;
export function uniquePhone(): string {
  phoneCounter++;
  const ts = Date.now().toString().slice(-5);
  const rnd = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");
  const cnt = phoneCounter.toString().padStart(2, "0");
  return `+918${ts}${rnd}${cnt}`;
}

let gstinCounter = 0;
export function uniqueGstin(): string {
  gstinCounter++;
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const r = () => alpha[Math.floor(Math.random() * 26)];
  const cnt = gstinCounter.toString().padStart(4, "0");
  return `27${r()}${r()}${r()}SS${cnt}A1Z5`;
}

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export interface TestStoreContext {
  storeId: string;
  deviceToken: string;
  enrollmentCode: string;
}

// ---------------------------------------------------------------------------
// Auth header builders
// ---------------------------------------------------------------------------

export function adminHeaders() {
  return {
    "x-admin-token": ADMIN_TOKEN,
    "Content-Type": "application/json",
  };
}

export function posHeaders(deviceToken: string) {
  return {
    "x-device-token": deviceToken,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Store setup helpers
// ---------------------------------------------------------------------------

/**
 * Create a store and enroll a POS device via admin endpoints.
 * Uses admin store creation (no OTP needed) + admin enrollment code + POS enroll.
 * Store starts in DRAFT status after creation.
 */
export async function setupTestStore(
  request: APIRequestContext,
  suffix: string
): Promise<TestStoreContext> {
  // Step 1: Create store via admin endpoint (no OTP required)
  const createRes = await request.post(`${API_BASE}/api/v1/admin/stores`, {
    headers: adminHeaders(),
    data: {
      storeName: `Suspend Test ${suffix} ${RUN_ID}`,
    },
  });

  expect(createRes.status(), `Store creation failed for ${suffix}`).toBe(201);
  const createBody = await createRes.json();
  const storeId = createBody.store?.id;
  expect(storeId, "storeId missing from admin store creation").toBeTruthy();

  // Step 2: Create enrollment code via admin endpoint
  const enrollCodeRes = await request.post(
    `${API_BASE}/api/v1/admin/stores/${storeId}/device-enrollments`,
    { headers: adminHeaders() }
  );

  expect(enrollCodeRes.status(), `Enrollment code creation failed for ${suffix}`).toBe(200);
  const enrollCodeBody = await enrollCodeRes.json();
  const enrollmentCode = enrollCodeBody.code;
  expect(enrollmentCode, "enrollmentCode missing").toBeTruthy();

  // Step 3: Enroll POS device
  const enrollRes = await request.post(`${API_BASE}/api/v1/pos/enroll`, {
    data: {
      code: enrollmentCode,
      deviceMeta: {
        label: `suspend-test-${suffix}-${RUN_ID}`,
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
  expect(deviceToken, "deviceToken missing").toBeTruthy();

  return { storeId, deviceToken, enrollmentCode };
}

// ---------------------------------------------------------------------------
// Admin store status helpers
// ---------------------------------------------------------------------------

/**
 * Admin: Change store status via state machine.
 * Auto-retries on 429.
 */
export async function adminChangeStoreStatus(
  request: APIRequestContext,
  storeId: string,
  status: string,
  reason?: string
): Promise<{ status: number; body: any }> {
  const makeRequest = async () => {
    const res = await request.patch(
      `${API_BASE}/api/v1/admin/stores/${storeId}/status`,
      {
        headers: adminHeaders(),
        data: { status, reason },
      }
    );
    const body = await res.json().catch(() => ({}));
    return { status: res.status(), body };
  };

  return retryOn429(makeRequest);
}

/**
 * Admin: Activate a store by pushing it through the state machine.
 * DRAFT → SUSPENDED (admin override) → ACTIVE (reactivate with skipValidation)
 * This bypasses the normal enrollment flow for testing purposes.
 */
export async function adminActivateStore(
  request: APIRequestContext,
  storeId: string
): Promise<void> {
  // Use SUSPENDED as intermediate state (DRAFT → SUSPENDED is valid)
  // Then SUSPENDED → ACTIVE (reactivateStore uses skipValidation)
  const suspendRes = await adminChangeStoreStatus(
    request,
    storeId,
    "SUSPENDED",
    "E2E test: intermediate state"
  );
  expect(
    suspendRes.status,
    `Failed to transition DRAFT→SUSPENDED (${suspendRes.status}): ${JSON.stringify(suspendRes.body)}`
  ).toBe(200);

  const activateRes = await adminChangeStoreStatus(
    request,
    storeId,
    "ACTIVE",
    "E2E test: activating store"
  );
  expect(
    activateRes.status,
    `Failed to transition SUSPENDED→ACTIVE (${activateRes.status}): ${JSON.stringify(activateRes.body)}`
  ).toBe(200);
}

/**
 * Admin: Get store status history (audit trail).
 */
export async function getStoreStatusHistory(
  request: APIRequestContext,
  storeId: string
): Promise<any[]> {
  const res = await request.get(
    `${API_BASE}/api/v1/admin/stores/${storeId}/status-history`,
    { headers: adminHeaders() }
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.history || body.status_history || [];
}

/**
 * POS: Get store status via POS endpoint.
 */
export async function getPosStoreStatus(
  request: APIRequestContext,
  storeId: string,
  deviceToken: string
): Promise<{ status: number; body: any }> {
  const res = await request.get(
    `${API_BASE}/api/v1/pos/stores/${storeId}/status`,
    { headers: posHeaders(deviceToken) }
  );
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

/**
 * POS: Get ui-status via POS endpoint.
 */
export async function getPosUiStatus(
  request: APIRequestContext,
  deviceToken: string
): Promise<{ status: number; body: any }> {
  const res = await request.get(`${API_BASE}/api/v1/pos/ui-status`, {
    headers: posHeaders(deviceToken),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}
