/**
 * RO-001: Canonical Retailer Registration Service
 *
 * Creates store + owner user instantly from any surface.
 * No "application" step. No "pending approval."
 * Store exists in DB the moment registration completes.
 *
 * Transaction-safe: everything succeeds or nothing does.
 */

import type { Pool, PoolClient } from "pg";
import { randomUUID } from "crypto";
import { generateStoreCode } from "./storeCodeService";
import { sendOnboardingLinks } from "./notificationService";  // RO-008
import { createEnrollmentCode } from "./enrollmentCodeService";  // DRX-003
import type {
  RetailerRegistrationData,
  RegistrationSource,
} from "@supermandi/common";

// =============================================================================
// Types
// =============================================================================

export interface RegistrationResult {
  outcome: "SUCCESS" | "IDEMPOTENT";
  storeId: string;
  storeCode: string;
  ownerUserId: string;
  storeName: string;
  isExisting: boolean;
  enrollmentCode?: string;  // DRX-003: Auto-generated for POS sources
}

export interface RegistrationEventData {
  storeId: string | null;
  userId: string | null;
  source: RegistrationSource;
  outcome: "SUCCESS" | "IDEMPOTENT" | "BLOCKED" | "ERROR";
  errorCode?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceMeta?: Record<string, unknown>;
  phone: string;
  businessName: string;
  gstin?: string;
}

// =============================================================================
// Main Registration Function
// =============================================================================

/**
 * Register a new retailer store. Idempotent — returns existing store
 * if GSTIN or phone+businessName match.
 *
 * Runs in a single DB transaction.
 */
export async function registerRetailer(
  pool: Pool,
  data: RetailerRegistrationData,
  meta: { ipAddress?: string; userAgent?: string }
): Promise<RegistrationResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Step 1: GSTIN idempotency check
    if (data.gstin && data.gstin !== "") {
      const existing = await findStoreByGstin(client, data.gstin);
      if (existing) {
        await client.query("COMMIT");
        await recordRegistrationEvent(pool, {
          storeId: existing.storeId,
          userId: existing.ownerUserId,
          source: data.source,
          outcome: "IDEMPOTENT",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          deviceMeta: data.deviceMeta as Record<string, unknown>,
          phone: data.phone,
          businessName: data.businessName,
          gstin: data.gstin,
        });
        return { ...existing, outcome: "IDEMPOTENT", isExisting: true };
      }
    }

    // Step 2: Phone + businessName fallback dedup
    const existingByPhone = await findStoreByPhone(client, data.phone);
    if (existingByPhone) {
      await client.query("COMMIT");
      await recordRegistrationEvent(pool, {
        storeId: existingByPhone.storeId,
        userId: existingByPhone.ownerUserId,
        source: data.source,
        outcome: "IDEMPOTENT",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        deviceMeta: data.deviceMeta as Record<string, unknown>,
        phone: data.phone,
        businessName: data.businessName,
        gstin: data.gstin,
      });
      return { ...existingByPhone, outcome: "IDEMPOTENT", isExisting: true };
    }

    // Step 3: Find or create auth.users by phone
    const userId = await findOrCreateUser(client, {
      phone: data.phone,
      name: data.ownerName,
      email: data.email && data.email !== "" ? data.email : undefined,
    });

    // Step 4: Create platform.stores
    const storeId = randomUUID();
    const storeCode = await generateStoreCode(data.businessName);

    await client.query(
      `INSERT INTO platform.stores (
        id, name, code, phone, email, status, created_via,
        owner_name, gstin, address, pincode,
        created_at, updated_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, 'DRAFT', $6,
        $7, $8, $9, $10,
        NOW(), NOW()
      )`,
      [
        storeId,
        data.businessName,
        storeCode,
        data.phone,
        data.email && data.email !== "" ? data.email : null,
        data.source,
        data.ownerName,
        data.gstin && data.gstin !== "" ? data.gstin : null,
        data.address && data.address !== "" ? data.address : null,
        data.pincode && data.pincode !== "" ? data.pincode : null,
      ]
    );

    // Step 5: Create auth.store_users link
    await client.query(
      `INSERT INTO auth.store_users (store_id, user_id, role, is_owner, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'RETAILER_ADMIN', true, true, NOW(), NOW())
       ON CONFLICT (store_id, user_id) DO NOTHING`,
      [storeId, userId]
    );

    await client.query("COMMIT");

    // Step 6: Record registration event (outside transaction — non-blocking)
    await recordRegistrationEvent(pool, {
      storeId,
      userId,
      source: data.source,
      outcome: "SUCCESS",
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      deviceMeta: data.deviceMeta as Record<string, unknown>,
      phone: data.phone,
      businessName: data.businessName,
      gstin: data.gstin,
    }).catch((err) => {
      console.error("[registration] Failed to record event:", err?.message);
    });

    // Step 7: RO-008 — Send onboarding notifications (fire-and-forget)
    sendOnboardingLinks({
      phone: data.phone,
      email: data.email && data.email !== "" ? data.email : undefined,
      storeCode,
      ownerName: data.ownerName,
    }).catch((err) => {
      console.warn("[registration] Onboarding notification failed:", err?.message);
    });

    // Step 8: DRX-003 — Auto-generate enrollment code for POS sources
    let enrollmentCode: string | undefined;
    if (data.source === "POS_MOBILE" || data.source === "POS_DEVICE") {
      try {
        const enrollment = await createEnrollmentCode(storeId, storeCode, "registration");
        enrollmentCode = enrollment.code;
        console.log(`[registration] DRX-003: Auto-generated enrollment code ${enrollmentCode} for POS registration`);
      } catch (err: any) {
        console.warn("[registration] DRX-003: Failed to auto-generate enrollment code:", err?.message);
        // Non-blocking: registration still succeeds without enrollment code
      }
    }

    return {
      outcome: "SUCCESS",
      storeId,
      storeCode,
      ownerUserId: userId,
      storeName: data.businessName,
      isExisting: false,
      enrollmentCode,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

interface ExistingStore {
  storeId: string;
  storeCode: string;
  ownerUserId: string;
  storeName: string;
}

async function findStoreByGstin(
  client: PoolClient,
  gstin: string
): Promise<ExistingStore | null> {
  // Check both gstin and gst_number columns
  const result = await client.query(
    `SELECT s.id::TEXT as store_id, COALESCE(s.store_code, s.code) as store_code, s.name as store_name,
            su.user_id::TEXT as owner_user_id
     FROM platform.stores s
     LEFT JOIN auth.store_users su ON su.store_id = s.id AND su.is_owner = true
     WHERE (UPPER(s.gstin) = $1 OR UPPER(s.gst_number) = $1)
       AND s.status != 'deleted'
     LIMIT 1`,
    [gstin.toUpperCase()]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    storeId: row.store_id,
    storeCode: row.store_code,
    ownerUserId: row.owner_user_id || "",
    storeName: row.store_name,
  };
}

async function findStoreByPhone(
  client: PoolClient,
  phone: string
): Promise<ExistingStore | null> {
  const result = await client.query(
    `SELECT s.id::TEXT as store_id, COALESCE(s.store_code, s.code) as store_code, s.name as store_name,
            su.user_id::TEXT as owner_user_id
     FROM platform.stores s
     LEFT JOIN auth.store_users su ON su.store_id = s.id AND su.is_owner = true
     WHERE s.phone = $1 AND s.status != 'deleted'
     LIMIT 1`,
    [phone]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    storeId: row.store_id,
    storeCode: row.store_code,
    ownerUserId: row.owner_user_id || "",
    storeName: row.store_name,
  };
}

async function findOrCreateUser(
  client: PoolClient,
  data: { phone: string; name: string; email?: string }
): Promise<string> {
  // Check if user with this phone already exists
  const existing = await client.query(
    `SELECT id::TEXT as id FROM auth.users WHERE phone = $1 LIMIT 1`,
    [data.phone]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Create new user
  const userId = randomUUID();
  await client.query(
    `INSERT INTO auth.users (id, phone, name, email, actor_type, status, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, 'store', 'active', NOW(), NOW())`,
    [userId, data.phone, data.name, data.email || null]
  );

  return userId;
}

async function recordRegistrationEvent(
  pool: Pool,
  event: RegistrationEventData
): Promise<void> {
  await pool.query(
    `INSERT INTO auth.registration_events (
      store_id, user_id, source, outcome, error_code,
      ip_address, user_agent, device_meta,
      phone, business_name, gstin
    ) VALUES (
      $1::uuid, $2::uuid, $3, $4, $5,
      $6::inet, $7, $8::jsonb,
      $9, $10, $11
    )`,
    [
      event.storeId,
      event.userId,
      event.source,
      event.outcome,
      event.errorCode || null,
      event.ipAddress || null,
      event.userAgent || null,
      event.deviceMeta ? JSON.stringify(event.deviceMeta) : null,
      event.phone,
      event.businessName,
      event.gstin || null,
    ]
  );
}

/**
 * Record a failed registration event (for rate-limited or error cases).
 */
export async function recordFailedRegistration(
  pool: Pool,
  event: Omit<RegistrationEventData, "storeId" | "userId">
): Promise<void> {
  await recordRegistrationEvent(pool, {
    ...event,
    storeId: null,
    userId: null,
  }).catch((err) => {
    console.error("[registration] Failed to record error event:", err?.message);
  });
}
