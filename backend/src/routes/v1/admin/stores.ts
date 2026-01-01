import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";

export const adminStoresRouter = Router();

adminStoresRouter.use(requireAdminToken);

const UPI_VPA_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;

const normalizeUpiVpa = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
};

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
    kycStatus
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
    RETURNING id, name, upi_vpa, active, address, contact_name, contact_phone, contact_email, location, pos_device_id, kyc_status, upi_vpa_updated_at, upi_vpa_updated_by, created_at, updated_at
  `;
  values.push(storeId);

  const result = await pool.query(sql, values);
  const store = result.rows[0];
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  return res.json({ store: { ...store, storeName: store.name } });
});
