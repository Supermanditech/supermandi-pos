import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";

export const posStoreRouter = Router();

// GET /api/v1/pos/stores/:storeId/status
posStoreRouter.get("/stores/:storeId/status", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  const result = await pool.query(
    `SELECT id, name, active FROM stores WHERE id = $1`,
    [storeId]
  );
  const store = result.rows[0];
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  return res.json({ storeId: store.id, active: Boolean(store.active), name: store.name });
});
