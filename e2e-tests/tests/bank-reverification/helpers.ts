/**
 * Shared test utilities for SA-P1-008: Bank Detail Re-Verification tests
 * @bank_reverification
 *
 * Reuses core helpers from supplier-purchase and adds bank-specific utilities.
 */
import { APIRequestContext, expect } from "@playwright/test";

export const API_BASE = process.env.API_BASE_URL || "http://localhost:3010";
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "local-test-token";
// Random suffix ensures parallel Playwright workers (separate processes loading
// this module at the same millisecond) get distinct IDs for emails, GSTINs, phones.
export const RUN_ID =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------------------------------------------------------------------
// Rate-limit retry (shared by all admin helpers)
// Admin approval endpoints share a 10/min per-IP sliding window.
// Parallel test suites can exhaust the budget, so helpers auto-retry on 429.
// ---------------------------------------------------------------------------

async function retryOn429<T extends { status: number; body?: any }>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();
    if (result.status !== 429 || attempt === maxRetries) return result;
    const retryAfterSec =
      (result as any).body?.error?.retryAfterSeconds || 10;
    await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
  }
  return fn(); // unreachable, satisfies TS
}

/**
 * Retry wrapper for rate-limited admin endpoints (429).
 * Use this for raw request calls in edge-case tests.
 */
export async function withRateLimitRetry(
  fn: () => Promise<{ status: number; body: any }>
): Promise<{ status: number; body: any }> {
  return retryOn429(fn);
}

// ---------------------------------------------------------------------------
// Unique data generators (use RUN_ID + counter to avoid collisions across runs)
// ---------------------------------------------------------------------------

let phoneCounter = 0;
export function uniquePhone(): string {
  phoneCounter++;
  const ts = Date.now().toString().slice(-5);
  const rnd = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");
  const cnt = phoneCounter.toString().padStart(2, "0");
  return `+917${ts}${rnd}${cnt}`;
}

let emailCounter = 0;
export function uniqueEmail(): string {
  emailCounter++;
  return `bank_test_${RUN_ID}_${emailCounter}@test.supermandi.com`;
}

let gstinCounter = 0;
export function uniqueGstin(): string {
  gstinCounter++;
  // GSTIN regex: ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$
  // 15 chars: DD LLLLL DDDD L X Z Y
  //
  // 3 random letters in PAN portion (cross-run + cross-worker isolation)
  // + zero-padded counter for the 4-digit portion (within-worker isolation).
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const r = () => alpha[Math.floor(Math.random() * 26)];
  const cnt = gstinCounter.toString().padStart(4, "0");
  return `27${r()}${r()}${r()}CX${cnt}A1Z5`;
}

let bankAccountCounter = 0;
export function uniqueBankAccount(): string {
  bankAccountCounter++;
  const ts = Date.now().toString().slice(-6);
  return `90${ts}${bankAccountCounter.toString().padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export interface TestSupplierContext {
  supplierId: string;
  token: string;
  email: string;
  businessName: string;
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

export function supplierHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

/**
 * Register a fresh supplier via email/password auth.
 */
export async function setupTestSupplier(
  request: APIRequestContext,
  suffix: string
): Promise<TestSupplierContext> {
  const email = uniqueEmail();
  const gstin = uniqueGstin();
  const businessName = `BankTest Supplier ${suffix} ${RUN_ID}`;

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

  return { supplierId: supplier.id, token, email, businessName };
}

/**
 * Admin verifies (activates) a self-registered supplier.
 * Uses the PATCH verification-status state machine endpoint.
 * KYC_SUBMITTED → ACTIVE is the valid transition for newly registered suppliers.
 * Auto-retries on 429 (shared rate limiter across admin endpoints).
 */
export async function adminVerifySupplier(
  request: APIRequestContext,
  supplierId: string
): Promise<void> {
  const makeRequest = async () => {
    const res = await request.patch(
      `${API_BASE}/api/v1/admin/suppliers/${supplierId}/verification-status`,
      {
        headers: adminHeaders(),
        data: { status: "ACTIVE", reason: "E2E test approval" },
      }
    );
    const body = await res.json().catch(() => ({}));
    return { status: res.status(), body };
  };

  const { status } = await retryOn429(makeRequest);

  expect(
    status,
    `Admin verify supplier failed (${status})`
  ).toBe(200);
}

// ---------------------------------------------------------------------------
// Bank-specific helpers
// ---------------------------------------------------------------------------

/**
 * Update supplier bank details via PATCH /profile.
 * Returns the updated profile response.
 */
export async function updateBankDetails(
  request: APIRequestContext,
  token: string,
  bankDetails: {
    accountNumber?: string;
    ifscCode?: string;
    accountName?: string;
  }
): Promise<{ status: number; body: any }> {
  const res = await request.patch(`${API_BASE}/api/v1/supplier/profile`, {
    headers: supplierHeaders(token),
    data: { bankDetails },
  });
  const body = await res.json();
  return { status: res.status(), body };
}

/**
 * Fetch supplier profile and return bankVerificationStatus.
 */
export async function getSupplierProfile(
  request: APIRequestContext,
  token: string
): Promise<any> {
  const res = await request.get(`${API_BASE}/api/v1/supplier/profile`, {
    headers: supplierHeaders(token),
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data;
}

/**
 * Admin: Fetch pending bank changes queue.
 */
export async function adminGetBankChanges(
  request: APIRequestContext
): Promise<any[]> {
  const res = await request.get(
    `${API_BASE}/api/v1/admin/suppliers/bank-changes`,
    { headers: adminHeaders() }
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.data || [];
}

/**
 * Admin: Approve or reject bank change.
 * Auto-retries on 429 (shared rate limiter across admin endpoints).
 */
export async function adminVerifyBankDetails(
  request: APIRequestContext,
  supplierId: string,
  action: "approve" | "reject",
  reason?: string
): Promise<{ status: number; body: any }> {
  const makeRequest = async () => {
    const res = await request.post(
      `${API_BASE}/api/v1/admin/suppliers/${supplierId}/bank-verify`,
      {
        headers: adminHeaders(),
        data: { action, reason },
      }
    );
    const body = await res.json();
    return { status: res.status(), body };
  };

  return retryOn429(makeRequest);
}
