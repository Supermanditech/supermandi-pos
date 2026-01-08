import { randomUUID } from "crypto";
import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";

export const adminStoresRouter = Router();

adminStoresRouter.use(requireAdminToken);

const UPI_VPA_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;
const STORE_ID_PATTERN = /^[a-z0-9][a-z0-9-_]{2,}$/;

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
  if (!STORE_ID_PATTERN.test(trimmed)) return { error: "storeId_invalid" };
  return { value: trimmed };
};

const normalizeStoreNameInput = (value: unknown): { value?: string; error?: string } => {
  if (typeof value !== "string") return { error: "storeName_required" };
  const trimmed = value.trim();
  if (!trimmed) return { error: "storeName_required" };
  return { value: trimmed };
};

const generateStoreId = (): string => `store-${randomUUID().slice(0, 8)}`;

async function ensureUniqueStoreId(pool: ReturnType<typeof getPool>, preferredId?: string): Promise<string> {
  if (!pool) return generateStoreId();
  if (preferredId) {
    const existing = await pool.query(`SELECT id FROM stores WHERE id = $1`, [preferredId]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new Error("store_exists");
    }
    return preferredId;
  }

  for (let i = 0; i < 5; i += 1) {
    const candidate = generateStoreId();
    const existing = await pool.query(`SELECT id FROM stores WHERE id = $1`, [candidate]);
    if (!existing.rowCount) {
      return candidate;
    }
  }
  throw new Error("store_id_unavailable");
}

// POST /api/v1/admin/stores
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

  const result = await pool.query(
    `
      INSERT INTO stores (id, name, active, created_at, updated_at)
      VALUES ($1, $2, FALSE, NOW(), NOW())
      RETURNING id,
        name,
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
    [storeId, storeNameInput.value]
  );

  const store = result.rows[0];
  return res.status(201).json({ store: { ...store, storeName: store?.name } });
});

// GET /api/v1/admin/stores
adminStoresRouter.get("/stores", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const result = await pool.query(
    `
      SELECT id,
        name,
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
      FROM stores
      ORDER BY created_at DESC
    `
  );

  const stores = result.rows.map((row) => ({
    ...row,
    storeName: row.name
  }));

  return res.json({ stores });
});

// POST /api/v1/admin/stores
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

  const result = await pool.query(
    `
      INSERT INTO stores (id, name, active, created_at, updated_at)
      VALUES ($1, $2, FALSE, NOW(), NOW())
      RETURNING id,
        name,
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
    [storeId, storeNameInput.value]
  );

  const store = result.rows[0];
  return res.status(201).json({ store: { ...store, storeName: store?.name } });
});

// GET /api/v1/admin/stores/:storeId
adminStoresRouter.get("/stores/:storeId", async (req, res) => {
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const result = await pool.query(
    `
      SELECT id,
        name,
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
      FROM stores
      WHERE id = $1
    `,
    [storeId]
  );

  const store = result.rows[0];
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  return res.json({ store: { ...store, storeName: store.name } });
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
  if (upiVpa !== undefined) {
    const normalized = normalizeUpiVpa(upiVpa);
    if (normalized === undefined) {
      return res.status(400).json({ error: "upi_vpa_invalid" });
    }
    if (normalized && !UPI_VPA_PATTERN.test(normalized)) {
      return res.status(400).json({ error: "upi_vpa_invalid" });
    }
    addUpdate("upi_vpa", normalized);
    addUpdate("active", Boolean(normalized));
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

  const sql = `
    UPDATE stores
    SET ${updates.join(", ")}
    WHERE id = $${values.length + 1}
    RETURNING id, name, upi_vpa, active, address, contact_name, contact_phone, contact_email, location, pos_device_id, kyc_status, scan_lookup_v2_enabled, upi_vpa_updated_at, upi_vpa_updated_by, created_at, updated_at
  `;
  values.push(storeId);

  const result = await pool.query(sql, values);
  const store = result.rows[0];
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  return res.json({ store: { ...store, storeName: store.name } });
});
