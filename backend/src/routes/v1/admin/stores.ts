import { randomUUID } from "crypto";
import { Router } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { generateStoreCode } from "../../../services/storeCodeService";
import { sanitizeHtml, validateEmail as validateEmailFn, validatePhone as validatePhoneFn, validatePinCode } from "@supermandi/common";
// GO-LIVE-186: Import rate limiter for admin store operations
import { adminStoreOperationsRateLimiter } from "../../../middleware/posRateLimiter";
// CORE-001: Import store state machine service
import {
  StoreStatus,
  type StoreStatusType,
  transitionStore,
  getStoresByStatus,
  getPendingStoresCount,
  getStoreStatusHistory,
  getStoreStatus,
  isValidTransition,
  getValidTransitions,
} from "../../../services/storeStateMachine";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const adminStoresRouter = Router();

// GO-LIVE-128: All admin store routes require admin token authentication
adminStoresRouter.use(requireAdminToken);

// T-215: Canonical UPI VPA pattern — min 3 chars before @, min 2 after, no dots after @
const UPI_VPA_PATTERN = /^[a-z0-9._-]{3,}@[a-z0-9]{2,}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUpiVpa = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase(); // T-215: normalize to lowercase
  if (!trimmed) return null;
  return trimmed;
};

const normalizeStoreIdInput = (value: unknown): { value?: string; error?: string } => {
  if (value === undefined) return { value: undefined };
  if (value === null) return { error: "storeId_invalid" };
  if (typeof value !== "string") return { error: "storeId_invalid" };
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return { error: "storeId_invalid" };
  if (!UUID_PATTERN.test(trimmed)) return { error: "storeId_must_be_uuid" };
  return { value: trimmed };
};

// GO-LIVE-004: Store name validation with min/max length
const STORE_NAME_MIN_LENGTH = 2;
const STORE_NAME_MAX_LENGTH = 100;

const normalizeStoreNameInput = (value: unknown): { value?: string; error?: string } => {
  if (typeof value !== "string") return { error: "storeName_required" };
  const trimmed = value.trim();
  if (!trimmed) return { error: "storeName_required" };
  // GO-LIVE-004: Enforce min/max length constraints
  if (trimmed.length < STORE_NAME_MIN_LENGTH) {
    return { error: `storeName_too_short_min_${STORE_NAME_MIN_LENGTH}` };
  }
  if (trimmed.length > STORE_NAME_MAX_LENGTH) {
    return { error: `storeName_too_long_max_${STORE_NAME_MAX_LENGTH}` };
  }
  // GO-LIVE-150: Sanitize for XSS prevention
  return { value: sanitizeHtml(trimmed) };
};

// GO-LIVE-005: Email and phone validation regex patterns
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_PATTERN = /^[+]?[0-9]{10,15}$/;

const validateEmail = (email: string): boolean => {
  return EMAIL_PATTERN.test(email);
};

const validatePhone = (phone: string): boolean => {
  // Remove spaces and dashes for validation
  const cleaned = phone.replace(/[\s-]/g, '');
  return PHONE_PATTERN.test(cleaned);
};

const generateStoreId = (): string => randomUUID();

async function ensureUniqueStoreId(pool: ReturnType<typeof getPool>, preferredId?: string): Promise<string> {
  if (!pool) return generateStoreId();
  if (preferredId) {
    const existing = await pool.query(`SELECT id FROM platform.stores WHERE id = $1::uuid`, [preferredId]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new Error("store_exists");
    }
    return preferredId;
  }

  // UUIDs are globally unique; collision is astronomically unlikely
  return generateStoreId();
}

// POST /api/v1/admin/stores - STORECODE-002: Now generates store_code automatically
// GO-LIVE-128: Requires 'stores:create' permission
// GO-LIVE-186: Rate limit store creation to 30/min per IP
adminStoresRouter.post("/stores", requirePermission("stores", "create"), adminStoreOperationsRateLimiter, async (req, res) => {
  const storeNameInput = normalizeStoreNameInput((req.body as any)?.storeName ?? (req.body as any)?.name);
  if (storeNameInput.error || !storeNameInput.value) {
    return res.status(400).json({ error: storeNameInput.error ?? "storeName_required" });
  }

  const storeIdInput = normalizeStoreIdInput(
    (req.body as any)?.storeId ?? (req.body as any)?.store_id ?? (req.body as any)?.id
  );
  if (storeIdInput.error) {
    return res.status(400).json({ error: storeIdInput.error });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  let storeId = "";
  try {
    storeId = await ensureUniqueStoreId(pool, storeIdInput.value);
  } catch (_error: unknown) {
    const error = asError(_error);
    if (error?.message === "store_exists") {
      return res.status(409).json({ error: "store_exists" });
    }
    return res.status(500).json({ error: "store_id_unavailable" });
  }

  // DRX-002: Generate human-readable store code from store name
  // No silent fallback — if generate_store_code() fails, the error is surfaced
  let storeCode: string;
  try {
    storeCode = await generateStoreCode(storeNameInput.value);
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[stores] CRITICAL: generate_store_code() failed:", error?.message);
    return res.status(500).json({ error: "STORE_CODE_GENERATION_FAILED", message: "Could not generate store code. Database function may be missing." });
  }

  let result;
  try {
    result = await pool.query(
      `
        INSERT INTO platform.stores (id, name, code, status, created_at, updated_at)
        VALUES ($1::uuid, $2, $3, 'DRAFT', NOW(), NOW())
        RETURNING id::TEXT as id, name, code, status, created_at, updated_at
      `,
      [storeId, storeNameInput.value, storeCode]
    );
  } catch (err: any) {
    if (err?.code === "23505") {
      const constraint = err?.constraint ?? "";
      if (constraint.includes("code") || constraint.includes("store_code")) {
        return res.status(409).json({ error: "store_code_conflict" });
      }
      return res.status(409).json({ error: "store_exists" });
    }
    // BACKEND-CRASH-001: Handle all DB errors gracefully (was: throw err → process crash)
    log.error("[admin/stores] Store creation DB error:", err?.message, err?.code);
    return res.status(500).json({ error: "store_creation_failed" });
  }

  const store = result.rows[0];
  return res.status(201).json({ store: { ...store, storeName: store?.name, storeCode: store?.code, active: store?.status === "ACTIVE" } });
});

// GET /api/v1/admin/stores
// GO-LIVE-128: Requires 'stores:read' permission
adminStoresRouter.get("/stores", requirePermission("stores", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // ADMIN-PAGINATION-001: Support limit/offset pagination
  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 50, 1), 200);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  try {
    const [countResult, result] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as total FROM platform.stores`),
      pool.query(
        `
        SELECT id::TEXT as id,
          name,
          code,
          store_code,
          store_type,
          status,
          upi_vpa,
          (status = 'ACTIVE') AS active,
          address,
          contact_name,
          contact_phone,
          contact_email,
          location,
          pos_device_id,
          kyc_status,
          scan_lookup_v2_enabled,
          upi_vpa_updated_at,
          upi_vpa_updated_by,
          allowed_payment_methods,
          created_at,
          updated_at
        FROM platform.stores
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
        `,
        [limit, offset]
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const stores = result.rows.map((row) => ({
      ...row,
      storeName: row.name,
      storeCode: row.store_code ?? row.code,
      allowedPaymentMethods: row.allowed_payment_methods ?? ['CASH', 'UPI', 'DUE']
    }));

    return res.json({ stores, total, limit, offset });
  } catch (_error: unknown) {
    const error = asError(_error);
    // Fallback: query only base columns if extended columns don't exist
    log.error("[admin/stores] Full query failed, trying base columns:", error?.message);
    try {
      const [countResult, result] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int as total FROM platform.stores`),
        pool.query(
          `SELECT id::TEXT as id, name, code, status, credit_enabled, credit_limit, created_at, updated_at FROM platform.stores ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
      ]);
      const total = countResult.rows[0]?.total ?? 0;
      const stores = result.rows.map((row) => ({
        ...row,
        storeName: row.name,
        storeCode: row.code,
        active: row.status === "ACTIVE", // FIX-019-007: Match UPPERCASE DB status
        creditEnabled: row.credit_enabled ?? false,
        creditLimit: row.credit_limit ?? 0
      }));
      return res.json({ stores, total, limit, offset });
    } catch (fallbackErr: any) {
      log.error("[admin/stores] Fallback query also failed:", fallbackErr?.message);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch stores" });
    }
  }
});

// ISSUE-032: GET /api/v1/admin/stores/stats — aggregate stats across all stores
adminStoresRouter.get("/stores/stats", requirePermission("stores", "read"), async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_stores,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_stores,
        COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft_stores,
        COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended_stores
      FROM platform.stores
    `);

    const deviceResult = await pool.query(`
      SELECT
        COUNT(*)::int AS total_devices,
        COUNT(*) FILTER (WHERE active = true)::int AS active_devices
      FROM pos_devices
    `);

    return res.json({
      stores: result.rows[0],
      devices: deviceResult.rows[0],
    });
  } catch (err: any) {
    log.error("[admin/stores/stats] Query failed:", err?.message);
    return res.status(500).json({ error: "Failed to fetch store stats" });
  }
});

// =============================================================================
// SA-P1-009: Store Health Dashboard — aggregated health scoring per store
// =============================================================================

// GET /api/v1/admin/stores/health — aggregated health dashboard
// Requires 'stores:read' permission
// Returns per-store health score (0-100) based on 4 factors:
//   +25 Device bound & active
//   +25 Last sync within 24h
//   +25 Orders in last 7 days
//   +25 KYC complete & admin approved
adminStoresRouter.get("/stores/health", requirePermission("stores", "read"), async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Single query joining stores with device and order data for health scoring
    const result = await pool.query(`
      WITH store_devices AS (
        SELECT
          d.store_id,
          COUNT(*) FILTER (WHERE d.active = true)::int AS active_device_count,
          MAX(d.last_sync_at) AS latest_sync
        FROM pos_devices d
        GROUP BY d.store_id
      ),
      store_orders AS (
        SELECT
          o.store_id,
          COUNT(*)::int AS recent_order_count
        FROM orders o
        WHERE o.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY o.store_id
      )
      SELECT
        s.id::TEXT AS id,
        s.name,
        s.code,
        s.store_code,
        s.status,
        s.device_bound,
        s.kyc_complete,
        s.admin_approved,
        s.kyc_status,
        COALESCE(sd.active_device_count, 0) AS active_device_count,
        sd.latest_sync,
        COALESCE(so.recent_order_count, 0) AS recent_order_count
      FROM platform.stores s
      LEFT JOIN store_devices sd ON sd.store_id = s.id::TEXT
      LEFT JOIN store_orders so ON so.store_id = s.id
      WHERE s.status != 'deleted'
      ORDER BY s.created_at DESC
    `);

    const now = new Date();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    const stores = result.rows.map((row) => {
      const factors: Array<{ name: string; status: "healthy" | "warning" | "critical"; detail: string }> = [];
      let score = 0;

      // Factor 1: Device bound & active (+25)
      const hasActiveDevice = (row.device_bound === true) && (row.active_device_count > 0);
      if (hasActiveDevice) {
        score += 25;
        factors.push({ name: "Device", status: "healthy", detail: `${row.active_device_count} active device(s)` });
      } else if (row.device_bound === true) {
        factors.push({ name: "Device", status: "warning", detail: "Bound but no active devices" });
      } else {
        factors.push({ name: "Device", status: "critical", detail: "No device bound" });
      }

      // Factor 2: Last sync within 24h (+25)
      const latestSync = row.latest_sync ? new Date(row.latest_sync) : null;
      const syncAgeMs = latestSync ? now.getTime() - latestSync.getTime() : Infinity;
      if (latestSync && syncAgeMs <= TWENTY_FOUR_HOURS_MS) {
        score += 25;
        const hoursAgo = Math.round(syncAgeMs / (60 * 60 * 1000));
        factors.push({ name: "Sync", status: "healthy", detail: `Last sync ${hoursAgo}h ago` });
      } else if (latestSync) {
        const daysAgo = Math.round(syncAgeMs / (24 * 60 * 60 * 1000));
        factors.push({ name: "Sync", status: "warning", detail: `Last sync ${daysAgo}d ago` });
      } else {
        factors.push({ name: "Sync", status: "critical", detail: "Never synced" });
      }

      // Factor 3: Orders in last 7 days (+25)
      const recentOrders = row.recent_order_count ?? 0;
      if (recentOrders > 0) {
        score += 25;
        factors.push({ name: "Orders", status: "healthy", detail: `${recentOrders} orders in 7d` });
      } else {
        factors.push({ name: "Orders", status: "critical", detail: "No orders in 7d" });
      }

      // Factor 4: KYC complete & admin approved (+25)
      const kycOk = row.kyc_complete === true && row.admin_approved === true;
      if (kycOk) {
        score += 25;
        factors.push({ name: "KYC", status: "healthy", detail: "Complete & approved" });
      } else if (row.kyc_complete === true) {
        factors.push({ name: "KYC", status: "warning", detail: "Complete, pending approval" });
      } else {
        factors.push({ name: "KYC", status: "critical", detail: `Status: ${row.kyc_status ?? "incomplete"}` });
      }

      return {
        id: row.id,
        name: row.name,
        code: row.store_code ?? row.code,
        status: row.status,
        healthScore: score,
        factors,
      };
    });

    // Sort worst-first for attention
    stores.sort((a, b) => a.healthScore - b.healthScore);

    const totalStores = stores.length;
    const healthyCount = stores.filter((s) => s.healthScore >= 80).length;
    const warningCount = stores.filter((s) => s.healthScore >= 50 && s.healthScore < 80).length;
    const criticalCount = stores.filter((s) => s.healthScore < 50).length;

    return res.json({
      summary: {
        totalStores,
        healthyCount,
        warningCount,
        criticalCount,
      },
      stores,
    });
  } catch (err: any) {
    log.error("[admin/stores/health] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch store health data" });
  }
});

// GET /api/v1/admin/stores/:storeId
// GO-LIVE-128: Requires 'stores:read' permission
adminStoresRouter.get("/stores/:storeId", requirePermission("stores", "read"), async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
    const whereClause = isUuid ? "id = $1::uuid" : "UPPER(code) = UPPER($1)";
    const result = await pool.query(
      `
        SELECT id::TEXT as id,
          name,
          code,
          store_code,
          store_type,
          status,
          upi_vpa,
          (status = 'ACTIVE') AS active,
          address,
          contact_name,
          contact_phone,
          contact_email,
          location,
          pos_device_id,
          kyc_status,
          scan_lookup_v2_enabled,
          upi_vpa_updated_at,
          upi_vpa_updated_by,
          allowed_payment_methods,
          max_devices,
          created_at,
          updated_at
        FROM platform.stores
        WHERE ${whereClause}
      `,
      [storeId]
    );

    const store = result.rows[0];
    if (!store) {
      return res.status(404).json({ error: "store not found" });
    }

    // T-185: Include max_devices and active device count in store detail
    let deviceInfo: { max_devices: number; active_device_count: number } | undefined;
    try {
      const deviceCountRes = await pool.query(
        `SELECT COUNT(*)::int as count FROM pos_devices WHERE store_id = $1 AND active = true`,
        [store.id]
      );
      deviceInfo = {
        max_devices: store.max_devices ?? 10,
        active_device_count: deviceCountRes.rows[0]?.count ?? 0,
      };
    } catch {
      // Non-critical
    }

    return res.json({ store: { ...store, storeName: store.name, storeCode: store.store_code ?? store.code, allowedPaymentMethods: store.allowed_payment_methods ?? ['CASH', 'UPI', 'DUE'], ...(deviceInfo ?? {}) } });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[admin/stores/:storeId] Query failed:", error?.message);
    // Fallback with base columns
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
      const result = await pool.query(
        `SELECT id::TEXT as id, name, code, status, credit_enabled, credit_limit, created_at, updated_at FROM platform.stores WHERE ${isUuid ? "id = $1::uuid" : "UPPER(code) = UPPER($1)"}`,
        [storeId]
      );
      const store = result.rows[0];
      if (!store) return res.status(404).json({ error: "store not found" });
      return res.json({ store: { ...store, storeName: store.name, storeCode: store.code, active: store.status === "ACTIVE", creditEnabled: store.credit_enabled ?? false, creditLimit: store.credit_limit ?? 0 } }); // FIX-019-008
    } catch (fallbackErr: any) {
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch store" });
    }
  }
});

// =============================================================================
// SA-P1-014: Store Settings (read-only audit view)
// =============================================================================

// GET /api/v1/admin/stores/:storeId/settings
// Returns a consolidated read-only view of all store settings for auditing
// GO-LIVE-128: Requires 'stores:read' permission
adminStoresRouter.get("/stores/:storeId/settings", requirePermission("stores", "read"), async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
    const whereClause = isUuid ? "id = $1::uuid" : "UPPER(code) = UPPER($1)";

    const result = await pool.query(
      `SELECT
        id::TEXT as id,
        name,
        code,
        store_code,
        store_type,
        status,
        status_reason,
        status_updated_at,
        -- Contact / Address
        address,
        contact_name,
        contact_phone,
        contact_email,
        city,
        state,
        pincode,
        location,
        -- Payment
        upi_vpa,
        upi_vpa_updated_at,
        upi_vpa_updated_by,
        allowed_payment_methods,
        -- Credit / BNPL
        credit_enabled,
        credit_limit,
        bnpl_enabled,
        bnpl_credit_limit,
        bnpl_max_days,
        -- Readiness flags
        device_bound,
        kyc_complete,
        upi_complete,
        admin_approved,
        -- Other settings
        timezone,
        currency,
        scan_lookup_v2_enabled,
        pos_device_id,
        kyc_status,
        -- Timestamps
        created_at,
        updated_at
      FROM platform.stores
      WHERE ${whereClause}`,
      [storeId]
    );

    const store = result.rows[0];
    if (!store) {
      return res.status(404).json({ error: "store not found" });
    }

    // Get feature flags for this store
    let featureFlags: Array<{ flag_key: string; enabled: boolean; scope_type: string; description: string | null }> = [];
    try {
      const flagsResult = await pool.query(
        `SELECT flag_key, enabled, scope_type, description
         FROM platform.feature_flags
         WHERE (scope_type = 'store' AND scope_id = $1) OR scope_type = 'global'
         ORDER BY flag_key`,
        [store.id]
      );
      featureFlags = flagsResult.rows;
    } catch {
      // Non-critical — feature_flags table may not exist
    }

    // Get active device count
    let activeDeviceCount = 0;
    try {
      const deviceResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM pos_devices WHERE store_id = $1 AND active = true`,
        [store.id]
      );
      activeDeviceCount = deviceResult.rows[0]?.count ?? 0;
    } catch {
      // Non-critical
    }

    return res.json({
      settings: {
        // Identity
        storeId: store.id,
        name: store.name,
        code: store.store_code ?? store.code,
        storeType: store.store_type ?? null,
        // Status
        status: store.status,
        statusReason: store.status_reason ?? null,
        statusUpdatedAt: store.status_updated_at ?? null,
        // Contact / Address
        address: store.address ?? null,
        contactName: store.contact_name ?? null,
        contactPhone: store.contact_phone ?? null,
        contactEmail: store.contact_email ?? null,
        city: store.city ?? null,
        state: store.state ?? null,
        pincode: store.pincode ?? null,
        location: store.location ?? null,
        // Payment settings
        upiVpa: store.upi_vpa ?? null,
        upiVpaUpdatedAt: store.upi_vpa_updated_at ?? null,
        allowedPaymentMethods: store.allowed_payment_methods ?? ['CASH', 'UPI', 'DUE'],
        // Credit / BNPL
        creditEnabled: store.credit_enabled ?? false,
        creditLimit: store.credit_limit ?? 0,
        bnplEnabled: store.bnpl_enabled ?? false,
        bnplCreditLimit: store.bnpl_credit_limit ?? 5000000,
        bnplMaxDays: store.bnpl_max_days ?? 7,
        // Readiness flags
        deviceBound: store.device_bound ?? false,
        kycComplete: store.kyc_complete ?? false,
        upiComplete: store.upi_complete ?? false,
        adminApproved: store.admin_approved ?? false,
        // Device info
        activeDeviceCount,
        posDeviceId: store.pos_device_id ?? null,
        kycStatus: store.kyc_status ?? null,
        // Other settings
        timezone: store.timezone ?? 'Asia/Kolkata',
        currency: store.currency ?? 'INR',
        scanLookupV2Enabled: store.scan_lookup_v2_enabled ?? false,
        // Feature flags
        featureFlags,
        // Timestamps
        createdAt: store.created_at,
        updatedAt: store.updated_at,
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[admin/stores/:storeId/settings] Query failed:", error?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch store settings" });
  }
});

// PATCH /api/v1/admin/stores/:storeId
// GO-LIVE-128: Requires 'stores:update' permission
// GO-LIVE-186: Rate limit store updates to 30/min per IP
adminStoresRouter.patch("/stores/:storeId", requirePermission("stores", "update"), adminStoreOperationsRateLimiter, async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const {
    name,
    storeName,
    upiVpa,
    upi_vpa: upiVpaSnake,
    address,
    contactName,
    contactPhone,
    contactEmail,
    location,
    posDeviceId,
    kycStatus,
    scanLookupV2Enabled,
    scan_lookup_v2_enabled: scanLookupV2EnabledSnake,
    allowedPaymentMethods,
    allowed_payment_methods: allowedPaymentMethodsSnake,
    creditEnabled,
    credit_enabled: creditEnabledSnake,
    creditLimit,
    credit_limit: creditLimitSnake
  } = req.body as Record<string, unknown>;

  const updates: string[] = [];
  const values: unknown[] = [];

  const addUpdate = (column: string, value: unknown) => {
    updates.push(`${column} = $${values.length + 1}`);
    values.push(value);
  };

  // P1-SADM-002: Update all supported store fields
  // GO-LIVE-004: Validate store name on update too
  if (storeName !== undefined || name !== undefined) {
    const nameValue = storeName !== undefined ? storeName : name;
    const nameResult = normalizeStoreNameInput(nameValue);
    if (nameResult.error) {
      return res.status(400).json({ error: nameResult.error });
    }
    if (nameResult.value) {
      addUpdate("name", nameResult.value);
    }
  }

  const upiVpaValue = upiVpa !== undefined ? upiVpa : upiVpaSnake;
  if (upiVpaValue !== undefined) {
    const normalized = normalizeUpiVpa(upiVpaValue);
    if (normalized === undefined) {
      return res.status(400).json({ error: "upi_vpa_invalid" });
    }
    if (normalized && !UPI_VPA_PATTERN.test(normalized)) {
      return res.status(400).json({ error: "upi_vpa_invalid" });
    }
    // FIX-019-005: Use UPPERCASE status values (migration 094 CHECK constraint)
    addUpdate("status", normalized ? "ACTIVE" : "DRAFT");
    addUpdate("upi_vpa", normalized || null);
  }

  // Contact and address fields
  if (typeof address === "string") addUpdate("address", address.trim());
  if (typeof contactName === "string") addUpdate("contact_name", contactName.trim());

  // GO-LIVE-005: Validate phone format
  if (typeof contactPhone === "string") {
    const trimmedPhone = contactPhone.trim();
    if (trimmedPhone && !validatePhone(trimmedPhone)) {
      return res.status(400).json({ error: "contactPhone_invalid_format" });
    }
    addUpdate("contact_phone", trimmedPhone);
  }

  // GO-LIVE-005: Validate email format
  if (typeof contactEmail === "string") {
    const trimmedEmail = contactEmail.trim().toLowerCase();
    if (trimmedEmail && !validateEmail(trimmedEmail)) {
      return res.status(400).json({ error: "contactEmail_invalid_format" });
    }
    addUpdate("contact_email", trimmedEmail);
  }

  // SA-P1-006: Allowed payment methods per store
  const apmValue = (allowedPaymentMethods ?? allowedPaymentMethodsSnake) as unknown;
  if (apmValue !== undefined) {
    if (!Array.isArray(apmValue) || apmValue.length === 0) {
      return res.status(400).json({ error: "allowedPaymentMethods must be a non-empty array" });
    }
    const validMethods = ['CASH', 'UPI', 'DUE'];
    const normalized = (apmValue as string[]).map((m) => String(m).toUpperCase());
    if (normalized.some((m) => !validMethods.includes(m))) {
      return res.status(400).json({ error: "allowedPaymentMethods: only CASH, UPI, DUE allowed" });
    }
    addUpdate("allowed_payment_methods", `{${normalized.join(',')}}`);
  }

  // ISSUE-063: Credit enablement per store
  const creditEnabledValue = creditEnabled ?? creditEnabledSnake;
  if (typeof creditEnabledValue === "boolean") {
    addUpdate("credit_enabled", creditEnabledValue);
  }

  const creditLimitValue = creditLimit ?? creditLimitSnake;
  if (creditLimitValue !== undefined) {
    const limit = Number(creditLimitValue);
    if (!Number.isFinite(limit) || limit < 0) {
      return res.status(400).json({ error: "creditLimit must be a non-negative number" });
    }
    addUpdate("credit_limit", Math.round(limit));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updates.push(`updated_at = NOW()`);

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
  try {
    const sql = `
      UPDATE platform.stores
      SET ${updates.join(", ")}
      WHERE ${isUuid ? `id = $${values.length + 1}::uuid` : `UPPER(code) = UPPER($${values.length + 1})`}
      RETURNING id::TEXT as id, name, code, status, address, contact_name, contact_phone, contact_email, allowed_payment_methods, credit_enabled, credit_limit, created_at, updated_at
    `;
    values.push(storeId);

    const result = await pool.query(sql, values);
    const store = result.rows[0];
    if (!store) {
      return res.status(404).json({ error: "store not found" });
    }

    return res.json({ store: {
      ...store,
      storeName: store.name,
      storeCode: store.code,
      active: store.status === "ACTIVE", // FIX-019-006: Match UPPERCASE DB status
      contactName: store.contact_name,
      contactPhone: store.contact_phone,
      contactEmail: store.contact_email,
      allowedPaymentMethods: store.allowed_payment_methods ?? ['CASH', 'UPI', 'DUE'],
      creditEnabled: store.credit_enabled ?? false,
      creditLimit: store.credit_limit ?? 0
    } });
  } catch (err: any) {
    log.error("[admin/stores PATCH] Update failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update store" });
  }
});

// SA-P2-007: PATCH /api/v1/admin/stores/:storeId/bnpl - Update BNPL settings
// Requires 'stores:write' permission
adminStoresRouter.patch("/stores/:storeId/bnpl", requirePermission("stores", "write"), adminStoreOperationsRateLimiter, async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const { bnplEnabled, bnplCreditLimit, bnplMaxDays, creditEnabled, creditLimit } = req.body as Record<string, unknown>;

  const updates: string[] = [];
  const values: unknown[] = [];

  const addUpdate = (column: string, value: unknown) => {
    updates.push(`${column} = $${values.length + 1}`);
    values.push(value);
  };

  if (typeof bnplEnabled === "boolean") {
    addUpdate("bnpl_enabled", bnplEnabled);
  }

  if (bnplCreditLimit !== undefined) {
    const limit = Number(bnplCreditLimit);
    if (!Number.isFinite(limit) || limit < 0) {
      return res.status(400).json({ error: "bnplCreditLimit must be a non-negative number" });
    }
    addUpdate("bnpl_credit_limit", Math.round(limit));
  }

  if (bnplMaxDays !== undefined) {
    const days = Number(bnplMaxDays);
    if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1 || days > 90) {
      return res.status(400).json({ error: "bnplMaxDays must be an integer between 1 and 90" });
    }
    addUpdate("bnpl_max_days", days);
  }

  if (typeof creditEnabled === "boolean") {
    addUpdate("credit_enabled", creditEnabled);
  }

  if (creditLimit !== undefined) {
    const limit = Number(creditLimit);
    if (!Number.isFinite(limit) || limit < 0) {
      return res.status(400).json({ error: "creditLimit must be a non-negative number" });
    }
    addUpdate("credit_limit", Math.round(limit));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No BNPL fields to update" });
  }

  updates.push("updated_at = NOW()");

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const isUuid = UUID_PATTERN.test(storeId);
  try {
    const sql = `
      UPDATE platform.stores
      SET ${updates.join(", ")}
      WHERE ${isUuid ? `id = $${values.length + 1}::uuid` : `UPPER(code) = UPPER($${values.length + 1})`}
      RETURNING id::TEXT as id, name, code, status,
        credit_enabled, credit_limit, bnpl_enabled, bnpl_credit_limit, bnpl_max_days,
        updated_at
    `;
    values.push(storeId);

    const result = await pool.query(sql, values);
    const store = result.rows[0];
    if (!store) {
      return res.status(404).json({ error: "store not found" });
    }

    return res.json({
      store: {
        id: store.id,
        name: store.name,
        code: store.code,
        status: store.status,
        creditEnabled: store.credit_enabled ?? false,
        creditLimit: store.credit_limit ?? 0,
        bnplEnabled: store.bnpl_enabled ?? false,
        bnplCreditLimit: store.bnpl_credit_limit ?? 5000000,
        bnplMaxDays: store.bnpl_max_days ?? 7,
        updatedAt: store.updated_at,
      },
    });
  } catch (err: any) {
    log.error("[admin/stores PATCH bnpl] Update failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update BNPL settings" });
  }
});

// ITER3-P0-007: DELETE /api/v1/admin/stores/:storeId - Soft delete a store
// GO-LIVE-128: Requires 'stores:delete' permission (super_admin only)
// GO-LIVE-186: Rate limit store deletion to 30/min per IP
adminStoresRouter.delete("/stores/:storeId", requirePermission("stores", "delete"), adminStoreOperationsRateLimiter, async (req, res) => {
  const storeId = req.params.storeId?.trim();
  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const isUuid = UUID_PATTERN.test(storeId);

  try {
    // Soft delete: Set status to 'deleted' and clear UPI VPA
    const result = await pool.query(
      `UPDATE platform.stores
       SET status = 'deleted', upi_vpa = NULL, updated_at = NOW()
       WHERE ${isUuid ? "id = $1::uuid" : "UPPER(code) = UPPER($1)"}
         AND status != 'deleted'
       RETURNING id::TEXT as id, name, code`,
      [storeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "store not found or already deleted" });
    }

    const store = result.rows[0];
    log.info(`[admin/stores] Store deleted: ${store.code} (${store.id})`);

    return res.json({ success: true, message: `Store ${store.code} has been deleted` });
  } catch (err: any) {
    log.error("[admin/stores DELETE] Delete failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete store" });
  }
});

// =============================================================================
// CORE-001: Store State Machine Endpoints
// =============================================================================

// GET /api/v1/admin/stores/pending - Get pending stores queue
// GO-LIVE-128: Requires 'stores:read' permission
adminStoresRouter.get("/stores/pending", requirePermission("stores", "read"), async (_req, res) => {
  try {
    const [stores, counts] = await Promise.all([
      getStoresByStatus([StoreStatus.PAYMENTS_SUBMITTED, StoreStatus.NEEDS_FIX], { limit: 50 }),
      getPendingStoresCount(),
    ]);

    return res.json({
      count: counts.total_pending,
      payments_submitted_count: counts.payments_submitted,
      needs_fix_count: counts.needs_fix,
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        status: store.status,
        device_bound: store.device_bound,
        kyc_complete: store.kyc_complete,
        upi_complete: store.upi_complete,
        status_reason: store.status_reason,
        status_updated_at: store.status_updated_at,
      })),
    });
  } catch (err: any) {
    log.error("[admin/stores/pending] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch pending stores" });
  }
});

// GET /api/v1/admin/stores/:storeId/application - Get full store application for review
// GO-LIVE-128: Requires 'stores:read' permission
adminStoresRouter.get("/stores/:storeId/application", requirePermission("stores", "read"), async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId || !UUID_PATTERN.test(storeId)) {
    return res.status(400).json({ error: "storeId must be a valid UUID" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Get store details with all fields
    const storeResult = await pool.query(
      `SELECT
        id::TEXT as id,
        name,
        code,
        store_code,
        store_type,
        status,
        upi_vpa,
        address,
        contact_name,
        contact_phone,
        contact_email,
        location,
        gstin,
        device_bound,
        kyc_complete,
        upi_complete,
        admin_approved,
        status_reason,
        status_updated_at,
        status_updated_by,
        created_at,
        updated_at
      FROM platform.stores
      WHERE id = $1::uuid AND status != 'deleted'`,
      [storeId]
    );

    const store = storeResult.rows[0];
    if (!store) {
      return res.status(404).json({ error: "store not found" });
    }

    // Get documents (if table exists)
    let documents: any[] = [];
    try {
      const docsResult = await pool.query(
        `SELECT id, document_type, file_url, verified, verified_at, needs_reupload, reupload_reason, uploaded_at
         FROM platform.store_documents
         WHERE store_id = $1
         ORDER BY uploaded_at DESC`,
        [storeId]
      );
      documents = docsResult.rows;
    } catch (e) {
      // Table may not exist yet
      log.info("[admin/stores/application] store_documents table not available");
    }

    // Get bound devices
    let devices: any[] = [];
    try {
      const devicesResult = await pool.query(
        `SELECT id, device_fingerprint, last_seen_online, created_at
         FROM pos_devices
         WHERE store_id = $1 AND active = true
         ORDER BY created_at DESC`,
        [storeId]
      );
      devices = devicesResult.rows;
    } catch (e) {
      log.info("[admin/stores/application] pos_devices query failed");
    }

    // Get status history
    let statusHistory: any[] = [];
    try {
      statusHistory = await getStoreStatusHistory(storeId, { limit: 20 });
    } catch (e) {
      log.info("[admin/stores/application] status history not available");
    }

    // Get payment details (masked)
    const payments = {
      upi_address: store.upi_vpa,
      bank_account_masked: null, // Will be populated when bank fields exist
      bank_ifsc: null,
      bank_name: null,
    };

    return res.json({
      store: {
        id: store.id,
        name: store.name,
        code: store.store_code || store.code,
        store_type: store.store_type,
        status: store.status,
        address: store.address,
        contact_name: store.contact_name,
        contact_phone: store.contact_phone,
        contact_email: store.contact_email,
        gstin: store.gstin,
        device_bound: store.device_bound ?? false,
        kyc_complete: store.kyc_complete ?? false,
        upi_complete: store.upi_complete ?? false,
        admin_approved: store.admin_approved ?? false,
        status_reason: store.status_reason,
        status_updated_at: store.status_updated_at,
        created_at: store.created_at,
      },
      documents,
      payments,
      devices,
      status_history: statusHistory,
    });
  } catch (err: any) {
    log.error("[admin/stores/application] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch store application" });
  }
});

// GET /api/v1/admin/stores/:storeId/status-history - Get store status history
// GO-LIVE-128: Requires 'stores:read' permission
adminStoresRouter.get("/stores/:storeId/status-history", requirePermission("stores", "read"), async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId || !UUID_PATTERN.test(storeId)) {
    return res.status(400).json({ error: "storeId must be a valid UUID" });
  }

  try {
    const history = await getStoreStatusHistory(storeId, { limit: 50 });
    return res.json({ status_history: history });
  } catch (err: any) {
    log.error("[admin/stores/status-history] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch status history" });
  }
});

// PATCH /api/v1/admin/stores/:storeId/status - Update store status (state machine)
// GO-LIVE-128: Requires 'stores:update' permission
// GO-LIVE-186: Rate limit status changes
adminStoresRouter.patch("/stores/:storeId/status", requirePermission("stores", "update"), adminStoreOperationsRateLimiter, async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId || !UUID_PATTERN.test(storeId)) {
    return res.status(400).json({ error: "storeId must be a valid UUID" });
  }

  const { status, reason } = req.body as { status?: string; reason?: string };

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  // Validate status is a valid StoreStatus
  const validStatuses = Object.values(StoreStatus) as string[];
  if (!validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({
      error: "invalid_status",
      message: `Status must be one of: ${validStatuses.join(", ")}`,
    });
  }

  const newStatus = status.toUpperCase() as StoreStatusType;

  // Get admin ID from token (if available)
  const adminId = (req as any).admin?.id || (req as any).adminId || null;

  try {
    // Get current status first for validation
    const currentStore = await getStoreStatus(storeId);
    if (!currentStore) {
      return res.status(404).json({ error: "store not found" });
    }

    // Check if transition is valid
    if (!isValidTransition(currentStore.status, newStatus)) {
      return res.status(400).json({
        error: "invalid_transition",
        message: `Cannot transition from ${currentStore.status} to ${newStatus}`,
        current_status: currentStore.status,
        valid_transitions: getValidTransitions(currentStore.status),
      });
    }

    // Perform the transition
    // SA-P0-001: Skip validation for admin-initiated reactivation (SUSPENDED→ACTIVE)
    // Matches reactivateStore() which uses skipValidation to bypass readiness flag checks
    const skipValidation = currentStore.status === "SUSPENDED" && newStatus === "ACTIVE";
    const result = await transitionStore(storeId, newStatus, {
      reason: reason || undefined,
      changedBy: adminId,
      changedByType: "admin",
      skipValidation,
    });

    if (!result.success) {
      return res.status(400).json({
        error: "transition_failed",
        message: result.error,
        previous_status: result.previousStatus,
      });
    }

    // Get updated status history
    const statusHistory = await getStoreStatusHistory(storeId, { limit: 5 });

    return res.json({
      store: {
        id: result.store!.id,
        name: result.store!.name,
        status: result.store!.status,
        device_bound: result.store!.device_bound,
        kyc_complete: result.store!.kyc_complete,
        upi_complete: result.store!.upi_complete,
        admin_approved: result.store!.admin_approved,
        status_reason: result.store!.status_reason,
        status_updated_at: result.store!.status_updated_at,
      },
      previous_status: result.previousStatus,
      status_history: statusHistory,
    });
  } catch (err: any) {
    log.error("[admin/stores/status] Update failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update store status" });
  }
});

// =============================================================================
// DEDUP-001: Duplicate Prevention - Admin Queue
// =============================================================================

// GET /api/v1/admin/duplicates
// Returns flagged potential duplicates for review
adminStoresRouter.get("/duplicates", requirePermission("stores", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "db_unavailable" });

  try {
    const { status = "pending", type, limit = "50", offset = "0" } = req.query;

    let query = `
      SELECT
        df.id,
        df.entity_type,
        df.entity_id,
        df.duplicate_type,
        df.duplicate_value,
        df.matching_entity_id,
        df.status,
        df.resolved_at,
        df.resolution_notes,
        df.created_at,
        s.name as entity_name,
        ms.name as matching_entity_name
      FROM platform.duplicate_flags df
      LEFT JOIN platform.stores s ON df.entity_type = 'store' AND df.entity_id = s.id
      LEFT JOIN platform.stores ms ON df.entity_type = 'store' AND df.matching_entity_id = ms.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND df.status = $${paramIndex++}`;
      params.push(status);
    }

    if (type) {
      query += ` AND df.duplicate_type = $${paramIndex++}`;
      params.push(type);
    }

    query += ` ORDER BY df.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string) || 50);
    params.push(parseInt(offset as string) || 0);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM platform.duplicate_flags df
      WHERE 1=1
    `;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND df.status = $${countParamIndex++}`;
      countParams.push(status);
    }
    if (type) {
      countQuery += ` AND df.duplicate_type = $${countParamIndex++}`;
      countParams.push(type);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    return res.json({
      duplicates: result.rows,
      pagination: {
        total,
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
      },
    });
  } catch (err: any) {
    log.error("[admin/duplicates] Error:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch duplicates" });
  }
});

// PATCH /api/v1/admin/duplicates/:id
// Resolve a duplicate flag
adminStoresRouter.patch("/duplicates/:id", requirePermission("stores", "update"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "db_unavailable" });

  const { id } = req.params;
  const { status, resolution_notes } = req.body;

  if (!status || !["resolved", "merged", "different"].includes(status)) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid status. Must be: resolved, merged, or different" });
  }

  try {
    const result = await pool.query(
      `UPDATE platform.duplicate_flags
       SET status = $1,
           resolution_notes = $2,
           resolved_at = NOW(),
           resolved_by = $3
       WHERE id = $4
       RETURNING *`,
      [status, resolution_notes || null, (req as any).adminUserId || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Duplicate flag not found" });
    }

    log.info(`[DEDUP-001] Resolved duplicate flag ${id} as ${status}`);

    return res.json({ success: true, duplicate: result.rows[0] });
  } catch (err: any) {
    log.error("[admin/duplicates] Resolve error:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to resolve duplicate" });
  }
});

// =============================================================================
// SA-P1-011: STOCK ADJUSTMENT AUDIT — SuperAdmin read-only endpoint
// =============================================================================

/**
 * GET /api/v1/admin/stores/:storeId/stock-adjustments
 * SA-P1-011: View stock adjustment history for any store (admin auth)
 *
 * Query params:
 * - from, to: date range (YYYY-MM-DD)
 * - productId: filter by product UUID
 * - reason: filter by adjustment_reason
 * - page, limit: pagination
 */
adminStoresRouter.get("/stores/:storeId/stock-adjustments", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = req.params;
  if (!storeId || !/^[0-9a-f-]{36}$/i.test(storeId)) {
    return res.status(400).json({ error: "Invalid storeId" });
  }

  const { from, to, productId, reason, page = "1", limit = "50" } = req.query;

  try {
    let whereClause = "WHERE il.store_id = $1 AND il.transaction_type = 'adjustment'";
    const params: unknown[] = [storeId];
    let paramIndex = 2;

    if (productId && typeof productId === "string") {
      whereClause += ` AND il.product_id = $${paramIndex}::uuid`;
      params.push(productId);
      paramIndex++;
    }

    if (reason && typeof reason === "string") {
      whereClause += ` AND il.adjustment_reason = $${paramIndex}`;
      params.push(reason);
      paramIndex++;
    }

    if (from && typeof from === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        return res.status(400).json({ error: "Invalid 'from' date format. Use YYYY-MM-DD." });
      }
      whereClause += ` AND il.created_at >= $${paramIndex}`;
      params.push(new Date(from as string).toISOString());
      paramIndex++;
    }

    if (to && typeof to === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: "Invalid 'to' date format. Use YYYY-MM-DD." });
      }
      whereClause += ` AND il.created_at <= $${paramIndex}`;
      const endOfDay = new Date(to as string);
      endOfDay.setUTCHours(23, 59, 59, 999);
      params.push(endOfDay.toISOString());
      paramIndex++;
    }

    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200);
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
    const offsetNum = (pageNum - 1) * limitNum;

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM inventory.inventory_ledger il ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    const result = await pool.query(
      `SELECT
        il.id,
        il.product_id as "productId",
        COALESCE(sp.display_name, p.name, 'Unknown Product') as "productName",
        il.stock_before as "oldQty",
        il.stock_after as "newQty",
        il.adjustment_reason as "reason",
        il.source as "adjustedBy",
        il.created_at as "adjustedAt",
        il.notes,
        il.reference_type as "referenceType"
      FROM inventory.inventory_ledger il
      LEFT JOIN catalog.store_products sp ON sp.store_id = il.store_id AND sp.product_id = il.product_id
      LEFT JOIN catalog.products p ON p.id = il.product_id
      ${whereClause}
      ORDER BY il.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    const adjustments = result.rows.map((row: any) => ({
      ...row,
      oldQty: Number(row.oldQty) || 0,
      newQty: Number(row.newQty) || 0,
    }));

    return res.json({
      success: true,
      adjustments,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err: any) {
    log.error("[SA-P1-011] Admin stock adjustments error:", err?.message);

    if (err?.code === "42P01") {
      return res.json({
        success: true,
        adjustments: [],
        total: 0,
        page: 1,
        limit: 50,
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to load stock adjustments" },
    });
  }
});
