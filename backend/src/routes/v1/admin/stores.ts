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

export const adminStoresRouter = Router();

// GO-LIVE-128: All admin store routes require admin token authentication
adminStoresRouter.use(requireAdminToken);

const UPI_VPA_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUpiVpa = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
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
  } catch (error: any) {
    if (error?.message === "store_exists") {
      return res.status(409).json({ error: "store_exists" });
    }
    return res.status(500).json({ error: "store_id_unavailable" });
  }

  // STORECODE-002: Generate human-readable store code from store name
  let storeCode: string;
  try {
    storeCode = await generateStoreCode(storeNameInput.value);
  } catch (error: any) {
    console.error("[stores] Failed to generate store code:", error);
    // Fallback to simple code if generator fails
    storeCode = `ST${Date.now().toString(36).toUpperCase()}`;
  }

  let result;
  try {
    result = await pool.query(
      `
        INSERT INTO platform.stores (id, name, code, status, created_at, updated_at)
        VALUES ($1::uuid, $2, $3, 'inactive', NOW(), NOW())
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
    console.error("[admin/stores] Store creation DB error:", err?.message, err?.code);
    return res.status(500).json({ error: "store_creation_failed" });
  }

  const store = result.rows[0];
  return res.status(201).json({ store: { ...store, storeName: store?.name, storeCode: store?.code, active: store?.status === "active" } });
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
      storeCode: row.store_code ?? row.code
    }));

    return res.json({ stores, total, limit, offset });
  } catch (error: any) {
    // Fallback: query only base columns if extended columns don't exist
    console.error("[admin/stores] Full query failed, trying base columns:", error?.message);
    try {
      const [countResult, result] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int as total FROM platform.stores`),
        pool.query(
          `SELECT id::TEXT as id, name, code, status, created_at, updated_at FROM platform.stores ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
      ]);
      const total = countResult.rows[0]?.total ?? 0;
      const stores = result.rows.map((row) => ({
        ...row,
        storeName: row.name,
        storeCode: row.code,
        active: row.status === "active"
      }));
      return res.json({ stores, total, limit, offset });
    } catch (fallbackErr: any) {
      console.error("[admin/stores] Fallback query also failed:", fallbackErr?.message);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch stores" });
    }
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

    return res.json({ store: { ...store, storeName: store.name, storeCode: store.store_code ?? store.code } });
  } catch (error: any) {
    console.error("[admin/stores/:storeId] Query failed:", error?.message);
    // Fallback with base columns
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
      const result = await pool.query(
        `SELECT id::TEXT as id, name, code, status, created_at, updated_at FROM platform.stores WHERE ${isUuid ? "id = $1::uuid" : "UPPER(code) = UPPER($1)"}`,
        [storeId]
      );
      const store = result.rows[0];
      if (!store) return res.status(404).json({ error: "store not found" });
      return res.json({ store: { ...store, storeName: store.name, storeCode: store.code, active: store.status === "active" } });
    } catch (fallbackErr: any) {
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch store" });
    }
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
    scan_lookup_v2_enabled: scanLookupV2EnabledSnake
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
    // Activate/deactivate store based on UPI VPA presence
    addUpdate("status", normalized ? "active" : "inactive");
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
      RETURNING id::TEXT as id, name, code, status, address, contact_name, contact_phone, contact_email, created_at, updated_at
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
      active: store.status === "active",
      contactName: store.contact_name,
      contactPhone: store.contact_phone,
      contactEmail: store.contact_email
    } });
  } catch (err: any) {
    console.error("[admin/stores PATCH] Update failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update store" });
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
    console.log(`[admin/stores] Store deleted: ${store.code} (${store.id})`);

    return res.json({ success: true, message: `Store ${store.code} has been deleted` });
  } catch (err: any) {
    console.error("[admin/stores DELETE] Delete failed:", err?.message);
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
    console.error("[admin/stores/pending] Query failed:", err?.message);
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
      console.log("[admin/stores/application] store_documents table not available");
    }

    // Get bound devices
    let devices: any[] = [];
    try {
      const devicesResult = await pool.query(
        `SELECT id, device_fingerprint, last_seen_at, created_at
         FROM pos.pos_devices
         WHERE store_id = $1 AND revoked_at IS NULL
         ORDER BY created_at DESC`,
        [storeId]
      );
      devices = devicesResult.rows;
    } catch (e) {
      console.log("[admin/stores/application] pos_devices query failed");
    }

    // Get status history
    let statusHistory: any[] = [];
    try {
      statusHistory = await getStoreStatusHistory(storeId, { limit: 20 });
    } catch (e) {
      console.log("[admin/stores/application] status history not available");
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
    console.error("[admin/stores/application] Query failed:", err?.message);
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
    console.error("[admin/stores/status-history] Query failed:", err?.message);
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
    const result = await transitionStore(storeId, newStatus, {
      reason: reason || undefined,
      changedBy: adminId,
      changedByType: "admin",
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
    console.error("[admin/stores/status] Update failed:", err?.message);
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
    console.error("[admin/duplicates] Error:", err?.message);
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

    console.log(`[DEDUP-001] Resolved duplicate flag ${id} as ${status}`);

    return res.json({ success: true, duplicate: result.rows[0] });
  } catch (err: any) {
    console.error("[admin/duplicates] Resolve error:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to resolve duplicate" });
  }
});
