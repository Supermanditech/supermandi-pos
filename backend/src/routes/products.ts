import { Router } from "express";
import { getPool } from "../db/client";
import { requireDeviceToken } from "../middleware/deviceToken";
import { listInventoryVariants } from "../services/inventoryService";

export const productsRouter = Router();

// GET /api/products?barcode=...&q=...
productsRouter.get("/", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const barcode = typeof req.query.barcode === "string" ? req.query.barcode : undefined;
  const query = typeof req.query.q === "string" ? req.query.q : undefined;
  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const products = await listInventoryVariants({
      client: pool,
      storeId,
      barcode,
      query
    });
    return res.json({ products });
  } catch (error) {
    return res.status(500).json({ error: "failed to load products" });
  }
});
