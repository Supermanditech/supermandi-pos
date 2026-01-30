import { randomUUID } from "crypto";
import { Router } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { generateStoreCode } from "../../../services/storeCodeService";
import { sanitizeHtml, validateEmail as validateEmailFn, validatePhone as validatePhoneFn, validatePinCode } from "@supermandi/common";

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
adminStoresRouter.post("/stores", requirePermission("stores", "create"), async (req, res) => {
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
    throw err;
  }

  const store = result.rows[0];
  return res.status(201).json({ store: { ...store, storeName: store?.name, storeCode: store?.code, active: store?.status === "active" } });
});

// GET /api/v1/admin/stores
// GO-LIVE-128: Requires 'stores:read' permission
adminStoresRouter.get("/stores", requirePermission("stores", "read"), async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await pool.query(
      `
        SELECT id::TEXT as id,
          name,
          code,
          store_code,
          store_type,
          status,
          upi_vpa,
          (status = 'active') AS active,
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
      `
    );

    const stores = result.rows.map((row) => ({
      ...row,
      storeName: row.name,
      storeCode: row.store_code ?? row.code
    }));

    return res.json({ stores });
  } catch (error: any) {
    // Fallback: query only base columns if extended columns don't exist
    console.error("[admin/stores] Full query failed, trying base columns:", error?.message);
    try {
      const result = await pool.query(
        `SELECT id::TEXT as id, name, code, status, created_at, updated_at FROM platform.stores ORDER BY created_at DESC`
      );
      const stores = result.rows.map((row) => ({
        ...row,
        storeName: row.name,
        storeCode: row.code,
        active: row.status === "active"
      }));
      return res.json({ stores });
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
          (status = 'active') AS active,
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
adminStoresRouter.patch("/stores/:storeId", requirePermission("stores", "update"), async (req, res) => {
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
adminStoresRouter.delete("/stores/:storeId", requirePermission("stores", "delete"), async (req, res) => {
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
