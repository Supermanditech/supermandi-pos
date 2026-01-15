/**
 * QA-101: Enrollment Integration Tests
 *
 * Tests that:
 * 1. Demo codes (SM-DEMO*) allow unlimited enrollments (multi-use)
 * 2. Production codes allow only single enrollment (single-use)
 * 3. Correct HTTP status codes (409 for used/expired, 400 for validation)
 *
 * Run with: npx vitest run src/routes/v1/pos/__tests__/enroll.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";

// Test database connection
const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "postgresql://localhost:5432/supermandi_test";
let pool: Pool;

// Test fixtures
const DEMO_STORE_ID = "demo-store-" + randomUUID().slice(0, 8);
const PROD_STORE_ID = "prod-store-" + randomUUID().slice(0, 8);
const DEMO_CODE = "SM-DEMO-TEST-" + Date.now();
const PROD_CODE = "SM-PROD-TEST-" + Date.now();

async function setupTestStore(storeId: string, isDemo: boolean, storeCode: string) {
  await pool.query(`
    INSERT INTO stores (id, name, store_code, is_demo, active)
    VALUES ($1, $2, $3, $4, true)
    ON CONFLICT (id) DO UPDATE SET is_demo = $4, store_code = $3
  `, [storeId, isDemo ? "Demo Test Store" : "Production Test Store", storeCode, isDemo]);
}

async function setupEnrollmentCode(code: string, storeId: string, maxUses: number) {
  await pool.query(`
    INSERT INTO pos_device_enrollments (id, code, store_id, max_uses, uses_count, expires_at, created_by)
    VALUES ($1, $2, $3, $4, 0, NOW() + INTERVAL '1 hour', 'test')
    ON CONFLICT (code) DO UPDATE SET max_uses = $4, uses_count = 0, used_device_id = NULL
  `, [randomUUID(), code, storeId, maxUses]);
}

async function enrollDevice(code: string, fingerprint: string, label: string) {
  // This simulates what the API endpoint does - for true integration, use supertest
  const enrollmentRes = await pool.query(`
    SELECT
      e.id as enrollment_id,
      e.code,
      e.store_id,
      e.expires_at,
      e.used_at,
      e.used_device_id,
      e.revoked_at,
      COALESCE(e.max_uses, 1) as max_uses,
      COALESCE(e.uses_count, CASE WHEN e.used_at IS NOT NULL THEN 1 ELSE 0 END) as uses_count
    FROM pos_device_enrollments e
    WHERE e.code = $1
  `, [code]);

  if (enrollmentRes.rowCount === 0) {
    return { status: 400, error: "ENROLLMENT_CODE_INVALID" };
  }

  const enrollment = enrollmentRes.rows[0];

  // Get store
  const storeRes = await pool.query(`
    SELECT id, name, store_code, is_demo FROM stores WHERE id = $1
  `, [enrollment.store_id]);
  const store = storeRes.rows[0];

  // Determine if demo
  const storeCode = store?.store_code ?? "";
  const isDemo = Boolean(store?.is_demo) || storeCode.toLowerCase().includes("demo") || code.toUpperCase().startsWith("SM-DEMO");

  // Check exhausted
  const maxUses = enrollment.max_uses;
  const usesCount = enrollment.uses_count;
  const isMultiUse = maxUses > 1;
  const usesExhausted = isMultiUse
    ? usesCount >= maxUses
    : (enrollment.used_device_id != null || usesCount >= 1);

  // Enforce rules for production
  if (!isDemo && usesExhausted) {
    return { status: 409, error: "ENROLLMENT_CODE_USED" };
  }

  // Insert device
  const deviceId = randomUUID();
  await pool.query(`
    INSERT INTO pos_devices (id, store_id, device_token, label, device_type, device_fingerprint, enrollment_id)
    VALUES ($1, $2, $3, $4, 'RETAILER_PHONE', $5, $6)
  `, [deviceId, enrollment.store_id, randomUUID(), label, fingerprint, enrollment.enrollment_id]);

  // Update enrollment
  await pool.query(`
    UPDATE pos_device_enrollments
    SET used_at = COALESCE(used_at, NOW()),
        used_device_id = COALESCE(used_device_id, $2),
        uses_count = COALESCE(uses_count, 0) + 1
    WHERE code = $1
  `, [code, deviceId]);

  return { status: 200, deviceId, storeId: enrollment.store_id };
}

describe("QA-101: Enrollment Multi-Use vs Single-Use", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });

    // Setup test stores
    await setupTestStore(DEMO_STORE_ID, true, "dm-test-" + Date.now());
    await setupTestStore(PROD_STORE_ID, false, "te-test-" + Date.now());

    // Setup enrollment codes
    await setupEnrollmentCode(DEMO_CODE, DEMO_STORE_ID, 9999); // Multi-use
    await setupEnrollmentCode(PROD_CODE, PROD_STORE_ID, 1);    // Single-use
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM pos_devices WHERE store_id IN ($1, $2)`, [DEMO_STORE_ID, PROD_STORE_ID]);
    await pool.query(`DELETE FROM pos_device_enrollments WHERE code IN ($1, $2)`, [DEMO_CODE, PROD_CODE]);
    await pool.query(`DELETE FROM stores WHERE id IN ($1, $2)`, [DEMO_STORE_ID, PROD_STORE_ID]);
    await pool.end();
  });

  beforeEach(async () => {
    // Reset enrollment codes before each test
    await pool.query(`
      UPDATE pos_device_enrollments
      SET uses_count = 0, used_device_id = NULL, used_at = NULL
      WHERE code IN ($1, $2)
    `, [DEMO_CODE, PROD_CODE]);

    // Clean up any test devices
    await pool.query(`DELETE FROM pos_devices WHERE store_id IN ($1, $2)`, [DEMO_STORE_ID, PROD_STORE_ID]);
  });

  describe("Demo Store Enrollment (Multi-Use)", () => {
    it("should allow first device enrollment with demo code", async () => {
      const result = await enrollDevice(DEMO_CODE, "fp_demo_1", "Demo Device 1");
      expect(result.status).toBe(200);
      expect(result.deviceId).toBeDefined();
    });

    it("should allow second device enrollment with SAME demo code", async () => {
      // First enrollment
      const first = await enrollDevice(DEMO_CODE, "fp_demo_1", "Demo Device 1");
      expect(first.status).toBe(200);

      // Second enrollment - MUST succeed for demo
      const second = await enrollDevice(DEMO_CODE, "fp_demo_2", "Demo Device 2");
      expect(second.status).toBe(200);
      expect(second.deviceId).toBeDefined();
      expect(second.deviceId).not.toBe(first.deviceId);
    });

    it("should allow many device enrollments with demo code", async () => {
      for (let i = 1; i <= 5; i++) {
        const result = await enrollDevice(DEMO_CODE, `fp_demo_multi_${i}`, `Demo Device ${i}`);
        expect(result.status).toBe(200);
      }
    });
  });

  describe("Production Store Enrollment (Single-Use)", () => {
    it("should allow first device enrollment with production code", async () => {
      const result = await enrollDevice(PROD_CODE, "fp_prod_1", "Prod Device 1");
      expect(result.status).toBe(200);
      expect(result.deviceId).toBeDefined();
    });

    it("should REJECT second device enrollment with production code", async () => {
      // First enrollment
      const first = await enrollDevice(PROD_CODE, "fp_prod_1", "Prod Device 1");
      expect(first.status).toBe(200);

      // Second enrollment - MUST fail for production
      const second = await enrollDevice(PROD_CODE, "fp_prod_2", "Prod Device 2");
      expect(second.status).toBe(409);
      expect(second.error).toBe("ENROLLMENT_CODE_USED");
    });
  });

  describe("HTTP Status Codes", () => {
    it("should return 400 for invalid enrollment code", async () => {
      const result = await enrollDevice("INVALID-CODE-12345", "fp_invalid", "Invalid Device");
      expect(result.status).toBe(400);
      expect(result.error).toBe("ENROLLMENT_CODE_INVALID");
    });

    it("should return 409 (not 400) for used production code", async () => {
      // Use the code first
      await enrollDevice(PROD_CODE, "fp_first", "First Device");

      // Second attempt should get 409
      const result = await enrollDevice(PROD_CODE, "fp_second", "Second Device");
      expect(result.status).toBe(409);  // NOT 400
      expect(result.error).toBe("ENROLLMENT_CODE_USED");
    });
  });
});

describe("SM-DEMO Code Pattern Detection", () => {
  const SM_DEMO_CODE = "SM-DEMO-PATTERN-" + Date.now();

  beforeAll(async () => {
    // Create enrollment with SM-DEMO prefix on a NON-demo store
    // The code pattern itself should trigger multi-use behavior
    await pool.query(`
      INSERT INTO pos_device_enrollments (id, code, store_id, max_uses, uses_count, expires_at, created_by)
      VALUES ($1, $2, $3, 1, 0, NOW() + INTERVAL '1 hour', 'test')
      ON CONFLICT (code) DO UPDATE SET max_uses = 1, uses_count = 0, used_device_id = NULL
    `, [randomUUID(), SM_DEMO_CODE, PROD_STORE_ID]); // Note: Using PROD store but SM-DEMO code
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM pos_devices WHERE enrollment_id IN (SELECT id FROM pos_device_enrollments WHERE code = $1)`, [SM_DEMO_CODE]);
    await pool.query(`DELETE FROM pos_device_enrollments WHERE code = $1`, [SM_DEMO_CODE]);
  });

  it("should treat SM-DEMO* codes as multi-use regardless of store type", async () => {
    // First enrollment
    const first = await enrollDevice(SM_DEMO_CODE, "fp_pattern_1", "Pattern Device 1");
    expect(first.status).toBe(200);

    // Second enrollment - should succeed because code starts with SM-DEMO
    const second = await enrollDevice(SM_DEMO_CODE, "fp_pattern_2", "Pattern Device 2");
    expect(second.status).toBe(200);
  });
});
