import { randomUUID } from "crypto";
import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { generateStoreCode } from "../../../services/storeCodeService";

export const adminStoresRouter = Router();

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

const normalizeStoreNameInput = (value: unknown): { value?: string; error?: string } => {
  if (typeof value !== "string") return { error: "storeName_required" };
  const trimmed = value.trim();
  if (!trimmed) return { error: "storeName_required" };
  return { value: trimmed };
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
adminStoresRouter.post("/stores", async (req, res) => {
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
        INSERT INTO platform.stores (id, name, code, store_code, active, status, created_at, updated_at)
        VALUES ($1::uuid, $2, $3, $3, FALSE, 'inactive', NOW(), NOW())
        RETURNING id::TEXT as id,
          name,
          store_code,
          store_type,
          status,
          upi_vpa,
          active,
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
  return res.status(201).json({ store: { ...store, storeName: store?.name, storeCode: store?.store_code } });
});

// GET /api/v1/admin/stores
adminStoresRouter.get("/stores", async (_req, res) => {
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
adminStoresRouter.get("/stores/:storeId", async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
    const whereClause = isUuid ? "id = $1::uuid" : "(UPPER(store_code) = UPPER($1) OR UPPER(code) = UPPER($1))";
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
adminStoresRouter.patch("/stores/:storeId", async (req, res) => {
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

  if (storeName !== undefined) addUpdate("name", typeof storeName === "string" ? storeName.trim() : storeName);
  else if (name !== undefined) addUpdate("name", typeof name === "string" ? name.trim() : name);
  const upiVpaValue = upiVpa !== undefined ? upiVpa : upiVpaSnake;
  if (upiVpaValue !== undefined) {
    const normalized = normalizeUpiVpa(upiVpaValue);
    if (normalized === undefined) {
      return res.status(400).json({ error: "upi_vpa_invalid" });
    }
    if (normalized && !UPI_VPA_PATTERN.test(normalized)) {
      return res.status(400).json({ error: "upi_vpa_invalid" });
    }
    addUpdate("upi_vpa", normalized);
    addUpdate("active", Boolean(normalized));
    addUpdate("status", normalized ? "active" : "inactive");
    updates.push("upi_vpa_updated_at = NOW()");
    addUpdate("upi_vpa_updated_by", "superadmin");
  }
  if (address !== undefined) addUpdate("address", typeof address === "string" ? address.trim() : address);
  if (contactName !== undefined) addUpdate("contact_name", typeof contactName === "string" ? contactName.trim() : contactName);
  if (contactPhone !== undefined) addUpdate("contact_phone", typeof contactPhone === "string" ? contactPhone.trim() : contactPhone);
  if (contactEmail !== undefined) addUpdate("contact_email", typeof contactEmail === "string" ? contactEmail.trim() : contactEmail);
  if (location !== undefined) addUpdate("location", typeof location === "string" ? location.trim() : location);
  if (posDeviceId !== undefined) addUpdate("pos_device_id", typeof posDeviceId === "string" ? posDeviceId.trim() : posDeviceId);
  if (kycStatus !== undefined) addUpdate("kyc_status", typeof kycStatus === "string" ? kycStatus.trim() : kycStatus);
  const scanLookupV2Value = scanLookupV2Enabled !== undefined ? scanLookupV2Enabled : scanLookupV2EnabledSnake;
  if (scanLookupV2Value !== undefined) {
    if (typeof scanLookupV2Value !== "boolean") {
      return res.status(400).json({ error: "scanLookupV2Enabled must be boolean" });
    }
    addUpdate("scan_lookup_v2_enabled", scanLookupV2Value);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  updates.push(`updated_at = NOW()`);

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
  const sql = `
    UPDATE platform.stores
    SET ${updates.join(", ")}
    WHERE ${isUuid ? `id = $${values.length + 1}::uuid` : `store_code = $${values.length + 1}`}
    RETURNING id::TEXT as id, name, store_code, store_type, status, upi_vpa, active, address, contact_name, contact_phone, contact_email, location, pos_device_id, kyc_status, scan_lookup_v2_enabled, upi_vpa_updated_at, upi_vpa_updated_by, created_at, updated_at
  `;
  values.push(storeId);

  const result = await pool.query(sql, values);
  const store = result.rows[0];
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  return res.json({ store: { ...store, storeName: store.name, storeCode: store.store_code } });
});
