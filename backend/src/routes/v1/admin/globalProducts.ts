import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";

export const adminGlobalProductsRouter = Router();

adminGlobalProductsRouter.use(requireAdminToken);

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// PATCH /api/v1/admin/global-products/:globalProductId
adminGlobalProductsRouter.patch("/global-products/:globalProductId", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const globalProductId = typeof req.params.globalProductId === "string" ? req.params.globalProductId.trim() : "";
  if (!globalProductId) {
    return res.status(400).json({ error: "globalProductId is required" });
  }

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : null;
  const nextName =
    normalizeName(body?.global_name) ??
    normalizeName(body?.globalName) ??
    normalizeName(body?.name);

  if (!nextName) {
    return res.status(400).json({ error: "global_name is required" });
  }

  try {
    const updated = await pool.query(
      `
      UPDATE global_products
      SET global_name = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, global_name
      `,
      [nextName, globalProductId]
    );

    if ((updated.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "product_not_found" });
    }

    const row = updated.rows[0];
    return res.json({
      product: {
        id: String(row.id),
        global_name: String(row.global_name ?? "")
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "failed to update global product" });
  }
});
